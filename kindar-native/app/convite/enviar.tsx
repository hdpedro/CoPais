/**
 * Enviar Convite — form + lista de convites existentes.
 * Mirrors PWA /convite/enviar.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Share,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { createInvitation, listInvitations, cancelInvitation, type Invitation } from 'src/services/invitations';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

const ROLES: { value: string; label: string; desc: string; icon: string }[] = [
  { value: 'parent', label: 'Responsável', desc: 'Pai, mãe, padrasto/madrasta', icon: '👨‍👩‍👧' },
  { value: 'grandparent', label: 'Avô(ó)', desc: 'Participa da rotina', icon: '👴' },
  { value: 'caregiver', label: 'Cuidador(a)', desc: 'Babá, au-pair', icon: '🧑‍🍼' },
  { value: 'mediator', label: 'Mediador(a)', desc: 'Acesso apenas leitura', icon: '⚖️' },
  { value: 'lawyer', label: 'Advogado(a)', desc: 'Acesso apenas leitura', icon: '👩‍⚖️' },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: '#E8A228' },
  accepted: { label: 'Aceito', color: '#4CAF50' },
  expired: { label: 'Expirado', color: '#8A8A8A' },
  cancelled: { label: 'Cancelado', color: '#E53935' },
};

export default function EnviarConviteScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('parent');
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successToken, setSuccessToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    setInvites(await listInvitations(activeGroup.groupId));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSend() {
    if (!activeGroup || !userId) return;
    if (!email.trim() || !email.includes('@')) { setError('Informe um email valido'); return; }
    setError('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createInvitation({
      groupId: activeGroup.groupId,
      email,
      role,
      invitedBy: userId,
    });
    setSending(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessToken(res.token || null);
      setEmail('');
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(res.error || 'Erro ao enviar convite');
    }
  }

  async function handleShare(token: string) {
    const link = `${WEB_URL}/convite/${token}`;
    const firstName = profile?.full_name?.split(' ')[0] || 'Kindar';
    const groupName = activeGroup?.groupName || 'o grupo';
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Oi! ${firstName} te convidou para participar de ${groupName} no Kindar. Abra este link para aceitar: ${link}`,
        url: link,
      });
    } catch {
      // cancelled
    }
  }

  async function handleCancel(inv: Invitation) {
    if (!activeGroup) return;
    Alert.alert('Cancelar convite', `Cancelar convite para ${inv.email}?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Cancelar convite',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const res = await cancelInvitation(inv.id, activeGroup.groupId);
          if (res.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await load();
          }
        },
      },
    ]);
  }

  const pending = invites.filter(i => i.status === 'pending');
  const past = invites.filter(i => i.status !== 'pending');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Convidar membro
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {/* Success state */}
        {successToken ? (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md, marginBottom: spacing.lg, borderWidth: 2, borderColor: colors.brand }}>
            <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: spacing.sm }}>🎉</Text>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.xs }}>
              Convite criado!
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }}>
              Compartilhe o link abaixo por WhatsApp, email ou copie pra colar onde preferir.
            </Text>
            <TouchableOpacity
              onPress={() => handleShare(successToken)}
              activeOpacity={0.85}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                Compartilhar link
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSuccessToken(null)}
              style={{ alignItems: 'center', marginTop: spacing.md }}
            >
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
                Enviar outro convite
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {error ? (
              <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
                <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Email *</Text>
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

            {/* Role picker */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Papel</Text>
            <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
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
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {r.label}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 1 }}>
                        {r.desc}
                      </Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Submit */}
            <View style={{ marginBottom: spacing['2xl'] }}>
              <PrimaryButton
                label="Enviar convite"
                onPress={handleSend}
                loading={sending}
                disabled={!email.trim()}
                testID="convite-enviar-submit"
              />
            </View>
          </>
        )}

        {/* Invites list */}
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        ) : (
          <>
            {pending.length > 0 ? (
              <>
                <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                  Pendentes ({pending.length})
                </Text>
                {pending.map(inv => (
                  <InviteRow key={inv.id} inv={inv} onShare={() => handleShare(inv.token)} onCancel={() => handleCancel(inv)} />
                ))}
              </>
            ) : null}
            {past.length > 0 ? (
              <>
                <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm }}>
                  Historico
                </Text>
                {past.map(inv => (
                  <InviteRow key={inv.id} inv={inv} readonly />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InviteRow({ inv, onShare, onCancel, readonly }: { inv: Invitation; onShare?: () => void; onCancel?: () => void; readonly?: boolean }) {
  const status = STATUS_META[inv.status] || STATUS_META.pending;
  return (
    <View style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.lg,
      padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
      opacity: readonly ? 0.7 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }} numberOfLines={1}>
            {inv.email}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
            {inv.role} · convidado em {inv.created_at?.slice(0, 10).split('-').reverse().join('/')}
          </Text>
        </View>
        <View style={{ backgroundColor: `${status.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
          <Text style={{ fontSize: font.sizes.xs, color: status.color, fontWeight: font.weights.medium }}>{status.label}</Text>
        </View>
      </View>
      {!readonly && inv.status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <TouchableOpacity
            onPress={onShare}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>Compartilhar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCancel}
            style={{ paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderLight }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: font.sizes.xs, fontWeight: font.weights.medium }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
