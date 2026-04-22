import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { signInWithApple, signInWithGoogle } from '../../src/services/social-auth';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

export default function LoginScreen() {
  const { convite } = useLocalSearchParams<{ convite?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  async function handleLogin() {
    if (!email || !password) {
      setError('Preencha todos os campos');
      return;
    }
    setLoading(true);
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await signIn(email.trim().toLowerCase(), password);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const state = useAuth.getState();
      if (convite) {
        // Convite acceptance is handled via PWA URL — open in browser
        const { Linking } = await import('react-native');
        Linking.openURL(`https://kindar.com.br/convite/${convite}`);
        // Then reload auth state (user will now be in a group)
        setTimeout(() => useAuth.getState().loadActiveGroup(), 3000);
        router.replace('/(tabs)');
      } else {
        router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Erro ao entrar');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo — matches PWA KindarLogo component */}
        <View style={{ alignItems: 'center', marginBottom: spacing['5xl'] }}>
          <View style={{
            width: 64, height: 64, borderRadius: 16,
            backgroundColor: colors.bgSurface,
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
            overflow: 'hidden',
          }}>
            <Text style={{ fontSize: 34 }}>🏠</Text>
          </View>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: '300', color: colors.authText, letterSpacing: -0.3 }}>
            Kindar
          </Text>
          <Text style={{
            fontSize: font.sizes.xs, color: colors.authMuted, marginTop: spacing.xs,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>
            a rotina organizada · para toda a familia
          </Text>
        </View>

        {/* Convite Banner */}
        {convite ? (
          <View style={{
            backgroundColor: `${colors.authPrimary}10`, borderRadius: radius.md,
            padding: spacing.md, marginBottom: spacing.lg, alignItems: 'center',
          }}>
            <Text style={{ color: colors.authPrimary, fontWeight: font.weights.medium, fontSize: font.sizes.md }}>
              Voce foi convidado!
            </Text>
            <Text style={{ color: colors.authMuted, fontSize: font.sizes.sm, marginTop: 2 }}>
              Entre para aceitar o convite
            </Text>
          </View>
        ) : null}

        {/* Error */}
        {error ? (
          <View style={{
            backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md,
            borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)',
            padding: spacing.md, marginBottom: spacing.lg,
          }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Social Login Buttons */}
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            onPress={async () => {
              setLoading(true);
              const result = await signInWithApple();
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await useAuth.getState().initialize();
                const state = useAuth.getState();
                router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
              } else if (result.error !== 'Cancelado') {
                setError(result.error || 'Erro');
              }
              setLoading(false);
            }}
            style={{
              backgroundColor: '#000', borderRadius: radius.md,
              paddingVertical: spacing.md + 2, flexDirection: 'row',
              alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Ionicons name="logo-apple" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Entrar com Apple
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Platform rule: Google only on Android. iOS uses Apple only (above). */}
        {Platform.OS === 'android' ? (
          <TouchableOpacity
            onPress={async () => {
              setLoading(true);
              const result = await signInWithGoogle();
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await useAuth.getState().initialize();
                const state = useAuth.getState();
                router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
              } else if (result.error !== 'Login cancelado') {
                setError(result.error || 'Erro');
              }
              setLoading(false);
            }}
            style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.authBorder,
              paddingVertical: spacing.md + 2, flexDirection: 'row',
              alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="logo-google" size={16} color="#4285F4" />
            <Text style={{ color: colors.authText, fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Entrar com Google
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Divider — shown only when a social button is above (iOS/Android native) */}
        {(Platform.OS === 'ios' || Platform.OS === 'android') ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.authBorder }} />
            <Text style={{ paddingHorizontal: spacing.lg, fontSize: font.sizes.sm, color: colors.authMuted }}>
              ou entre com e-mail
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.authBorder }} />
          </View>
        ) : null}

        {/* Email */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
          E-mail
        </Text>
        <TextInput
          nativeID="email"
          testID="email-input"
          accessibilityLabel="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          placeholderTextColor={colors.authMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: colors.authBorder,
            paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.authText,
            marginBottom: spacing.lg,
          }}
        />

        {/* Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
          Senha
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.authBorder,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <TextInput
            nativeID="password"
            testID="password-input"
            accessibilityLabel="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            placeholderTextColor={colors.authMuted}
            secureTextEntry={!showPassword}
            autoComplete="password"
            style={{
              flex: 1, paddingVertical: spacing.md + 2,
              fontSize: font.sizes.md, color: colors.authText,
            }}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.authMuted} />
          </TouchableOpacity>
        </View>

        {/* Remember me + Forgot — matches PWA layout */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
          <TouchableOpacity
            onPress={() => setRememberMe(!rememberMe)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            activeOpacity={0.7}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 4,
              borderWidth: 1.5,
              borderColor: rememberMe ? colors.authPrimary : colors.authBorder,
              backgroundColor: rememberMe ? colors.authPrimary : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {rememberMe ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
            </View>
            <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>Lembrar-me</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.authPrimary }}>
              Esqueceu a senha?
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login Button — terracotta #C07055 to match PWA */}
        <TouchableOpacity
          testID="login-submit"
          accessibilityLabel="Entrar"
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            backgroundColor: colors.authPrimary, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Entrar
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign Up */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing['3xl'], gap: spacing.xs }}>
          <Text style={{ color: colors.authMuted, fontSize: font.sizes.sm }}>
            Ainda nao tem conta?
          </Text>
          <TouchableOpacity onPress={() => router.push('/auth/signup')}>
            <Text style={{ color: colors.authPrimary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
              Criar conta
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
