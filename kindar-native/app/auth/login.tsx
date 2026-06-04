import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

const REMEMBER_KEY = '@kindar_remember_email';
import { useAuth } from 'src/store/auth';
import {
  signInWithApple,
  signInWithGoogleToken,
  signInWithGoogleNative,
  GOOGLE_IOS_CLIENT_ID_EXPORTED,
  GOOGLE_ANDROID_CLIENT_ID_EXPORTED,
  GOOGLE_SIGN_IN_CONFIGURED,
} from 'src/services/social-auth';
import { supabase } from 'src/lib/supabase';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

// Required by expo-auth-session: completes the in-app browser session
// once Google's redirect lands back in the app (kindar:// scheme).
WebBrowser.maybeCompleteAuthSession();

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

// Mirrors PWA `OnboardingPage` auto-accept: any pending invitation matching
// the user's email gets accepted server-side. Idempotent — safe to call after
// every sign-in. Returns true if a group was joined.
async function tryAutoAcceptInvitation(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const resp = await fetch(`${WEB_URL}/api/onboarding/auto-accept-invitation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return !!data.accepted;
  } catch {
    return false;
  }
}

export default function LoginScreen() {
  const { convite } = useLocalSearchParams<{ convite?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Mostra botao "Reenviar email" quando o login falha com email nao confirmado.
  // Cobre o cenario do Brenno (2026-05-12): usuario cadastrou mas o email de
  // confirmacao caiu em spam/foi bloqueado por falta de SPF+DMARC (resolvido).
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const { signIn, resendConfirmation } = useAuth();
  const t = useI18n(s => s.t);

  // onBlur validation — feedback inline antes do submit (padrão premium
  // Cash App / Robinhood / Linear). Não bloqueia o botão; o submit continua
  // valendo com o gating `disabled={loading}` original.
  function validateEmailField(value: string): string | null {
    if (!value.trim()) return t('validation.field.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return t('validation.field.emailInvalid');
    return null;
  }
  function validatePasswordField(value: string): string | null {
    if (!value) return t('validation.field.passwordRequired');
    if (value.length < 6) return t('validation.field.passwordTooShort');
    return null;
  }

  // Native Google sign-in via expo-auth-session.
  // Mirrors GripFlow's working setup (gripflow-native/app/auth/login.tsx):
  //   - iosClientId / androidClientId are the platform OAuth Client IDs
  //     configured in Google Cloud (the Android one is keystore-bound, so it
  //     comes from EAS env `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`)
  //   - reversed scheme is registered in app.json → ios.CFBundleURLTypes
  //   - the resulting id_token is POSTed to /api/auth/google-native
  // Both ids are passed unconditionally because `useIdTokenAuthRequest`'s
  // invariant only checks the platform-relevant one; the constants in
  // `social-auth.ts` carry safe non-empty placeholders so the hook never
  // crashes on mount when the env var is missing. The button is gated by
  // `GOOGLE_SIGN_IN_CONFIGURED` so unconfigured platforms can't tap it.
  const [, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID_EXPORTED,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID_EXPORTED,
  });

  // Defined BEFORE the useEffect that calls it so the lint rule
  // react-hooks/immutability stays happy (no hoisted access). Handles
  // both success and the no-token edge case so the effect itself
  // never calls setState directly (react-hooks/set-state-in-effect).
  async function completeGoogleLogin(idToken: string | undefined) {
    if (!idToken) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(t('auth.googleNoTokenReturned'));
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await signInWithGoogleToken(idToken);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAuth.getState().initialize();
      const accepted = await tryAutoAcceptInvitation();
      if (accepted) await useAuth.getState().loadActiveGroup();
      const state = useAuth.getState();
      router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || t('auth.googleSignInError'));
    }
    setLoading(false);
  }

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    // Defer to next tick so setState calls inside completeGoogleLogin
    // don't fire synchronously inside the effect (react-hooks/set-state-in-effect).
    queueMicrotask(() => void completeGoogleLogin(googleResponse.params?.id_token));
    // completeGoogleLogin é estável (defined acima na mesma renderização) e
    // só usa state setters do auth store + setError, ambos identidade fixa.
    // Adicionar nas deps causaria re-execução desnecessária a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  // Hydrate persisted email on mount (rememberMe). Improves UX for users
  // who log in/out repeatedly — Mobile autofill is less reliable than
  // browser autofill, so we keep our own copy. Password is NEVER stored.
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then((stored) => {
      if (stored) {
        setEmail(stored);
        setRememberMe(true);
      }
    }).catch(() => {});
  }, []);

  async function handleLogin() {
    if (!email || !password) {
      setError('Preencha todos os campos');
      return;
    }
    setLoading(true);
    setError('');
    setEmailNotConfirmed(false);
    setResendStatus('idle');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await signIn(email.trim().toLowerCase(), password);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Persist or clear remembered email based on the checkbox state.
      if (rememberMe) {
        AsyncStorage.setItem(REMEMBER_KEY, email.trim().toLowerCase()).catch(() => {});
      } else {
        AsyncStorage.removeItem(REMEMBER_KEY).catch(() => {});
      }
      // Always try auto-accept (mirrors PWA): if the user signed up via
      // invite link, the email-matched invitation gets accepted server-side
      // before we route. Idempotent for users without pending invites.
      const accepted = await tryAutoAcceptInvitation();
      if (accepted) {
        await useAuth.getState().loadActiveGroup();
      }
      const state = useAuth.getState();
      router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Erro ao entrar');
      // Detecta "email nao confirmado" pra revelar o botao de reenvio.
      // Match estavel por errorCode (Supabase auth-js code), nao por string.
      // Antes (ate 2026-05-22 / Bruna) dependiamos do texto PT-BR e quebraria
      // se a copy mudasse ou o build estivesse com bundle desatualizado.
      if (result.errorCode === 'email_not_confirmed') {
        setEmailNotConfirmed(true);
      }
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
            {t('auth.tagline')}
          </Text>
        </View>

        {/* Convite Banner */}
        {convite ? (
          <View style={{
            backgroundColor: `${colors.authPrimary}10`, borderRadius: radius.md,
            padding: spacing.md, marginBottom: spacing.lg, alignItems: 'center',
          }}>
            <Text style={{ color: colors.authPrimary, fontWeight: font.weights.medium, fontSize: font.sizes.md }}>
              {t('auth.invited')}
            </Text>
            <Text style={{ color: colors.authMuted, fontSize: font.sizes.sm, marginTop: 2 }}>
              {t('auth.invitedLoginHint')}
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
            {/* CTA inline: reenviar email quando a conta nao foi confirmada.
                Antes o user ficava preso sem saber o que fazer (Brenno 2026-05-12). */}
            {emailNotConfirmed && resendStatus !== 'sent' ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={resendStatus === 'sending' ? 'Reenviando e-mail de confirmação' : 'Reenviar e-mail de confirmação'}
                accessibilityState={{ disabled: resendStatus === 'sending', busy: resendStatus === 'sending' }}
                onPress={async () => {
                  if (!email) {
                    setError('Digite seu e-mail acima primeiro');
                    return;
                  }
                  setResendStatus('sending');
                  Haptics.selectionAsync();
                  const r = await resendConfirmation(email);
                  if (r.success) {
                    setResendStatus('sent');
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } else {
                    setResendStatus('error');
                    setError(r.error || 'Não consegui reenviar. Tente em alguns minutos.');
                  }
                }}
                disabled={resendStatus === 'sending'}
                style={{
                  marginTop: spacing.sm,
                  paddingVertical: spacing.xs,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                }}
              >
                <Ionicons name="mail-outline" size={14} color={colors.authPrimary} />
                <Text style={{ color: colors.authPrimary, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                  {resendStatus === 'sending' ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {resendStatus === 'sent' ? (
              <Text style={{ color: colors.success, fontSize: font.sizes.sm, marginTop: spacing.sm }}>
                Enviado! Confira sua caixa de entrada e a pasta de spam.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Social Login Buttons */}
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Entrar com Apple"
            onPress={async () => {
              setLoading(true);
              const result = await signInWithApple();
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await useAuth.getState().initialize();
                const accepted = await tryAutoAcceptInvitation();
                if (accepted) await useAuth.getState().loadActiveGroup();
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

        {/* Google Sign-In: native on both iOS + Android via expo-auth-session
            (no browser detour). Apple still preferred on iOS but Google works
            as alternative for users without iCloud. promptGoogle() opens the
            in-app Google sheet → id_token → backend. Hidden when the platform
            client ID isn't configured (e.g. Android build before
            EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is set in EAS). */}
        {GOOGLE_SIGN_IN_CONFIGURED ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Entrar com Google"
            accessibilityState={{ disabled: loading }}
            onPress={async () => {
              setError('');
              Haptics.selectionAsync();
              // Android: o Google descontinuou o esquema de URI personalizado, então
              // o fluxo do expo-auth-session morreu lá. Usa o SDK nativo (Credential
              // Manager). iOS continua no expo-auth-session (promptGoogle).
              if (Platform.OS === 'android') {
                setLoading(true);
                const result = await signInWithGoogleNative();
                if (result.success) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  await useAuth.getState().initialize();
                  const accepted = await tryAutoAcceptInvitation();
                  if (accepted) await useAuth.getState().loadActiveGroup();
                  const state = useAuth.getState();
                  router.replace(state.activeGroup ? '/(tabs)' : '/onboarding');
                } else if (result.error !== 'Cancelado') {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  setError(result.error || t('auth.googleSignInError'));
                }
                setLoading(false);
                return;
              }
              try {
                await promptGoogle();
                // Result is handled by the useEffect on googleResponse above (iOS).
              } catch {
                setError('Não foi possível iniciar o login com Google');
              }
            }}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.authBorder,
              paddingVertical: spacing.md + 2, flexDirection: 'row',
              alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              marginBottom: spacing.lg,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Ionicons name="logo-google" size={16} color="#4285F4" />
            <Text style={{ color: colors.authText, fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Entrar com Google
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Divider — shown only when a social button is above */}
        {(Platform.OS === 'ios' || (Platform.OS === 'android' && GOOGLE_SIGN_IN_CONFIGURED)) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.authBorder }} />
            <Text style={{ paddingHorizontal: spacing.lg, fontSize: font.sizes.sm, color: colors.authMuted }}>
              {t('auth.orEmailLogin')}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.authBorder }} />
          </View>
        ) : null}

        {/* Email */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
          {t('auth.email')}
        </Text>
        <TextInput
          nativeID="email"
          testID="email-input"
          accessibilityLabel={emailError ?? 'E-mail'}
          value={email}
          onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(null); }}
          onBlur={() => setEmailError(validateEmailField(email))}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={colors.authMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: emailError ? colors.error : colors.authBorder,
            paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.authText,
            marginBottom: emailError ? spacing.xs : spacing.lg,
          }}
        />
        {emailError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {emailError}
          </Text>
        ) : null}

        {/* Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
          {t('auth.password')}
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: passwordError ? colors.error : colors.authBorder,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: passwordError ? spacing.xs : spacing.lg,
        }}>
          <TextInput
            nativeID="password"
            testID="password-input"
            accessibilityLabel={passwordError ?? 'Senha'}
            value={password}
            onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(null); }}
            onBlur={() => setPasswordError(validatePasswordField(password))}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={colors.authMuted}
            secureTextEntry={!showPassword}
            autoComplete="password"
            style={{
              flex: 1, paddingVertical: spacing.md + 2,
              fontSize: font.sizes.md, color: colors.authText,
            }}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            accessibilityState={{ selected: showPassword }}
            hitSlop={8}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.authMuted} />
          </TouchableOpacity>
        </View>
        {passwordError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {passwordError}
          </Text>
        ) : null}

        {/* Remember me + Forgot — matches PWA layout */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
          <TouchableOpacity
            onPress={() => setRememberMe(!rememberMe)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            accessibilityLabel="Lembrar-me"
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

          <TouchableOpacity
            onPress={() => router.push('/auth/forgot-password')}
            accessibilityRole="link"
            accessibilityLabel={t('auth.forgotPassword')}
          >
            <Text style={{ fontSize: font.sizes.sm, color: colors.authPrimary }}>
              {t('auth.forgotPassword')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Login Button — terracotta #C07055 to match PWA */}
        <TouchableOpacity
          testID="login-submit"
          accessibilityRole="button"
          accessibilityLabel="Entrar"
          accessibilityState={{ disabled: loading, busy: loading }}
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
              {t('auth.loginButton')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign Up */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing['3xl'], gap: spacing.xs }}>
          <Text style={{ color: colors.authMuted, fontSize: font.sizes.sm }}>
            {t('auth.noAccount')}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/signup')}
            accessibilityRole="link"
            accessibilityLabel={t('auth.createAccountLink')}
          >
            <Text style={{ color: colors.authPrimary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
              {t('auth.createAccountLink')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
