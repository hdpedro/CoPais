/**
 * Familia — lista membros + convites pendentes + acoes (convidar, mudar
 * role, remover, sair). Mirrors PWA /familia, including the role-change
 * UX from `MemberActions.tsx:69-122` so iOS admins are not stuck with a
 * remove-only menu.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { apiFetch } from 'src/lib/api-fetch';
import { useAuth } from 'src/store/auth';
import { listInvitations, cancelInvitation, type Invitation } from 'src/services/invitations';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';

type GroupRole = 'admin' | 'member' | 'readonly';

interface Member {
  userId: string;
  fullName: string;
  role: GroupRole | string;
  email: string | null;
}

interface ChildPreview {
  id: string;
  full_name: string;
  birth_date: string;
}

const ROLE_DESCRIPTIONS: Record<GroupRole, string> = {
  admin: 'Pode gerenciar membros, convites e configurações do grupo.',
  member: 'Pode ver e adicionar conteúdo, mas não gerencia o grupo.',
  readonly: 'Apenas visualiza — não pode editar ou criar nada (mediador, advogado, etc.).',
};

const ROLE_META: Record<string, { label: string; icon: string; color: string }> = {
  admin: { label: 'Admin', icon: '⭐', color: '#F59E0B' },
  member: { label: 'Membro', icon: '👤', color: '#3B82F6' },
  readonly: { label: 'Somente leitura', icon: '👁️', color: '#6B7280' },
};

// Rótulo PT dos papéis de CONVITE (parent/grandparent/caregiver/mediator/lawyer).
// Sem isso a UI mostrava o valor cru em inglês, ex.: "caregiver" (bug Hailla
// 2026-06-07). ROLE_META acima é só pros papéis de GRUPO (admin/member/readonly).
const INVITE_ROLE_LABEL: Record<string, string> = {
  parent: 'Responsável',
  grandparent: 'Avô(ó)',
  caregiver: 'Cuidador(a)',
  mediator: 'Mediador(a)',
  lawyer: 'Advogado(a)',
};

export default function FamiliaScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { activeGroup, userId, signOut } = useAuth();
  const [acting, setActing] = useState<string | null>(null);
  const [roleModalMember, setRoleModalMember] = useState<Member | null>(null);

  interface FamiliaCache {
    members: Member[];
    children: ChildPreview[];
    childAges: Record<string, number>;
    pendingInvites: Invitation[];
    acceptedInvites: Invitation[];
  }
  const EMPTY_FAM: FamiliaCache = { members: [], children: [], childAges: {}, pendingInvites: [], acceptedInvites: [] };
  const { data: fam, loading, refresh: load } = useCachedFetch<FamiliaCache>({
    cacheKey: activeGroup ? `familia_${activeGroup.groupId}` : null,
    tag: 'familia:load',
    empty: EMPTY_FAM,
    fetcher: async () => {
      const [memRes, childRes, invites] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id, role, profiles(full_name, email)')
          .eq('group_id', activeGroup!.groupId),
        supabase
          .from('children')
          .select('id, full_name, birth_date')
          .eq('group_id', activeGroup!.groupId)
          .order('birth_date'),
        listInvitations(activeGroup!.groupId),
      ]);
      const childList = (childRes.data || []) as ChildPreview[];
      const now = Date.now();
      const ages: Record<string, number> = {};
      childList.forEach((c) => {
        ages[c.id] = Math.floor(
          (now - new Date(c.birth_date + 'T12:00:00').getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        );
      });
      return {
        members: ((memRes.data || []) as any[]).map((m: any) => ({
          userId: m.user_id,
          fullName: m.profiles?.full_name || '',
          role: m.role,
          email: m.profiles?.email || null,
        })),
        children: childList,
        childAges: ages,
        pendingInvites: invites.filter(i => i.status === 'pending'),
        acceptedInvites: invites.filter(i => i.status === 'accepted').slice(0, 5),
      };
    },
  });
  const members = fam.members;
  const children = fam.children;
  const childAges = fam.childAges;
  const pendingInvites = fam.pendingInvites;
  const acceptedInvites = fam.acceptedInvites;

  const myRole = members.find(m => m.userId === userId)?.role;
  const amAdmin = myRole === 'admin';

  async function handleRemoveMember(member: Member) {
    if (!activeGroup) return;
    Alert.alert(
      'Remover membro',
      `Remover ${member.fullName.split(' ')[0]} do grupo? O histórico dele fica preservado mas ele perde acesso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setActing(member.userId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            // Wave G: server-side admin gate (no more direct mutation).
            const r = await apiFetch('/api/family/members', {
              method: 'DELETE',
              query: { groupId: activeGroup.groupId, memberId: member.userId },
            });
            setActing(null);
            if (!r.ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: r.error || t('toasts.common.deleteFailed'), variant: 'error' });
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            }
          },
        },
      ]
    );
  }

  async function handleLeaveGroup() {
    if (!activeGroup || !userId) return;
    Alert.alert(
      'Sair do grupo',
      `Você vai perder acesso a ${activeGroup.groupName}. Esta ação não pode ser desfeita pelo próprio usuário — só quem é admin pode te readicionar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            // Server enforces "last admin can't leave" guard.
            const r = await apiFetch('/api/family/members', {
              method: 'DELETE',
              query: { groupId: activeGroup.groupId },
            });
            if (!r.ok) {
              toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Force signout to reset state
              await signOut?.();
              router.replace('/auth/login');
            }
          },
        },
      ]
    );
  }

  async function handleCancelInvite(inv: Invitation) {
    if (!activeGroup) return;
    Alert.alert(
      'Cancelar convite',
      `Cancelar convite enviado para ${inv.email}?`,
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Cancelar convite',
          style: 'destructive',
          onPress: async () => {
            setActing(inv.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await cancelInvitation(inv.id, activeGroup.groupId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setActing(null);
            await load();
          },
        },
      ]
    );
  }

  async function handleChangeRole(member: Member, newRole: GroupRole) {
    if (!activeGroup) return;
    setRoleModalMember(null);
    setActing(member.userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Wave G: server-side admin gate (RLS has no UPDATE policy on group_members).
    const r = await apiFetch('/api/family/members', {
      method: 'PATCH',
      body: { groupId: activeGroup.groupId, memberId: member.userId, newRole },
    });

    setActing(null);
    if (!r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: r.error || t('toasts.common.updateFailed'), variant: 'error' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await load();
  }


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={activeGroup?.groupName || t('familyPage.headerTitle')} />
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={item => item.userId}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
          ListHeaderComponent={
            <>
              {/* Group card */}
              <View style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
                ...shadows.md, marginBottom: spacing.lg, alignItems: 'center',
              }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
                  <Ionicons name="home-outline" size={28} color={colors.brand} />
                </View>
                <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
                  {activeGroup?.groupName || 'Familia'}
                </Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                  {members.length} membro{members.length !== 1 ? 's' : ''}
                  {pendingInvites.length > 0 ? ` · ${pendingInvites.length} convite(s) pendente(s)` : ''}
                </Text>
              </View>

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/convite/enviar'); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Convidar alguém"
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Convidar alguém
                </Text>
              </TouchableOpacity>

              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                Membros ({members.length})
              </Text>
            </>
          }
          renderItem={({ item: m }) => {
            const roleMeta = ROLE_META[m.role] || ROLE_META.member;
            const isSelf = m.userId === userId;
            return (
              <View style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.brand }}>
                    {m.fullName[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                      {m.fullName}
                      {isSelf ? ' (você)' : ''}
                    </Text>
                    <View style={{ backgroundColor: `${roleMeta.color}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ fontSize: 10 }}>{roleMeta.icon}</Text>
                      <Text style={{ fontSize: 10, color: roleMeta.color, fontWeight: font.weights.semibold }}>{roleMeta.label.toUpperCase()}</Text>
                    </View>
                  </View>
                  {m.email ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                      {m.email}
                    </Text>
                  ) : null}
                </View>
                {amAdmin && !isSelf ? (
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {/* Change role — opens modal with 3 radios */}
                    <TouchableOpacity
                      disabled={acting === m.userId}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setRoleModalMember(m);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Mudar papel de ${m.fullName}`}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="swap-vertical-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={acting === m.userId}
                      onPress={() => handleRemoveMember(m)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${m.fullName} do grupo`}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="remove-circle-outline" size={22} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            <>
              {/* Children section — same data as PWA FamiliaClient */}
              {children.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
                    Crianças ({children.length})
                  </Text>
                  {children.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => router.push({ pathname: '/criancas/[id]', params: { id: c.id } } as never)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir perfil de ${c.full_name}`}
                      style={{
                        backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                        padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.brand }}>
                          {c.full_name[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                          {c.full_name}
                        </Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                          {childAges[c.id] ?? 0} anos · {c.birth_date.split('-').reverse().join('/')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {pendingInvites.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
                    Convites pendentes ({pendingInvites.length})
                  </Text>
                  {pendingInvites.map(inv => (
                    <View
                      key={inv.id}
                      style={{
                        backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                        padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                        borderWidth: 1, borderColor: `${colors.warning}40`,
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.warning}15`, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="mail-outline" size={20} color={colors.warning} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }} numberOfLines={1}>
                          {inv.email}
                        </Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                          {(INVITE_ROLE_LABEL[inv.role] || inv.role)} · Enviado {inv.created_at?.slice(0, 10).split('-').reverse().join('/')}
                        </Text>
                      </View>
                      {amAdmin ? (
                        <TouchableOpacity
                          disabled={acting === inv.id}
                          onPress={() => handleCancelInvite(inv)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`Cancelar convite para ${inv.email}`}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close-circle-outline" size={22} color={colors.error} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}

              {/* Recent accepted history */}
              {acceptedInvites.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
                    Convites aceitos
                  </Text>
                  {acceptedInvites.map(inv => (
                    <View
                      key={inv.id}
                      style={{
                        backgroundColor: colors.bgElevated, borderRadius: radius.md,
                        padding: spacing.md, marginBottom: spacing.xs,
                        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                        opacity: 0.85,
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: font.sizes.sm, color: colors.text }} numberOfLines={1}>
                          {inv.email}
                        </Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                          {(INVITE_ROLE_LABEL[inv.role] || inv.role)} · {inv.created_at?.slice(0, 10).split('-').reverse().join('/')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}

              {/* Leave group — wording matches PWA LeaveGroupButton */}
              {!amAdmin || members.length > 1 ? (
                <TouchableOpacity
                  onPress={handleLeaveGroup}
                  accessibilityRole="button"
                  accessibilityLabel="Sair do grupo"
                  style={{ marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.error, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                    Sair do grupo
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          }
        />
      )}

      {/* Role-change modal — mirrors PWA MemberActions.tsx (3 radios + descriptions) */}
      <Modal visible={!!roleModalMember} transparent animationType="fade" onRequestClose={() => setRoleModalMember(null)}>
        <ModalBackdrop onClose={() => setRoleModalMember(null)} align="center" dim={0.5} padding={spacing.xl}>
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              Mudar papel
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg }}>
              {roleModalMember?.fullName ? roleModalMember.fullName.split(' ')[0] : ''}
            </Text>

            {(['admin', 'member', 'readonly'] as GroupRole[]).map(r => {
              const isCurrent = roleModalMember?.role === r;
              const meta = ROLE_META[r];
              return (
                <TouchableOpacity
                  key={r}
                  disabled={isCurrent}
                  onPress={() => roleModalMember && handleChangeRole(roleModalMember, r)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isCurrent, disabled: isCurrent }}
                  accessibilityLabel={meta.label}
                  accessibilityHint={ROLE_DESCRIPTIONS[r]}
                  style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
                    borderRadius: radius.md, marginBottom: spacing.sm,
                    backgroundColor: isCurrent ? `${colors.brand}10` : 'transparent',
                    borderWidth: 1, borderColor: isCurrent ? colors.brand : colors.borderLight,
                    opacity: isCurrent ? 0.7 : 1,
                  }}
                >
                  <View style={{ marginTop: 2 }}>
                    <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                        {meta.label}
                      </Text>
                      {isCurrent ? (
                        <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold }}>
                          Atual
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {ROLE_DESCRIPTIONS[r]}
                    </Text>
                  </View>
                  {!isCurrent ? <Ionicons name="chevron-forward" size={16} color={colors.textDim} style={{ marginTop: 2 }} /> : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setRoleModalMember(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              style={{ marginTop: spacing.md, paddingVertical: spacing.md, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
