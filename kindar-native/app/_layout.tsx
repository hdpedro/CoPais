import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, Linking, AppState, Animated } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
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
import { ToastProvider } from 'src/components/ui/ToastProvider';
import OfflineBanner from 'src/components/ui/OfflineBanner';

export default function RootLayout() {
  const { isLoading, initialize, userId } = useAuth();
  // OTA gating: enquanto `updateChecked=false`, mantemos splash visível.
  // Garante que o user NÃO vê o app no bundle antigo se um OTA está chegando
  // — splash fica → check → fetch → reload (mata JS) → app inicia no bundle
  // NOVO. Sem flicker visível de "app antigo aparece, depois recarrega".
  //
  // Em dev (Updates.isEnabled=false) inicializamos com true pra não bloquear.
  const [updateChecked, setUpdateChecked] = useState(!Updates.isEnabled);

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
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
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
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && lastState !== 'active') {
        registerForPushNotificationsAsync().catch(() => {});
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
function SplashScreen() {
  // Lazy init via useState — evita ESLint react-hooks/refs (acessar .current
  // durante render). Animated.Value é mutável, então o estado nunca muda.
  const [opacity] = useState(() => new Animated.Value(0));
  const [logoScale] = useState(() => new Animated.Value(0.85));
  useEffect(() => {
    // Container fade-in 280ms (timing) + logo spring (overshoot suave).
    // Spring config calibrada: tension 80 + friction 8 = bounce sutil (~2%),
    // não exagerado tipo iMessage. Apple HIG-style microinteraction.
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
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
      <Animated.View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: colors.brandLight,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          transform: [{ scale: logoScale }],
        }}
      >
        <Text style={{ fontSize: 32 }}>🏠</Text>
      </Animated.View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
        Kindar
      </Text>
      <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 24 }} />
      <StatusBar style="dark" />
    </Animated.View>
  );
}
