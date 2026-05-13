import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, Linking, AppState } from 'react-native';
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

export default function RootLayout() {
  const { isLoading, initialize, userId } = useAuth();

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

    // OTA "premium": com checkAutomatically=ON_LOAD o expo-updates baixa o
    // bundle novo em background, mas so APLICA na proxima abertura — o user
    // ve "estado antigo" depois de fechar/reabrir 1x e fica frustrado.
    // Aqui forcamos reload imediato logo apos o download terminar, no
    // cold start. So roda em release builds (Updates.isEnabled).
    if (Updates.isEnabled) {
      (async () => {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        } catch {
          // sem internet, fingerprint mismatch, ou erro de rede —
          // mantem o bundle atual; nao quebra o app.
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

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 64, height: 64, borderRadius: 20,
          backgroundColor: colors.brandLight,
          borderWidth: 1, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <Text style={{ fontSize: 32 }}>🏠</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>
          Kindar
        </Text>
        <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 24 }} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
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
        </View>
        </LockGate>
        </AnalyticsTree>
        <StatusBar style="dark" />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
