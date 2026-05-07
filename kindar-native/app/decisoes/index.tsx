import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import {
  fetchDecisions, createDecision, voteOnDecision, closeDecision,
  type Decision, type DecisionCategory, type VoteChoice,
} from 'src/services/decisions';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const CAT_META: Record<string, { icon: string; color: string; label: string }> = {
  escola: { icon: '🎒', color: '#3B82F6', label: 'Escola' },
  saude: { icon: '🏥', color: '#EF4444', label: 'Saúde' },
  atividade: { icon: '⚽', color: '#22C55E', label: 'Atividade' },
  viagem: { icon: '✈️', color: '#8B5CF6', label: 'Viagem' },
  financeiro: { icon: '💰', color: '#F59E0B', label: 'Financeiro' },
  moradia: { icon: '🏠', color: '#5B9E85', label: 'Moradia' },
  outro: { icon: '📋', color: '#6B7280', label: 'Outro' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  aberta: { label: 'Aberta', color: '#E8A228' },
  aprovada: { label: 'Aprovada', color: '#4CAF50' },
  rejeitada: { label: 'Rejeitada', color: '#E53935' },
  expirada: { label: 'Expirada', color: '#8A8A8A' },
};

function formatDeadline(deadline: string | null): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const now = Date.now();
  const d = new Date(deadline + 'T23:59:59').getTime();
  const daysUntil = Math.ceil((d - now) / 86400000);
  if (daysUntil < 0) return { label: 'Prazo expirado', urgent: true };
  if (daysUntil === 0) return { label: 'Hoje', urgent: true };
  if (daysUntil <= 3) return { label: `Em ${daysUntil} dia${daysUntil > 1 ? 's' : ''}`, urgent: true };
  const [, m, day] = deadline.split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return { label: `Até ${day}/${months[(m || 1) - 1]}`, urgent: false };
}

