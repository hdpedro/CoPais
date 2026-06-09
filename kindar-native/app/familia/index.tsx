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
  Modal, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { apiFetch } from 'src/lib/api-fetch';
import { useAuth } from 'src/store/auth';
import { listInvitations, cancelInvitation, type Invitation } from 'src/services/invitations';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import { reportError } from 'src/lib/error-reporter';
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

// Descrições dos papéis de grupo → t('groupRoleDesc.*') no render (i18n).

const ROLE_META: Record<string, { icon: string; color: string }> = {
  admin: { icon: '⭐', color: '#F59E0B' },
  member: { icon: '👤', color: '#3B82F6' },
  readonly: { icon: '👁️', color: '#6B7280' },
};

// Papéis de convite (inviteRoles.*) são i18n via t() no render.

export default function FamiliaScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { activeGroup, userId, signOut, memberships, switchGroup } = useAuth();
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
      t('familiaScreen.removeMemberTitle'),
      t('familiaScreen.removeMemberMessage', { name: member.fullName.split(' ')[0] }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('familiaScreen.removeMember'),
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
      t('familiaScreen.leaveGroup'),
      t('familiaScreen.leaveGroupMessage', { group: activeGroup.groupName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('familiaScreen.leave'),
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
      t('inviteSend.cancelTitle'),
      t('inviteSend.cancelConfirm', { email: inv.email }),
      [
        { text: t('familiaScreen.keep'), style: 'cancel' },
        {
          text: t('inviteSend.cancelTitle'),
          style: 'destructive',
          onPress: async () => {
            setActing(inv.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const res = await cancelInvitation(inv.id, activeGroup.groupId);
            setActing(null);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } else {
              // Antes engolia o resultado: em falha tocava "sucesso" + recarregava
              // sem cancelar nada e sem erro (bug Matheus 09/jun: "a tela treme e
              // não deixa, sem mensagem"). Agora reporta + mostra o motivo.
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              reportError(new Error(`[familia] cancelInvite failed: ${res.error ?? 'unknown'}`), {
                severity: 'warning',
                filePath: 'app/familia/index.tsx',
                metadata: { event: 'cancel_invite_failed', invitationId: inv.id, groupId: activeGroup.groupId, error: res.error ?? null },
              });
              toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
            }
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
              {/* Seletor de família — só aparece com >1 grupo. Sem isto o usuário
                  ficava preso no grupo que o app escolhia ao entrar num 2º grupo
                  (não havia como trocar; switchGroup não estava ligado a nenhuma
                  tela). Bug Matheus/Jeniffer 09/jun. */}
              {memberships.length > 1 ? (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>
                    {t('familiaScreen.yourGroups')}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: 2 }}>
                    {memberships.map(m => {
                      const isActive = m.groupId === activeGroup?.groupId;
                      return (
                        <TouchableOpacity
                          key={m.groupId}
                          onPress={() => { if (!isActive) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); switchGroup(m.groupId); } }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                          accessibilityLabel={m.groupName}
                          style={{
                            paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full,
                            backgroundColor: isActive ? colors.brand : colors.bgElevated,
                            borderWidth: isActive ? 0 : 1, borderColor: colors.borderLight,
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                          }}
                        >
                          <Ionicons name="home" size={13} color={isActive ? '#fff' : colors.textSecondary} />
                          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: isActive ? '#fff' : colors.text }} numberOfLines={1}>
                            {m.groupName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {/* Group card */}
              <View style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl,
                ...shadows.md, marginBottom: spacing.lg, alignItems: 'center',
              }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
                  <Ionicons name="home-outline" size={28} color={colors.brand} />
                </View>
                <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
                  {activeGroup?.groupName || t('familyPage.headerTitle')}
                </Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                  {t(members.length === 1 ? 'familiaScreen.memberCountOne' : 'familiaScreen.memberCountOther', { count: members.length })}
                  {pendingInvites.length > 0 ? ` · ${t(pendingInvites.length === 1 ? 'familiaScreen.pendingCountOne' : 'familiaScreen.pendingCountOther', { count: pendingInvites.length })}` : ''}
                </Text>
              </View>

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/convite/enviar'); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('familiaScreen.inviteSomeone')}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  {t('familiaScreen.inviteSomeone')}
                </Text>
              </TouchableOpacity>

              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                {t('familiaScreen.membersSection', { count: members.length })}
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
                      {isSelf ? ` (${t('familyPage.you')})` : ''}
                    </Text>
                    <View style={{ backgroundColor: `${roleMeta.color}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ fontSize: 10 }}>{roleMeta.icon}</Text>
                      <Text style={{ fontSize: 10, color: roleMeta.color, fontWeight: font.weights.semibold }}>{t('groupRoles.' + m.role).toUpperCase()}</Text>
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
                      accessibilityLabel={t('familiaScreen.changeRoleOf', { name: m.fullName })}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="swap-vertical-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={acting === m.userId}
                      onPress={() => handleRemoveMember(m)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('familiaScreen.removeFromGroup', { name: m.fullName })}
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
                    {t('familiaScreen.childrenSection', { count: children.length })}
                  </Text>
                  {children.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => router.push({ pathname: '/criancas/[id]', params: { id: c.id } } as never)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('familiaScreen.openChildProfile', { name: c.full_name })}
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
                          {t((childAges[c.id] ?? 0) === 1 ? 'familiaScreen.yearsOldOne' : 'familiaScreen.yearsOldOther', { count: childAges[c.id] ?? 0 })} · {c.birth_date.split('-').reverse().join('/')}
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
                    {t('familiaScreen.pendingSection', { count: pendingInvites.length })}
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
                          {t('inviteRoles.' + inv.role)} · {t('familiaScreen.sentOn', { date: inv.created_at?.slice(0, 10).split('-').reverse().join('/') ?? '' })}
                        </Text>
                      </View>
                      {amAdmin ? (
                        <TouchableOpacity
                          disabled={acting === inv.id}
                          onPress={() => handleCancelInvite(inv)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={t('inviteSend.cancelInviteToA11y', { email: inv.email })}
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
                    {t('familiaScreen.acceptedSection')}
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
                          {t('inviteRoles.' + inv.role)} · {inv.created_at?.slice(0, 10).split('-').reverse().join('/')}
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
                  accessibilityLabel={t('familiaScreen.leaveGroup')}
                  style={{ marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.error, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                    {t('familiaScreen.leaveGroup')}
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
              {t('familiaScreen.changeRole')}
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
                  accessibilityLabel={t('groupRoles.' + r)}
                  accessibilityHint={t('groupRoleDesc.' + r)}
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
                        {t('groupRoles.' + r)}
                      </Text>
                      {isCurrent ? (
                        <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold }}>
                          {t('familiaScreen.current')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {t('groupRoleDesc.' + r)}
                    </Text>
                  </View>
                  {!isCurrent ? <Ionicons name="chevron-forward" size={16} color={colors.textDim} style={{ marginTop: 2 }} /> : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setRoleModalMember(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={{ marginTop: spacing.md, paddingVertical: spacing.md, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
