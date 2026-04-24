import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

const PRIVACY_URL = 'https://kindar.com.br/privacidade';
const TERMS_URL = 'https://kindar.com.br/termos';

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();

  async function handleSignup() {
    if (!fullName || !email || !password || !confirmPassword) {
      setError('Preencha todos os campos');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas nao coincidem');
      return;
    }
    if (!lgpdConsent) {
      setError('Voce precisa aceitar os termos de uso e politica de privacidade');
      return;
    }
    setLoading(true);
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await signUp(email, password, fullName);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error || 'Erro ao criar conta');
    }
    setLoading(false);
  }

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing['3xl'] }}>
        <View style={{
          width: 72, height: 72, borderRadius: 36,
          backgroundColor: 'rgba(76,175,80,0.12)',
          alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
        }}>
          <Ionicons name="checkmark-circle" size={40} color={colors.success} />
        </View>
        <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
          Conta criada!
        </Text>
        <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 22 }}>
          Verifique seu email para confirmar a conta. Depois, faca login.
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
            Ir para Login
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: spacing['4xl'] }}>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
            Criar conta
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, marginTop: spacing.xs }}>
            Junte-se ao Kindar
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
          Nome completo
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Seu nome"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoComplete="name"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
        </View>

        {/* Email */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          Email
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
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

        {/* Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          Senha
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing['2xl'],
        }}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Minimo 8 caracteres"
            placeholderTextColor={colors.textDim}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Confirm Password */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.xs }}>
          Confirmar senha
        </Text>
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Digite a senha novamente"
            placeholderTextColor={colors.textDim}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            style={{
              flex: 1, paddingVertical: spacing.lg, paddingLeft: spacing.md,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
        </View>

        {/* LGPD Consent — with CLICKABLE links to Termos + Privacidade
            (Apple Guideline 5.1.1 requires privacy policy link accessible
            in-app before account creation). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing['2xl'] }}>
          <TouchableOpacity
            onPress={() => setLgpdConsent(!lgpdConsent)}
            activeOpacity={0.7}
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
            Concordo com os{' '}
            <Text
              style={{ color: colors.brand, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              Termos de Uso
            </Text>
            {' '}e{' '}
            <Text
              style={{ color: colors.brand, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              Politica de Privacidade
            </Text>
            . Seus dados serao tratados conforme a LGPD.
          </Text>
        </View>

        {/* Signup Button */}
        <TouchableOpacity
          onPress={handleSignup}
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
              Criar conta
            </Text>
          )}
        </TouchableOpacity>

        {/* Back to Login */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing['3xl'], gap: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
            Ja tem conta?
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.brand, fontSize: font.sizes.sm, fontWeight: font.weights.bold }}>
              Entrar
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
