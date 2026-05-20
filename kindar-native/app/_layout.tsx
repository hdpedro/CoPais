import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Linking, AppState, Animated } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from 'src/store/auth';
import { useI18n } from 'src/i18n';
import { setupOffline } from 'src/services/offline';
import { installGlobalErrorHandlers } from 'src/lib/error-reporter';
import ErrorBoundary from 'src/components/ui/ErrorBoundary';
import {
  setupNotificationHandler,
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
} from 'src/services/push-setup';
import { initializeIAP, identifyUser, resetUser } from 'src/services/iap';
import * as analytics from 'src/lib/analytics';
import { colors } from 'src/design-system/tokens';
// AIFab removed 2026-05-05 — was overlapping buttons on other screens.
import AIAssistantSheet from 'src/components/ai/AIAssistantSheet';
import LockGate from 'src/components/LockGate';
import AnalyticsTree from 'src/components/AnalyticsTree';
import { ToastProvider, useToast } from 'src/components/ui/ToastProvider';
import OfflineBanner from 'src/components/ui/OfflineBanner';
// Asset estático do splash — ES import (regra eslint no-require-imports).
// Mesmo PNG que o native splash do Expo usa, garantindo continuidade visual.
import splashLogo from '../assets/splash-icon.png';

export default function RootLayout() {
  const { isLoading, initialize, userId } = useAuth();
  // OTA gating: enquanto `updateChecked=false`, mantemos splash visível.
  // Garante que o user NÃO vê o app no bundle antigo se um OTA está chegando
  // — splash fica → check → fetch → reload (mata JS) → app inicia no bundle
  // NOVO. Sem flicker visível de "app antigo aparece, depois recarrega".
  //
  // Em dev (Updates.isEnabled=false) inicializamos com true pra não bloquear.
  const [updateChecked, setUpdateChecked] = useState(!Updates.isEnabled);
  // OTA "post-reload toast": flag setada antes de Updates.reloadAsync() é lida
  // depois do reload pra mostrar "App atualizado" — converte o que user percebia
  // como "fechou sozinho" (bug Carolina 2026-05-20) em "ah, foi atualização".
  const [showOtaToast, setShowOtaToast] = useState(false);

  // One-time setup: error handlers FIRST (so any crash in the rest of the
  // bootstrap is captured) + offline sync + push handler + RevenueCat + i18n
  useEffect(() => {
    installGlobalErrorHandlers();
    initialize();
    // Hydrate persisted locale before any screen renders translated strings.
    useI18n.getState().hydrate();
    const cleanup = setupOffline();
    setupNotificationHandler();
    // RevenueCat pode inicializar antes do login (anon user); quando userId
    // aparecer, o effect abaixo chama identifyUser() pra fazer o link.
    initializeIAP().catch(() => {});
    // Analytics: bootstrap antes do primeiro evento. $app_opened de ciclo
    // de vida cobre DAU/MAU sem instrumentar tela. identify acontece no
    // effect [userId] abaixo, mesmo padrão do RevenueCat.
    analytics.initAnalytics();

    // OTA "premium" (atualizado 2026-05-19): com checkAutomatically=ON_LOAD
    // o expo-updates baixa o bundle novo em background e o `Updates.reload-
    // Async()` aplica imediatamente. PORÉM, sem gating o user via o app
    // brevemente no bundle antigo antes do reload disparar (flicker de
    // ~500ms-2s). Solução: bloquear `isLoading→false` até OTA check
    // terminar — splash continua visível durante checkForUpdateAsync +
    // fetchUpdateAsync + reloadAsync. Quando reload mata o JS engine, o
    // app reinicia já no bundle novo, e o splash some quando o novo bundle
    // termina de hidratar. User vê: 1 splash → app correto. Sem flicker.
    //
    // Failsafe: timeout 4s pra cobrir rede travada — se passar disso sem
    // resposta do server EAS, libera mesmo no bundle antigo (network grace-
    // ful degradation). Sem timeout, app travaria no splash pra users
    // offline ou com EAS Updates fora do ar.
    if (Updates.isEnabled) {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        setUpdateChecked(true);
      };
      const failsafe = setTimeout(release, 4000);
      (async () => {
        try {
          // Lê flag de reload prévio. Se TRUE, esse boot é após um reload
          // OTA — mostra toast e limpa a flag. Bug Carolina 2026-05-20:
          // sem feedback, user achava que app "fechou sozinho".
          try {
            const flag = await AsyncStorage.getItem('kindar.ota_reload_pending');
            if (flag === '1') {
              setShowOtaToast(true);
              await AsyncStorage.removeItem('kindar.ota_reload_pending');
            }
          } catch { /* AsyncStorage indisponível — toast cosmético, não bloqueia */ }

          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Marca pendência ANTES do reload pra próximo boot mostrar toast.
            try { await AsyncStorage.setItem('kindar.ota_reload_pending', '1'); } catch {}
            // reloadAsync mata o JS engine; nunca retorna. Splash já é o
            // último que o user vê do bundle atual.
            await Updates.reloadAsync();
            return; // unreachable
          }
        } catch {
          // sem internet, fingerprint mismatch, ou erro de rede —
          // mantem o bundle atual; nao quebra o app.
        } finally {
          clearTimeout(failsafe);
          release();
        }
      })();
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register for push + identify RevenueCat user after login. Tambem re-tenta
  // o registro APNs/FCM toda vez que o app volta pro foreground — cobre o
  // cenario onde o registro inicial falhou (sem internet, backend instavel)
  // e o token nunca foi salvo no DB. Idempotente no backend (dedup por user
  // + token), entao executar varias vezes nao gera duplicatas.
  useEffect(() => {
    if (!userId) {
      resetUser().catch(() => {});
      analytics.reset();
      return;
    }
    registerForPushNotificationsAsync().catch(() => {});
    identifyUser(userId).catch(() => {});
    analytics.identify(userId);

    let lastState = AppState.currentState;
    let lastBackgroundAt = 0;
    const sub = AppState.addEventListener('change', async (next) => {
      // OTA auto-apply on long-background resume (2026-05-19):
      // se o user mandou app pro background há MAIS QUE 5 minutos E há OTA
      // pendente baixado, reload silencioso. User espera o app "rebooting"
      // depois de tanto tempo em background, então o splash do reload se
      // funde com o resume — invisível.
      if (next === 'background' || next === 'inactive') {
        lastBackgroundAt = Date.now();
      }
      if (next === 'active' && lastState !== 'active') {
        // Re-register push (idempotente)
        registerForPushNotificationsAsync().catch(() => {});

        // OTA auto-apply: só age se ficou > 30min em background.
        // Bug Carolina 2026-05-20: threshold antigo de 5min disparava
        // muito frequente — toda saída pro WhatsApp / notificações de
        // 5+ minutos triggava reload no resume. Visualmente parece "app
        // fechou sozinho". 30min é mais conservador: cobre o caso de
        // "voltou no dia seguinte" sem incomodar quem só foi ver msg.
        const longBackground = lastBackgroundAt > 0 && Date.now() - lastBackgroundAt > 30 * 60 * 1000;
        if (longBackground && Updates.isEnabled) {
          try {
            // Verifica se há update pendente baixado (não baixa agora pra
            // não atrasar resume; checkAutomatically=ON_LOAD + splash gate
            // já cobrem o caso de cold start).
            const u = await Updates.checkForUpdateAsync();
            if (u.isAvailable) {
              await Updates.fetchUpdateAsync();
              // Flag pra próximo boot mostrar toast "App atualizado".
              try { await AsyncStorage.setItem('kindar.ota_reload_pending', '1'); } catch {}
              await Updates.reloadAsync();
            }
          } catch {
            // sem internet, fingerprint mismatch — mantém atual.
          }
        }
      }
      lastState = next;
    });
    return () => sub.remove();
  }, [userId]);

  // Navigate on notification tap
  useEffect(() => {
    const remove = addNotificationResponseListener(url => {
      if (!url) return;
      // Parse full URLs (kindar://...) via Linking, relative paths via router
      if (url.startsWith('http') || url.startsWith('kindar://')) {
        Linking.openURL(url).catch(() => {});
      } else {
        router.push(url as Parameters<typeof router.push>[0]);
      }
    });
    return remove;
  }, []);

  // Splash visível enquanto auth carrega OU OTA check pendente.
  // Ordem: primeiro garante bundle correto (OTA), depois auth.
  if (isLoading || !updateChecked) {
    return <SplashScreen />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ToastProvider>
        {/* Bug Carolina 2026-05-20: app fechou sozinho 2x. Causa: auto-reload
            OTA no resume após >5min reseta a view sem feedback. Fix: aumenta
            threshold pra 30min E mostra esse toast no boot pós-reload pra
            converter "fechou sozinho" em "ah, atualização". */}
        <OtaUpdatedToastTrigger show={showOtaToast} onShown={() => setShowOtaToast(false)} />
        <AnalyticsTree>
        <LockGate>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}>
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="auth" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="chat" />
            <Stack.Screen name="saude" />
            <Stack.Screen name="despesas" />
            <Stack.Screen name="calendario" />
            <Stack.Screen name="financeiro" />
            <Stack.Screen name="atividades" />
            <Stack.Screen name="eventos" />
            <Stack.Screen name="criancas" />
            <Stack.Screen name="familia" />
            <Stack.Screen name="perfil" />
            <Stack.Screen name="notificacoes" />
            <Stack.Screen name="documentos" />
            <Stack.Screen name="acordos" />
            <Stack.Screen name="decisoes" />
            <Stack.Screen name="checkin" />
            <Stack.Screen name="escola" />
            <Stack.Screen name="notas" />
            <Stack.Screen name="temas-sensiveis" />
            <Stack.Screen name="semana" />
            <Stack.Screen name="pricing" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ai" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
          {/* Kindar AI assistant — FAB removido em 2026-05-05 a pedido do
              usuário (estava sobrepondo botões de outras telas em iOS+Android).
              Sheet permanece montado pra ser aberto via outros gatilhos
              (header sparkle button do dashboard, deep link /ai, etc.). */}
          <AIAssistantSheet />
          {/* Banner global de offline/sync. Vive acima das telas via absolute
              positioning + zIndex; gated por estar dentro de LockGate (não
              mostra durante o lock screen). */}
          <OfflineBanner />
        </View>
        </LockGate>
        </AnalyticsTree>
        </ToastProvider>
        <StatusBar style="dark" />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

/**
 * Mostra toast "App atualizado" uma única vez após reload OTA.
 * Vive dentro do ToastProvider — só assim consegue chamar useToast().
 *
 * Bug Carolina (DM Angelino 2026-05-20): user via app "fechar sozinho 2×"
 * porque o reload OTA é silencioso. Esse trigger transforma o reset visual
 * em feedback positivo: "Kindar atualizado ✓".
 */
function OtaUpdatedToastTrigger({ show, onShown }: { show: boolean; onShown: () => void }) {
  const toast = useToast();
  useEffect(() => {
    if (!show) return;
    // Pequeno delay pra splash sumir antes do toast — animation mais limpa.
    const id = setTimeout(() => {
      toast.show({ message: 'Kindar atualizado para a última versão', variant: 'success', durationMs: 3200 });
      onShown();
    }, 600);
    return () => clearTimeout(id);
  }, [show, toast, onShown]);
  return null;
}

/**
 * Splash interno do app — vive enquanto auth/i18n/etc. estão hidratando.
 * Não confundir com o native splash do Expo (controlado por expo-splash-screen
 * + app.json/splash), que aparece ANTES do React montar. Este aqui é o fallback
 * "JS já bootou mas estado ainda não chegou".
 *
 * Antes era um hard cut quando isLoading virava false. Agora fazemos um fade-in
 * de 280ms ao montar pra suavizar a transição splash → dashboard. O fade-out
 * acontece naturalmente quando isLoading vira false (React desmonta e remonta
 * o conteúdo abaixo).
 */
/**
 * SplashScreen premium — paridade visual com o native splash do Expo.
 *
 * Bug Henrique 2026-05-20 ("logo genérico, vamos trabalhar num visual premium
 * digno de app de milhões"): a versão anterior usava emoji 🏠 num quadrado
 * arredondado pequeno + ActivityIndicator. Visual amador entre o native
 * splash premium (logo cradle hands full-screen) e o dashboard.
 *
 * Nova versão:
 *   - Image real do logo Kindar (splash-icon.png) — 144x144, sem wrapper.
 *     Continua o visual do native splash: zero "salto de marca".
 *   - Wordmark "Kindar" abaixo (consistência com PWA + tab bar).
 *   - 3 dots pulsando como loader (substitui ActivityIndicator genérico).
 *     Animação sequencial, brand color, escala de 0.7 → 1.0 + opacity.
 *   - Logo respirando (loop sutil scale 1.0 ↔ 1.03 a cada ~2.8s) após
 *     entrada — micro-vida sem distrair.
 *   - Entrance: opacity 0→1 (320ms) + spring scale 0.92→1 (tension 100).
 *
 * Tudo via useNativeDriver=true → 60fps mesmo durante hidratação pesada.
 */
function SplashScreen() {
  const [opacity] = useState(() => new Animated.Value(0));
  const [logoScale] = useState(() => new Animated.Value(0.92));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 100,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      // Breathing loop — só inicia DEPOIS da entrada, pra não conflitar.
      // Scale 1.0 → 1.03 → 1.0 a cada 2.8s. Imperceptível mas dá vida.
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.03,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1.0,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, [opacity, logoScale]);
  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <Animated.Image
        source={splashLogo}
        style={{
          width: 144,
          height: 144,
          transform: [{ scale: logoScale }],
        }}
        resizeMode="contain"
      />
      <Text
        style={{
          fontSize: 28,
          fontWeight: '800',
          color: colors.text,
          letterSpacing: -0.6,
          marginTop: 16,
        }}
      >
        Kindar
      </Text>
      <PulsingDots />
      <StatusBar style="dark" />
    </Animated.View>
  );
}

/**
 * Loader premium — 3 dots pulsando sequencialmente. Substitui o
 * ActivityIndicator genérico (visual de form Android). Pattern usado em
 * apps como Linear, Notion, Things: discreto, brand-colored, com timing
 * orgânico (delay sequencial + ease-in-out).
 */
function PulsingDots() {
  const [d0] = useState(() => new Animated.Value(0.35));
  const [d1] = useState(() => new Animated.Value(0.35));
  const [d2] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const cycle = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.35,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(400 - delay),
        ]),
      );
    const animations = [cycle(d0, 0), cycle(d1, 200), cycle(d2, 400)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [d0, d1, d2]);
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 32 }}>
      {[d0, d1, d2].map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.brand,
            opacity: dot,
            transform: [{ scale: dot }],
          }}
        />
      ))}
    </View>
  );
}
