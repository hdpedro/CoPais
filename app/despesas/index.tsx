import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import { fetchExpenses, type Expense } from '../../src/services/expenses';
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

export default function DespesasScreen() {
  const { activeGroup } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchExpenses(activeGroup.groupId);
    setExpenses(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: Expense }) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === item.category);
    const status = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.lg,
          padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
          flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        }}
      >
        <Text style={{ fontSize: 22 }}>{cat?.icon || '📦'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
            {item.description}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
            {item.paidByName} · {item.expense_date?.split('-').reverse().join('/')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
            R$ {item.amount.toFixed(2)}
          </Text>
          <View style={{ backgroundColor: status.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 }}>
            <Text style={{ fontSize: font.sizes.xs, color: status.text, fontWeight: font.weights.medium }}>
              {status.label}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Despesas" />
      <FlatList
        data={expenses}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🧾" title="Nenhuma despesa" subtitle="Registre a primeira despesa compartilhada" />}
      />
      <FAB onPress={() => router.push('/despesas/nova')} />
    </View>
  );
}
