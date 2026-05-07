import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { translateAuthError } from 'src/lib/auth-errors';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const t = useI18n(s => s.t);

  async function handleReset() {
    if (!email) { setError('Informe seu email'); return; }
    setLoading(true);
    setError('');

    // Use EXPO_PUBLIC_WEB_URL so PR/staging/preview builds land back on
    // their own domain instead of always production.
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${WEB_URL}/auth/callback?next=/reset-password&type=recovery`,
    });

    if (err) {
      // Translate raw Supabase English errors to PT-BR for user-facing surface.
      setError(translateAuthError(err.message));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      setSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing['3xl'] }}>
        <Ionicons name="mail-open-outline" size={48} color={colors.brand} style={{ marginBottom: spacing.xl }} />
        <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
          Email enviado!
        </Text>
        <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 22 }}>
          Verifique sua caixa de entrada para redefinir a senha.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/auth/login')}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.lg, paddingHorizontal: spacing['3xl'],
            marginTop: spacing['3xl'],
          }}
        >
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
            Voltar ao Login
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing['3xl'] }}>
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', top: 60, left: spacing['2xl'] }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, marginBottom: spacing.sm }}>
          {t('auth.resetPassword')}
        </Text>
        <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, marginBottom: spacing['3xl'], lineHeight: 22 }}>
          Informe seu email e enviaremos um link para redefinir sua senha.
        </Text>

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

        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing['2xl'],
        }}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
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

        <TouchableOpacity
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.lg, alignItems: 'center',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
              Enviar link
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
