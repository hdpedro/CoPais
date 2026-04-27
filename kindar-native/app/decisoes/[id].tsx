/**
 * Decisao — detail view with arguments thread + votes.
 * Mirrors PWA /decisoes detail experience.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import {
  fetchDecisions, fetchArguments, postArgument, voteOnDecision, closeDecision,
  type Decision, type DecisionArgument, type VoteChoice,
} from '../../src/services/decisions';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const CAT_META: Record<string, { icon: string; color: string; label: string }> = {
  escola: { icon: '🎒', color: '#3B82F6', label: 'Escola' },
  saude: { icon: '🏥', color: '#EF4444', label: 'Saude' },
  atividade: { icon: '⚽', color: '#22C55E', label: 'Atividade' },
  viagem: { icon: '✈️', color: '#8B5CF6', label: 'Viagem' },
  financeiro: { icon: '💰', color: '#F59E0B', label: 'Financeiro' },
  moradia: { icon: '🏠', color: '#5B9E85', label: 'Moradia' },
  outro: { icon: '📋', color: '#6B7280', label: 'Outro' },
};

const STANCE_META: Record<string, { label: string; color: string; icon: string }> = {
  favor: { label: 'A favor', color: '#4CAF50', icon: '👍' },
  contra: { label: 'Contra', color: '#E53935', icon: '👎' },
  neutro: { label: 'Neutro', color: '#8A8A8A', icon: '💭' },
};

export default function DecisionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeGroup, userId } = useAuth();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [args, setArgs] = useState<DecisionArgument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newArg, setNewArg] = useState('');
  const [newStance, setNewStance] = useState<'favor' | 'contra' | 'neutro'>('favor');
  const [posting, setPosting] = useState(false);
  const [voting, setVoting] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup || !userId || !id) return;
    const [all, argList] = await Promise.all([
      fetchDecisions(activeGroup.groupId, userId),
      fetchArguments(id),
    ]);
    const found = all.find(d => d.id === id) || null;
    setDecision(found);
    setArgs(argList);
    setLoading(false);
  }, [activeGroup, userId, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Subscribe to realtime argument inserts
  useFocusEffect(useCallback(() => {
    if (!id) return undefined;
    const channel = supabase
      .channel(`decision-args-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'decision_arguments', filter: `decision_id=eq.${id}` }, () => {
        fetchArguments(id).then(setArgs);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]));

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  async function handleVote(choice: VoteChoice) {
    if (!decision || !userId || !activeGroup) return;
    setVoting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await voteOnDecision(decision.id, userId, activeGroup.groupId, choice, decision.title);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setVoting(false);
  }

  async function handlePostArg() {
    if (!decision || !userId || !activeGroup || !newArg.trim()) return;
    setPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await postArgument({
      decisionId: decision.id,
      userId,
      groupId: activeGroup.groupId,
      stance: newStance,
      text: newArg,
      decisionTitle: decision.title,
    });
    setPosting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewArg('');
      setNewStance('favor');
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', res.error || 'Nao foi possivel publicar o argumento');
    }
  }

  async function handleClose() {
    if (!decision || !activeGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await closeDecision(decision.id, activeGroup.groupId, decision.title);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    }
  }

  if (loading || !decision) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const cat = CAT_META[decision.category] || CAT_META.outro;
  const isOpen = decision.status === 'aberta';
  const isMine = decision.created_by === userId;
  const totalVotes = (decision.yesCount || 0) + (decision.noCount || 0) + (decision.abstainCount || 0);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }} numberOfLines={1}>
          Decisao
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Title card */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.sm, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${cat.color}20`, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
            </View>
            <Text style={{ fontSize: font.sizes.xs, color: cat.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>
              {cat.label}
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {decision.title}
          </Text>
          {decision.description ? (
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 }}>
              {decision.description}
            </Text>
          ) : null}
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
            {decision.authorName ? `Proposta por ${decision.authorName}` : ''}
            {decision.deadline ? ` · Prazo ${decision.deadline}` : ''}
          </Text>

          {/* Vote tallies */}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
            <Tally label="A favor" count={decision.yesCount || 0} color="#4CAF50" />
            <Tally label="Contra" count={decision.noCount || 0} color="#E53935" />
            <Tally label="Abster" count={decision.abstainCount || 0} color={colors.textMuted} />
            <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Participacao</Text>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                {totalVotes}/{decision.totalVoters || 0}
              </Text>
            </View>
          </View>

          {/* Vote buttons */}
          {isOpen ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <VoteBtn active={decision.myVote === 'discordo'} label="Contra" color="#E53935" onPress={() => handleVote('discordo')} disabled={voting} />
              <VoteBtn active={decision.myVote === 'abstencao'} label="Abster" color={colors.textSecondary} onPress={() => handleVote('abstencao')} disabled={voting} />
              <VoteBtn active={decision.myVote === 'concordo'} label="A favor" color="#4CAF50" onPress={() => handleVote('concordo')} disabled={voting} />
            </View>
          ) : null}

          {isMine && isOpen && totalVotes > 0 ? (
            <TouchableOpacity onPress={handleClose} style={{ marginTop: spacing.md, alignSelf: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight }}>
              <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>Encerrar e calcular resultado</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Arguments thread */}
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
          Argumentos ({args.length})
        </Text>

        {args.length === 0 ? (
          <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.lg, alignItems: 'center' }}>
            <Text style={{ fontSize: 36, marginBottom: spacing.sm }}>💬</Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center' }}>
              Ninguem argumentou ainda. Seja o primeiro a dar seu ponto de vista.
            </Text>
          </View>
        ) : (
          args.map(a => {
            const stance = STANCE_META[a.stance] || STANCE_META.neutro;
            return (
              <View key={a.id} style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, borderLeftWidth: 3, borderLeftColor: stance.color }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14 }}>{stance.icon}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: stance.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>
                    {stance.label}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                    · {a.authorName}
                  </Text>
                </View>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>{a.text}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Argument composer */}
      {isOpen ? (
        <View style={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.bgElevated, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            {(['favor', 'contra', 'neutro'] as const).map(s => {
              const m = STANCE_META[s];
              const active = newStance === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setNewStance(s)}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md,
                    backgroundColor: active ? `${m.color}20` : 'transparent',
                    borderWidth: 1, borderColor: active ? m.color : colors.borderLight,
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{m.icon}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: active ? m.color : colors.textSecondary, fontWeight: active ? font.weights.semibold : font.weights.medium }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <TextInput
              value={newArg}
              onChangeText={setNewArg}
              placeholder="Seu argumento..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                flex: 1,
                backgroundColor: colors.bg, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                paddingHorizontal: spacing.md, paddingVertical: 8,
                fontSize: font.sizes.md, color: colors.text,
                maxHeight: 100,
              }}
            />
            <TouchableOpacity
              disabled={posting || !newArg.trim()}
              onPress={handlePostArg}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: colors.brand,
                alignItems: 'center', justifyContent: 'center',
                opacity: posting || !newArg.trim() ? 0.4 : 1,
              }}
            >
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Tally({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color }}>{count}</Text>
    </View>
  );
}

function VoteBtn({ active, label, color, onPress, disabled }: { active: boolean; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1, paddingVertical: 10, borderRadius: radius.md,
        backgroundColor: active ? color : 'transparent',
        borderWidth: 1, borderColor: active ? color : colors.borderLight,
        alignItems: 'center', opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: active ? '#fff' : color, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
