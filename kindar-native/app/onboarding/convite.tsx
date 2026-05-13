/**
 * Onboarding · Passo: Convidar co-responsavel.
 * Mirrors PWA /onboarding/convite.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { createInvitation } from 'src/services/invitations';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

const ROLES = [
  { value: 'parent', label: 'Pai / mae', icon: '👨‍👩‍👧' },
  { value: 'grandparent', label: 'Avo / avo', icon: '👴' },
  { value: 'caregiver', label: 'Cuidador(a)', icon: '🧑‍🍼' },
];

export default function OnboardingConviteScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('parent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  async function handleSend() {
    if (!activeGroup || !userId) return;
    if (!email.trim() || !email.includes('@')) { setError('Informe um email valido'); return; }
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createInvitation({
      groupId: activeGroup.groupId,
      email, role, invitedBy: userId,
    });
    setLoading(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreatedToken(res.token || null);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(res.error || 'Erro ao enviar convite');
    }
  }

  async function handleShareLink() {
    if (!createdToken) return;
    const link = `${WEB_URL}/convite/${createdToken}`;
    const firstName = profile?.full_name?.split(' ')[0] || 'Kindar';
    const groupName = activeGroup?.groupName || 'Kindar';
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Oi! ${firstName} te convidou pra participar de ${groupName} no Kindar. Aceita o convite aqui: ${link}`,
        url: link,
      });
    } catch { /* cancelled */ }
  }

  function handleSkip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(tabs)');
  }

  function handleFinish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  }

  if (createdToken) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom, padding: spacing.xl, justifyContent: 'center' }}>
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md, alignItems: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 40 }}>📨</Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
            Convite criado!
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 }}>
            Compartilhe o link abaixo com a pessoa que voce quer convidar. Pode ser por WhatsApp, SMS, email ou o que preferir.
          </Text>
          <TouchableOpacity
            onPress={handleShareLink}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.brand, borderRadius: radius.md,
              paddingVertical: spacing.md, paddingHorizontal: spacing['2xl'],
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              marginBottom: spacing.md, width: '100%', justifyContent: 'center',
            }}
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Compartilhar link
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFinish} activeOpacity={0.7} style={{ paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>Continuar sem compartilhar agora</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 80, padding: spacing.xl, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Progress indicator — harmonizado com o wizard de onboarding (3 etapas
            visíveis: Família · Crianças · Convite). 3ª dot ativa (expandida). */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing['2xl'] }}
          accessibilityRole="progressbar"
          accessibilityLabel="Etapa 3 de 3"
        >
          <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
          <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
        </View>

        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🤝</Text>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm }}>
            Convide a outra parte
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 320 }}>
            O Kindar funciona melhor quando os dois responsaveis estao juntos. Envie um convite agora — leva 30 segundos.
          </Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Email */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
          Email do co-responsavel
        </Text>
        <TextInput
          value={email} onChangeText={setEmail}
          placeholder="email@exemplo.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Role */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Papel</Text>
        <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
          {ROLES.map(r => {
            const active = role === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRole(r.value); }}
                activeOpacity={0.85}
                style={{
                  backgroundColor: active ? `${colors.brand}10` : colors.bgElevated,
                  borderRadius: radius.md,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                }}
              >
                <Text style={{ fontSize: 22 }}>{r.icon}</Text>
                <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal, flex: 1 }}>
                  {r.label}
                </Text>
                {active ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          disabled={loading || !email.trim()}
          onPress={handleSend}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            opacity: loading || !email.trim() ? 0.5 : 1, marginBottom: spacing.md,
          }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Enviar convite
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>Fazer isso depois</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
