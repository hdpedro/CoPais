/**
 * Familia — lista membros + convites pendentes + acoes (convidar, sair, remover).
 * Mirrors PWA /familia.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { listInvitations, cancelInvitation, type Invitation } from '../../src/services/invitations';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Member {
  userId: string;
  fullName: string;
  role: 'admin' | 'member' | 'readonly' | string;
  email: string | null;
}

const ROLE_META: Record<string, { label: string; icon: string; color: string }> = {
  admin: { label: 'Admin', icon: '⭐', color: '#F59E0B' },
  member: { label: 'Membro', icon: '👤', color: '#3B82F6' },
  readonly: { label: 'Somente leitura', icon: '👁️', color: '#6B7280' },
};

export default function FamiliaScreen() {
  const { activeGroup, userId, signOut } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [memRes, invites] = await Promise.all([
      supabase
        .from('group_members')
        .select('user_id, role, profiles(full_name, email)')
        .eq('group_id', activeGroup.groupId),
      listInvitations(activeGroup.groupId),
    ]);
    setMembers(((memRes.data || []) as any[]).map((m: any) => ({
      userId: m.user_id,
      fullName: m.profiles?.full_name || '',
      role: m.role,
      email: m.profiles?.email || null,
    })));
    setPendingInvites(invites.filter(i => i.status === 'pending'));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const myRole = members.find(m => m.userId === userId)?.role;
  const amAdmin = myRole === 'admin';

  async function handleRemoveMember(member: Member) {
    if (!activeGroup) return;
    Alert.alert(
      'Remover membro',
      `Remover ${member.fullName.split(' ')[0]} do grupo? O historico dele fica preservado mas ele perde acesso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setActing(member.userId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const { error } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', activeGroup.groupId)
              .eq('user_id', member.userId);
            setActing(null);
            if (error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erro', error.message);
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
      `Voce vai perder acesso a ${activeGroup.groupName}. Esta acao nao pode ser desfeita pelo proprio usuario — so quem e admin pode te readicionar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const { error } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', activeGroup.groupId)
              .eq('user_id', userId);
            if (error) {
              Alert.alert('Erro', error.message);
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
    setActing(inv.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await cancelInvitation(inv.id, activeGroup.groupId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActing(null);
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Familia" />
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
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Convidar alguem
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
                      {isSelf ? ' (voce)' : ''}
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
                  <TouchableOpacity
                    disabled={acting === m.userId}
                    onPress={() => handleRemoveMember(m)}
                    hitSlop={12}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={colors.error} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            <>
              {pendingInvites.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm }}>
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
                          {inv.role} · Enviado {inv.created_at?.slice(0, 10).split('-').reverse().join('/')}
                        </Text>
                      </View>
                      {amAdmin ? (
                        <TouchableOpacity
                          disabled={acting === inv.id}
                          onPress={() => handleCancelInvite(inv)}
                          hitSlop={12}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close-circle-outline" size={22} color={colors.error} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}

              {/* Leave group */}
              {!amAdmin || members.length > 1 ? (
                <TouchableOpacity
                  onPress={handleLeaveGroup}
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
    </View>
  );
}
