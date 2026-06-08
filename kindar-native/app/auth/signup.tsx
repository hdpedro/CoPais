import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { track, EVENTS } from 'src/lib/analytics';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const PRIVACY_URL = `${WEB_URL}/privacidade`;
const TERMS_URL = `${WEB_URL}/termos`;

export default function SignupScreen() {
  const { ref: refParam } = useLocalSearchParams<{ ref?: string }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const t = useI18n(s => s.t);

  // onBlur validation — feedback inline antes do submit (padrão premium).
  // Não bloqueia o botão, apenas mostra erro per-campo quando o user sai dele.
  function validateFullNameField(value: string): string | null {
    if (!value.trim()) return t('validation.field.fullNameRequired');
    return null;
  }
  function validateEmailField(value: string): string | null {
    if (!value.trim()) return t('validation.field.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return t('validation.field.emailInvalid');
    return null;
  }
  function validatePasswordField(value: string): string | null {
    if (!value) return t('validation.field.passwordRequired');
    if (value.length < 8) return t('validation.field.passwordTooShort8');
    return null;
  }
  function validateConfirmPasswordField(value: string): string | null {
    if (!value) return t('validation.field.passwordRequired');
    if (value !== password) return t('validation.field.passwordsMismatch');
    return null;
  }

  async function handleSignup() {
    if (!fullName || !email || !password || !confirmPassword) {
      setError(t('authSignup.fillAllFields'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }
    if (!lgpdConsent) {
      setError(t('authSignup.mustAcceptTerms'));
      return;
    }
    setLoading(true);
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Telemetria — dispara ANTES da chamada de rede pra capturar tentativa
    // mesmo se signUp falhar. Paridade com PWA `app/(auth)/signup/page.tsx`.
    track(EVENTS.SIGNUP_STARTED, { has_referral: !!refParam });

    // Forward referral code (mirrors PWA src/actions/auth.ts:signUp). The
    // handle_new_user trigger validates the code; invalid codes are simply
    // ignored, so it's safe to pass through verbatim.
    const result = await signUp(email, password, fullName, refParam || null);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // `signup_completed` aqui significa "conta criada, e-mail de confirmação
      // disparado" — não que o user já confirmou. PWA tem mesma semântica.
      track(EVENTS.SIGNUP_COMPLETED, { has_referral: !!refParam });
      setSuccess(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || t('authSignup.createError'));
    }
    setLoading(false);
  }

  if (success) {
    // Copy melhorado a pedido do Angelino Barata 2026-05-14 16:11: user
    // Fernanda criou conta mas a tela "Conta criada!" não foi suficiente
    // pra ela entender que precisava confirmar email. Resultado: tentou
    // login e ficou clicando até aparecer erro vermelho. Mensagem agora é
    // mais explícita e usa ícone + body + email da pessoa pra dar contexto.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing['3xl'] }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: 'rgba(91,158,133,0.12)',
          alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
        }}>
          <Ionicons name="mail-unread-outline" size={44} color={colors.brand} />
        </View>
        <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
          {t('authSignup.confirmEmailTitle')}
        </Text>
        <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 22 }}>
          {t('authSignup.confirmEmailBodyPrefix')}{' '}
          <Text style={{ color: colors.text, fontWeight: font.weights.semibold }}>{email}</Text>
          .{'\n'}{t('authSignup.confirmEmailBodySuffix')}
        </Text>
        <View style={{
          backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: radius.md,
          padding: spacing.md, marginTop: spacing.xl,
          flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
        }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>
            {t('authSignup.spamHintPrefix')} <Text style={{ fontWeight: font.weights.semibold }}>{t('authSignup.spamHintBold')}</Text>{t('authSignup.spamHintSuffix')}
          </Text>
        </View>
        <PrimaryButton
          onPress={() => router.replace('/auth/login')}
          label={t('authSignup.alreadyConfirmed')}
          fullWidth={false}
          style={{ marginTop: spacing['3xl'], paddingHorizontal: spacing['3xl'] }}
        />
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md }}>
          {t('authSignup.resendFromLoginHint')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg }}
      testID="signup-screen"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: spacing['4xl'] }}>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
            {t('auth.createAccount')}
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, marginTop: spacing.xs }}>
            {t('authSignup.joinKindar')}
          </Text>
        </View>

        {error ? (
          <View style={{
            backgroundColor: 'rgba(229,57,53,0.1)', borderRadius: radius.md,
            padding: spacing.md, marginBottom: spacing.lg,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          }}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: font.sizes.sm, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          {t('auth.fullNamePlaceholder')}
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: fullNameError ? colors.error : colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: fullNameError ? spacing.xs : spacing.lg,
        }}>
          <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          <TextInput
            testID="signup-fullname-input"
            accessibilityLabel={fullNameError ?? t('auth.fullNamePlaceholder')}
            value={fullName}
            onChangeText={(v) => { setFullName(v); if (fullNameError) setFullNameError(null); }}
            onBlur={() => setFullNameError(validateFullNameField(fullName))}
            placeholder={t('authSignup.namePlaceholder')}
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoComplete="name"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
        </View>
        {fullNameError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {fullNameError}
          </Text>
        ) : null}

        {/* Email */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          {t('auth.email')}
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: emailError ? colors.error : colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: emailError ? spacing.xs : spacing.lg,
        }}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <TextInput
            testID="signup-email-input"
            accessibilityLabel={emailError ?? t('auth.email')}
            value={email}
            onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(null); }}
            onBlur={() => setEmailError(validateEmailField(email))}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
        </View>
        {emailError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {emailError}
          </Text>
        ) : null}

        {/* Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          {t('auth.password')}
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: passwordError ? colors.error : colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: passwordError ? spacing.xs : spacing['2xl'],
        }}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            testID="signup-password-input"
            accessibilityLabel={passwordError ?? t('auth.password')}
            value={password}
            onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(null); }}
            onBlur={() => setPasswordError(validatePasswordField(password))}
            placeholder={t('auth.passwordMinLength')}
            placeholderTextColor={colors.textDim}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('authForm.hidePassword') : t('authForm.showPassword')}
            accessibilityState={{ selected: showPassword }}
            hitSlop={8}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {passwordError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing['2xl'] }}>
            {passwordError}
          </Text>
        ) : null}

        {/* Confirm Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          {t('auth.confirmPassword')}
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: confirmPasswordError ? colors.error : colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: confirmPasswordError ? spacing.xs : spacing.lg,
        }}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            accessibilityLabel={confirmPasswordError ?? t('auth.confirmPassword')}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); if (confirmPasswordError) setConfirmPasswordError(null); }}
            onBlur={() => setConfirmPasswordError(validateConfirmPasswordField(confirmPassword))}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            placeholderTextColor={colors.textDim}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
        </View>
        {confirmPasswordError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {confirmPasswordError}
          </Text>
        ) : null}

        {/* LGPD Consent — with CLICKABLE links to Termos + Privacidade
            (Apple Guideline 5.1.1 requires privacy policy link accessible
            in-app before account creation). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing['2xl'] }}>
          <TouchableOpacity
            onPress={() => setLgpdConsent(!lgpdConsent)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: lgpdConsent }}
            accessibilityLabel={t('authSignup.lgpdA11y')}
            hitSlop={8}
            style={{
              width: 18, height: 18, borderRadius: 4, marginTop: 2,
              borderWidth: 1.5,
              borderColor: lgpdConsent ? colors.brand : colors.border,
              backgroundColor: lgpdConsent ? colors.brand : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {lgpdConsent ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
          </TouchableOpacity>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, flex: 1, lineHeight: 18 }}>
            {t('authSignup.lgpdPrefix')}{' '}
            <Text
              style={{ color: colors.brand, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              {t('account.termsOfUse')}
            </Text>
            {' '}{t('authSignup.lgpdAnd')}{' '}
            <Text
              style={{ color: colors.brand, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              {t('account.privacyPolicy')}
            </Text>
            {t('authSignup.lgpdSuffix')}
          </Text>
        </View>

        {/* Signup Button */}
        <PrimaryButton
          onPress={handleSignup}
          testID="signup-submit"
          label={t('auth.createAccount')}
          loading={loading}
        />

        {/* Back to Login */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing['3xl'], gap: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
            {t('auth.hasAccount')}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="link"
            accessibilityLabel={t('auth.login')}
          >
            <Text style={{ color: colors.brand, fontSize: font.sizes.sm, fontWeight: font.weights.bold }}>
              {t('auth.login')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
