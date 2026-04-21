import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../src/store/auth';
import { setupOffline } from '../src/services/offline';
import { colors } from '../src/design-system/tokens';

export default function RootLayout() {
  const { isLoading, initialize } = useAuth();

  useEffect(() => {
    initialize();
    const cleanup = setupOffline();
    return cleanup;
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
        </Stack>
      </View>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}
