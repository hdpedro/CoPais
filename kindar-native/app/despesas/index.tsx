/* eslint-disable jsx-a11y/alt-text */
import { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import {
  fetchExpenses,
  approveExpense,
  rejectExpense,
  deleteExpense,
  fetchFinancialSummary,
  type Expense,
} from '../../src/services/expenses';
import { EXPENSE_CATEGORIES } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'rgba(232,162,40,0.1)', text: '#E8A228', label: 'Pendente' },
  approved: { bg: 'rgba(76,175,80,0.1)', text: '#4CAF50', label: 'Aprovada' },
  rejected: { bg: 'rgba(229,57,53,0.1)', text: '#E53935', label: 'Rejeitada' },
};

function formatBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

export default function DespesasScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<{ myTotal: number; otherTotal: number; balance: number; totalMonth: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const [list, summary] = await Promise.all([
      fetchExpenses(activeGroup.groupId),
      fetchFinancialSummary(activeGroup.groupId, userId),
    ]);
    setExpenses(list);
    setBalance(summary);
    setLoading(false);
  }, [activeGroup, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Split list into two sections: pending-for-me (needs approval) + everything else. */
  const sections = useMemo(() => {
    if (!userId) return [];
    const pendingForMe: Expense[] = [];
    const others: Expense[] = [];
    for (const e of expenses) {
      if (e.status === 'pending' && e.paid_by !== userId) {
        pendingForMe.push(e);
      } else {
        others.push(e);
      }
    }
    const result: { title: string; data: Expense[] }[] = [];
    if (pendingForMe.length > 0) {
      result.push({ title: `Aguardando sua aprovacao (${pendingForMe.length})`, data: pendingForMe });
    }
    if (others.length > 0) {
      result.push({ title: 'Historico', data: others });
    }
    return result;
  }, [expenses, userId]);

  async function handleDecision(expense: Expense, decision: 'approved' | 'rejected') {
    if (!userId || !activeGroup) return;
    setResponding(expense.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result =
      decision === 'approved'
        ? await approveExpense(expense.id, userId, activeGroup.groupId, expense.description)
        : await rejectExpense(expense.id, userId, activeGroup.groupId, expense.description);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setResponding(null);
  }

  function confirmDelete(expense: Expense) {
    Alert.alert(
      'Remover despesa',
      `Remover "${expense.description}"? Essa acao nao pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await deleteExpense(expense.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erro', res.error || 'Falha');
            }
          },
        },
      ]
    );
  }

  function handleItemPress(expense: Expense) {
    if (expense.receipt_url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewingReceipt(expense.receipt_url);
    }
  }

  const renderItem = ({ item, section }: { item: Expense; section: { title: string } }) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === item.category);
    const status = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const isActionable = section.title.startsWith('Aguardando');
    const canDelete = item.paid_by === userId && item.status === 'pending';
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleItemPress(item)}
        onLongPress={canDelete ? () => confirmDelete(item) : undefined}
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.lg,
          padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
          borderWidth: isActionable ? 1 : 0,
          borderColor: isActionable ? `${STATUS_COLORS.pending.text}40` : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ fontSize: 22 }}>{cat?.icon || '📦'}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, flex: 1 }}>
                {item.description}
              </Text>
              {item.receipt_url ? (
                <Ionicons name="receipt-outline" size={14} color={colors.textSecondary} />
              ) : null}
            </View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
              {item.paidByName} · {item.expense_date?.split('-').reverse().join('/')}
              {item.childName ? ` · ${item.childName}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
              {formatBRL(item.amount)}
            </Text>
            <View style={{ backgroundColor: status.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 }}>
              <Text style={{ fontSize: font.sizes.xs, color: status.text, fontWeight: font.weights.medium }}>
                {status.label}
              </Text>
            </View>
          </View>
        </View>
        {isActionable ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity
              disabled={responding === item.id}
              onPress={() => handleDecision(item, 'rejected')}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                alignItems: 'center',
                opacity: responding === item.id ? 0.5 : 1,
              }}
            >
              {responding === item.id ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                  Rejeitar
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={responding === item.id}
              onPress={() => handleDecision(item, 'approved')}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: radius.md,
                backgroundColor: colors.brand,
                alignItems: 'center',
                opacity: responding === item.id ? 0.5 : 1,
              }}
            >
              {responding === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                  Aprovar
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const BalanceHeader = balance !== null ? (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={{
        backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md,
      }}>
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
          Meu saldo
        </Text>
        <Text style={{
          fontSize: font.sizes['3xl'], fontWeight: font.weights.bold,
          color: balance.balance >= 0 ? colors.success : colors.error,
        }}>
          {balance.balance >= 0 ? '+' : ''}{formatBRL(balance.balance)}
        </Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
          {balance.balance >= 0 ? 'voce tem a receber' : 'voce tem a pagar'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md }}>
          <View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Paguei (aprovado)</Text>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
              {formatBRL(balance.myTotal)}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Co-responsavel pagou</Text>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
              {formatBRL(balance.otherTotal)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Despesas" />
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={BalanceHeader}
          renderSectionHeader={({ section }) => (
            <Text style={{
              fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
              color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
              marginTop: spacing.lg, marginBottom: spacing.sm,
            }}>
              {section.title}
            </Text>
          )}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState icon="🧾" title="Nenhuma despesa" subtitle="Registre a primeira despesa compartilhada" />
          }
        />
      )}
      <FAB onPress={() => router.push('/despesas/nova')} />

      {/* Receipt viewer modal */}
      <Modal visible={!!viewingReceipt} transparent animationType="fade" onRequestClose={() => setViewingReceipt(null)}>
        <Pressable
          onPress={() => setViewingReceipt(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' }}
        >
          {viewingReceipt ? (
            <Image source={{ uri: viewingReceipt }} style={{ width: '96%', height: '80%' }} resizeMode="contain" />
          ) : null}
          <TouchableOpacity
            onPress={() => setViewingReceipt(null)}
            style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}