export default function DecisoesScreen() {
  const { activeGroup, userId } = useAuth();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<DecisionCategory>('outro');
  const [newDeadline, setNewDeadline] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const data = await fetchDecisions(activeGroup.groupId, userId);
    setDecisions(data);
    setLoading(false);
  }, [activeGroup, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleVote(d: Decision, choice: VoteChoice) {
    if (!userId || !activeGroup) return;
    setVoting(d.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await voteOnDecision(d.id, userId, activeGroup.groupId, choice, d.title);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setVoting(null);
  }

  async function handleClose(d: Decision) {
    if (!activeGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await closeDecision(d.id, activeGroup.groupId, d.title);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    }
  }

  async function submitNew() {
    if (!userId || !activeGroup || !newTitle.trim()) return;
    setSubmitting(true);
    const res = await createDecision({
      groupId: activeGroup.groupId,
      title: newTitle,
      description: newDescription.trim() || undefined,
      category: newCategory,
      deadline: newDeadline || undefined,
      createdBy: userId,
    });
    setSubmitting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setNewTitle(''); setNewDescription(''); setNewCategory('outro'); setNewDeadline('');
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  const renderItem = ({ item: d }: { item: Decision }) => {
    const cat = CAT_META[d.category] || CAT_META.outro;
    const status = STATUS_META[d.status] || STATUS_META.aberta;
    const deadlineInfo = formatDeadline(d.deadline);
    const isOpen = d.status === 'aberta';
    const isMine = d.created_by === userId;
    const canVote = isOpen && d.myVote == null;
    const hasVoted = d.myVote != null;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/decisoes/[id]', params: { id: d.id } } as never)}
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.xl,
          padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
          borderWidth: canVote ? 1 : 0,
          borderColor: canVote ? `${cat.color}30` : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${cat.color}20`, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
              <Text style={{ fontSize: font.sizes.xs, color: cat.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>
                {cat.label}
              </Text>
              <View style={{ backgroundColor: `${status.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 1 }}>
                <Text style={{ fontSize: font.sizes.xs, color: status.color, fontWeight: font.weights.medium }}>{status.label}</Text>
              </View>
            </View>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }} numberOfLines={2}>
              {d.title}
            </Text>
            {d.description ? (
              <Text numberOfLines={2} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
                {d.description}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
              {deadlineInfo ? (
                <Text style={{ fontSize: font.sizes.xs, color: deadlineInfo.urgent ? colors.error : colors.textMuted }}>
                  {deadlineInfo.label}
                </Text>
              ) : null}
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                {d.authorName ? `por ${d.authorName}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Vote tallies */}
        {(d.yesCount || d.noCount || d.abstainCount) ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
            <Text style={{ fontSize: font.sizes.xs, color: '#4CAF50' }}>✓ {d.yesCount || 0}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: '#E53935' }}>✗ {d.noCount || 0}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>− {d.abstainCount || 0}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginLeft: 'auto' }}>
              {(d.yesCount || 0) + (d.noCount || 0) + (d.abstainCount || 0)}/{d.totalVoters || 0}
            </Text>
          </View>
        ) : null}

        {/* Inline vote buttons */}
        {canVote ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <VoteButton label="Contra" color="#E53935" onPress={() => handleVote(d, 'discordo')} disabled={voting === d.id} />
            <VoteButton label="Abster" color={colors.textSecondary} onPress={() => handleVote(d, 'abstencao')} disabled={voting === d.id} />
            <VoteButton label="A favor" color="#4CAF50" filled onPress={() => handleVote(d, 'concordo')} disabled={voting === d.id} />
          </View>
        ) : null}

        {/* Show my vote */}
        {hasVoted && isOpen ? (
          <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
              Você votou: {d.myVote === 'concordo' ? 'A favor' : d.myVote === 'discordo' ? 'Contra' : 'Abster'}
            </Text>
          </View>
        ) : null}

        {/* Creator can close */}
        {isMine && isOpen && ((d.yesCount || 0) + (d.noCount || 0) + (d.abstainCount || 0) > 0) ? (
          <TouchableOpacity
            onPress={() => handleClose(d)}
            style={{
              marginTop: spacing.sm, alignSelf: 'flex-start',
              paddingVertical: 4, paddingHorizontal: spacing.sm,
              borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderLight,
            }}
          >
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>Encerrar votação</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Decisões" />
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="🗳️" title="Nenhuma decisão" subtitle="Abra uma decisão para votação em grupo" />}
          renderItem={renderItem}
        />
      )}

      <FAB onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setComposerOpen(true); }} />

      {/* Composer modal */}
      <Modal visible={composerOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setComposerOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <View style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
            padding: spacing.xl, paddingBottom: 40,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Nova decisão
            </Text>

            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Título da decisão"
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingHorizontal: spacing.md, paddingVertical: spacing.md,
                fontSize: font.sizes.md, color: colors.text,
                marginBottom: spacing.sm,
              }}
            />
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Descrição (opcional)"
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingHorizontal: spacing.md, paddingVertical: spacing.md,
                fontSize: font.sizes.md, color: colors.text, minHeight: 80,
                marginBottom: spacing.md, textAlignVertical: 'top',
              }}
            />

            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Prazo (opcional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {[
                { id: 'none', label: 'Sem prazo', days: null },
                { id: '3d', label: 'Em 3 dias', days: 3 },
                { id: '7d', label: 'Em 1 semana', days: 7 },
                { id: '14d', label: 'Em 2 semanas', days: 14 },
              ].map(p => {
                const computed = p.days
                  // eslint-disable-next-line react-hooks/purity
                  ? new Date(Date.now() + p.days * 86400000).toISOString().slice(0, 10)
                  : '';
                const active = (p.days === null && !newDeadline) || newDeadline === computed;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setNewDeadline(computed)}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                      borderRadius: radius.md,
                      backgroundColor: active ? colors.brand : colors.bg,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(Object.keys(CAT_META) as DecisionCategory[]).map(k => {
                  const m = CAT_META[k];
                  const active = newCategory === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setNewCategory(k)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                        backgroundColor: active ? `${m.color}20` : colors.bg,
                        borderWidth: 1, borderColor: active ? m.color : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{m.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? m.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              disabled={submitting || !newTitle.trim()}
              onPress={submitNew}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md,
                alignItems: 'center',
                opacity: submitting || !newTitle.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Abrir decisão
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function VoteButton({ label, color, filled, onPress, disabled }: { label: string; color: string; filled?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1, paddingVertical: 10, borderRadius: radius.md,
        backgroundColor: filled ? color : 'transparent',
        borderWidth: 1, borderColor: filled ? color : colors.borderLight,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{
        color: filled ? '#fff' : color,
        fontSize: font.sizes.sm, fontWeight: filled ? font.weights.semibold : font.weights.medium,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
