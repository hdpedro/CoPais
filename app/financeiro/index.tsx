import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { fetchFinancialSummary } from '../../src/services/expenses';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

export default function FinanceiroScreen() {
  const { userId, activeGroup } = useAuth();
  const [summary, setSummary] = useState<{ myTotal: number; otherTotal: number; balance: number; totalMonth: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const data = await fetchFinancialSummary(activeGroup.groupId, userId);
    setSummary(data);
  }, [activeGroup, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const balanceColor = (summary?.balance || 0) >= 0 ? colors.success : colors.error;
  const balanceLabel = (summary?.balance || 0) >= 0 ? 'A receber' : 'A pagar';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Financeiro" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Balance card */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.md }}>
          <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Saldo
          </Text>
          <Text style={{ fontSize: font.sizes['4xl'], fontWeight: font.weights.extrabold, color: balanceColor, marginTop: spacing.sm }}>
            R$ {Math.abs(summary?.balance || 0).toFixed(2)}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: balanceColor, fontWeight: font.weights.medium }}>
            {balanceLabel}
          </Text>
        </View>

        {/* Summary row */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}>
          <View style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm }}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Voce pagou</Text>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              R$ {(summary?.myTotal || 0).toFixed(2)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm }}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Outro pagou</Text>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              R$ {(summary?.otherTotal || 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/despesas'); }}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm, marginBottom: spacing.sm }}>
          <Ionicons name="receipt-outline" size={20} color={colors.brand} />
          <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>Ver despesas</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
