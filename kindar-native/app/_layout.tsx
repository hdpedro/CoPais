/* eslint-disable react-hooks/immutability -- Reanimated SharedValue.value
   é mutável por design (essa é a API da lib). React Compiler trata todo
   retorno de hook como imutável, mas isso é um falso positivo aqui. */
import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Linking, AppState } from 'react-native';
import Animated, {
  FadeInUp,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
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
  const splashVisible = isLoading || !updateChecked;

  // Haptic sutil quando o app fica pronto — Apple HIG style. Roda 1× só.
  // useRef em vez de useState pra evitar re-render (não precisamos rerenderizar
  // o RootLayout só pra marcar que o haptic já rodou) e evitar o warning
  // react-hooks/set-state-in-effect.
  const readyHapticDoneRef = useRef(false);
  useEffect(() => {
    if (!splashVisible && !readyHapticDoneRef.current) {
      Haptics.selectionAsync().catch(() => {});
      readyHapticDoneRef.current = true;
    }
  }, [splashVisible]);

  if (splashVisible) {
    return <SplashScreen isLoading={isLoading} />;
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
 * SplashScreen com assinatura emocional Kindar — coordenação familiar
 * premium, não fintech, não AI startup.
 *
 * Bug Henrique 2026-05-20: pediu "premium digno de milhões de usuários",
 * depois deu direção cirúrgica pra subir de "premium tech" pra "emotional
 * premium Kindar". Choreography resultante:
 *
 *   t=0     Background cream fade-in (200ms)
 *   t=200   Logo entra (spring overshoot 0.5→1.05→1.0, damping 14)
 *   t=400   Glow CHAMPAGNE (#F6EBDD) expande — acolhimento, não tech
 *   t=400+  4 dots CONSTELAÇÃO aparecem staggered (N→E→S→O cada 200ms)
 *           — "elementos da rotina se conectando ao centro"
 *   t=700   Wordmark "Kindar" entra (FadeInUp bezier cubic)
 *   t=1100  Tagline com TRACKING EXPAND (letter-spacing 0.5→2.5px)
 *   t=1380  BREATHING UNDERLINE inicia (Arc Browser style, brand 1px)
 *   Idle:   Logo respira (só durante isLoading=true), constelação
 *           orbita lento (60s rotação), underline respirando.
 *   Ready:  Logo breathing para suave, haptic, splash dissolve
 *           cinematicamente.
 *
 * Tudo via Reanimated 4 shared values → 60fps GPU mesmo na hidratação.
 *
 * Sobre a constelação: 4 dots orbitando representam abstratamente a
 * coordenação familiar — múltiplos pontos conectados a um centro (lar).
 * Sem "kid app cliché" (mochila/coração/check). Identidade visual única.
 */
const CHAMPAGNE = '#F6EBDD';
const CONSTELLATION_RADIUS = 78;
const CONSTELLATION_POSITIONS = [
  -Math.PI / 2, // N
  0,             // E
  Math.PI / 2,   // S
  Math.PI,       // W
];

function SplashScreen({ isLoading }: { isLoading: boolean }) {
  const t = useI18n((s) => s.t);

  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);
  const orbitProgress = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const taglineTracking = useSharedValue(0.5);
  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(6);

  useEffect(() => {
    // === Entrada do logo ===
    logoOpacity.value = withTiming(1, { duration: 400 });
    logoScale.value = withDelay(
      200,
      withSpring(1, { damping: 14, stiffness: 110 }),
    );

    // === Glow champagne (one-shot, warm acolhimento) ===
    glowScale.value = withDelay(
      400,
      withTiming(1.4, {
        duration: 1200,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
    );
    glowOpacity.value = withDelay(
      400,
      withSequence(
        withTiming(0.18, { duration: 400 }),
        withTiming(0, { duration: 800 }),
      ),
    );

    // === Tagline tracking expand + slide-up ===
    taglineY.value = withDelay(1100, withTiming(0, { duration: 420 }));
    taglineOpacity.value = withDelay(
      1100,
      withTiming(0.55, { duration: 380 }),
    );
    taglineTracking.value = withDelay(
      1100,
      withTiming(2.5, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      }),
    );

    // === Breathing underline (Arc Browser style) ===
    underlineWidth.value = withDelay(
      1380,
      withRepeat(
        withSequence(
          withTiming(80, {
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );

    // === Constelação orbita lento — 60s pra dar uma volta completa ===
    orbitProgress.value = withRepeat(
      withTiming(1, { duration: 60_000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [
    logoOpacity,
    logoScale,
    glowScale,
    glowOpacity,
    taglineY,
    taglineOpacity,
    taglineTracking,
    underlineWidth,
    orbitProgress,
  ]);

  // Logo breathing — só roda enquanto isLoading=true. Quando vira false,
  // assenta suavemente em scale=1 (evita pulo). Trick anti-"loading eterno":
  // quando o app fica pronto o logo PARA de respirar — sinal subconsciente
  // de "chegamos".
  useEffect(() => {
    if (isLoading) {
      logoScale.value = withDelay(
        1400,
        withRepeat(
          withSequence(
            withTiming(1.025, {
              duration: 1400,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(1.0, {
              duration: 1400,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(logoScale);
      logoScale.value = withTiming(1.0, { duration: 280 });
    }
  }, [isLoading, logoScale]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const underlineStyle = useAnimatedStyle(() => ({
    width: underlineWidth.value,
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    letterSpacing: taglineTracking.value,
    transform: [{ translateY: taglineY.value }],
  }));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Glow champagne atrás do logo — warm, acolhedor, NOT tech */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: CHAMPAGNE,
            },
            glowStyle,
          ]}
        />
        {/* Constelação — 4 dots orbitando em torno do logo */}
        {CONSTELLATION_POSITIONS.map((angle, i) => (
          <ConstellationDot
            key={i}
            angle={angle}
            orbitProgress={orbitProgress}
            staggerDelay={400 + i * 200}
          />
        ))}
        {/* Logo real (mesmo PNG do native splash — continuidade visual) */}
        <Animated.Image
          source={splashLogo}
          style={[{ width: 144, height: 144 }, logoStyle]}
          resizeMode="contain"
        />
      </View>
      {/* Wordmark com FadeInUp + easing cubic-out (Apple HIG soft-land) */}
      <Animated.Text
        entering={FadeInUp.delay(700)
          .duration(420)
          .easing(Easing.out(Easing.cubic))}
        style={{
          fontSize: 32,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -1.0,
          marginTop: 22,
        }}
      >
        Kindar
      </Animated.Text>
      {/* Breathing underline (Arc Browser style) abaixo do wordmark */}
      <Animated.View
        style={[
          {
            height: 1.5,
            backgroundColor: colors.brand,
            marginTop: 6,
            opacity: 0.4,
            borderRadius: 1,
          },
          underlineStyle,
        ]}
      />
      {/* Tagline com tracking expand — micro signature emocional */}
      <Animated.Text
        style={[
          {
            fontSize: 10,
            color: colors.textMuted,
            marginTop: 12,
            textTransform: 'uppercase',
            fontWeight: '500',
          },
          taglineStyle,
        ]}
      >
        {t('splash.tagline')}
      </Animated.Text>
      <StatusBar style="dark" />
    </View>
  );
}

/**
 * ConstellationDot — micro-ponto que aparece staggered e depois orbita
 * lentamente em torno do logo. 4 deles formam uma constelação abstrata,
 * sugerindo "elementos da rotina se conectando ao centro" sem ser literal.
 *
 * - Aparecer: opacity 0→0.35 + scale 0.3→1 com spring
 * - Orbit: angle base + 2π × progress (60s rotação completa)
 */
function ConstellationDot({
  angle,
  orbitProgress,
  staggerDelay,
}: {
  angle: number;
  orbitProgress: SharedValue<number>;
  staggerDelay: number;
}) {
  const appearOpacity = useSharedValue(0);
  const appearScale = useSharedValue(0.3);

  useEffect(() => {
    appearOpacity.value = withDelay(
      staggerDelay,
      withTiming(0.35, { duration: 500 }),
    );
    appearScale.value = withDelay(
      staggerDelay,
      withSpring(1, { damping: 12, stiffness: 90 }),
    );
  }, [appearOpacity, appearScale, staggerDelay]);

  const style = useAnimatedStyle(() => {
    const currentAngle = angle + orbitProgress.value * Math.PI * 2;
    const x = Math.cos(currentAngle) * CONSTELLATION_RADIUS;
    const y = Math.sin(currentAngle) * CONSTELLATION_RADIUS;
    return {
      opacity: appearOpacity.value,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: appearScale.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: colors.brand,
        },
        style,
      ]}
    />
  );
}
