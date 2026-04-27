import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../src/store/auth';
import { useI18n } from '../src/i18n';
import { setupOffline } from '../src/services/offline';
import { installGlobalErrorHandlers } from '../src/lib/error-reporter';
import ErrorBoundary from '../src/components/ui/ErrorBoundary';
import {
  setupNotificationHandler,
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
} from '../src/services/push-setup';
import { initializeIAP, identifyUser, resetUser } from '../src/services/iap';
import { colors } from '../src/design-system/tokens';
import AIFab from '../src/components/ai/AIFab';
import AIAssistantSheet from '../src/components/ai/AIAssistantSheet';

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
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register for push + identify RevenueCat user after login
  useEffect(() => {
    if (!userId) {
      resetUser().catch(() => {});
      return;
    }
    registerForPushNotificationsAsync().catch(() => {});
    identifyUser(userId).catch(() => {});
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
          {/* Global floating Kindar AI: FAB visible on most screens, modal slides
              from bottom when opened. Both hidden on auth/onboarding/etc via
              path-matching inside AIFab. */}
          <AIFab />
          <AIAssistantSheet />
        </View>
        <StatusBar style="dark" />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
