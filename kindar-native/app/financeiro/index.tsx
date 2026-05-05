/**
 * Financeiro — refactor 2026-05-05 pra suportar 2 modos:
 *
 *   isShared = false  (usuario sozinho no grupo)
 *     - Sem saldo, sem "a pagar / a receber"
 *     - Sem aba Acertar nem aba Histórico
 *     - Sem botão Registrar pagamento
 *     - Mostra "Seus gastos" + CTA pra convidar coparente
 *
 *   isShared = true   (existe pelo menos 1 co-responsavel)
 *     - Saldo, settlements, abas completas — comportamento original
 *
 * `isShared` é derivado em runtime de `members.length > 0` onde members
 * exclui o proprio usuario e filtra `role='parent'` (paridade com PWA).
 *
 * Mantemos Alert removido — toda prevenção é via UI (não renderizar
 * botão de ação inválida em vez de bloquear no clique).
 */
import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { fetchFinancialSummary, fetchMonthlySpending } from '../../src/services/expenses';
import {
  listSettlements, createSettlement, confirmSettlement, computeBalanceOwed,
  type Settlement,
} from '../../src/services/settlements';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface MemberOption {
  user_id: string;
  name: string;
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type ViewMode = 'dashboard' | 'settlements' | 'history';

const MEMBER_COLORS = ['#5B9E85', '#D4735A', '#F4A261', '#8E6E95', '#3B82F6', '#E76F51'];

export default function FinanceiroScreen() {
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const [summary, setSummary] = useState<{ myTotal: number; otherTotal: number; balance: number; totalMonth: number } | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [allMembers, setAllMembers] = useState<{ user_id: string; name: string; color: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [monthlySpending, setMonthlySpending] = useState<{
    totalMonth: number;
    memberSpending: Record<string, number>;
    expensesCount: number;
  }>({ totalMonth: 0, memberSpending: {}, expensesCount: 0 });

  // Settlement modal
  const [modalOpen, setModalOpen] = useState(false);
  const [paidTo, setPaidTo] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [refNote, setRefNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [balanceForCounter, setBalanceForCounter] = useState<number | null>(null);

  // ── Derived state ───────────────────────────────────────────────
  // Single source of truth for the entire module's behavior.
  const isShared = members.length > 0;

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const groupId = activeGroup.groupId;

    const [summaryData, settlementsData, monthlyData, { data: memberRows }] = await Promise.all([
      fetchFinancialSummary(groupId, userId),
      listSettlements(groupId, 100),
      fetchMonthlySpending(groupId, selectedMonth, selectedYear),
      supabase
        .from('group_members')
        .select('user_id, role, profiles(full_name)')
        .eq('group_id', groupId)
        .eq('role', 'parent'),
    ]);

    setSummary(summaryData);
    setSettlements(settlementsData);
    setMonthlySpending(monthlyData);

    type MemberRow = { user_id: string; profiles: { full_name: string | null } | null };
    const allRows = ((memberRows as MemberRow[] | null) || []).map((m, idx) => ({
      user_id: m.user_id,
      name: m.profiles?.full_name?.split(' ')[0] ?? 'Co-responsável',
      color: MEMBER_COLORS[idx % MEMBER_COLORS.length],
    }));
    setAllMembers(allRows);
    setMembers(
      allRows
        .filter((m) => m.user_id !== userId)
        .map((m) => ({ user_id: m.user_id, name: m.name })),
    );
  }, [activeGroup, userId, selectedMonth, selectedYear]);

  function navigateMonth(delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setSelectedMonth(m);
    setSelectedYear(y);
  }

  // History view — only relevant in shared mode (no settlements when alone).
  const historyByMonth = useMemo(() => {
    const groups: Record<string, Settlement[]> = {};
    settlements.forEach((s) => {
      const key = (s.settlement_date || '').slice(0, 7);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({ key, items: groups[key] }));
  }, [settlements]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const balanceColor = (summary?.balance || 0) >= 0 ? colors.success : colors.error;
  const balanceLabel = (summary?.balance || 0) >= 0 ? 'A receber' : 'A pagar';

  const pendingForMe = useMemo(
    () => settlements.filter((s) => s.status === 'pending' && s.paid_to === userId),
    [settlements, userId],
  );
  const recentConfirmed = useMemo(
    () => settlements.filter((s) => s.status === 'confirmed').slice(0, 5),
    [settlements],
  );

  // Settlement modal — only callable when isShared. UI never renders the
  // button otherwise, but we keep a defensive no-op in case of stale state.
  async function openSettlementModal() {
    if (!isShared) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = members[0].user_id;
    setPaidTo(target);
    setAmount('');
    setPaymentMethod('pix');
    setRefNote('');
    setModalOpen(true);
    if (userId) {
      const b = await computeBalanceOwed(activeGroup!.groupId, userId, target);
      setBalanceForCounter(b);
    }
  }

  async function changeRecipient(uid: string) {
    setPaidTo(uid);
    if (userId && activeGroup) {
      const b = await computeBalanceOwed(activeGroup.groupId, userId, uid);
      setBalanceForCounter(b);
    }
  }

  async function handleSubmitSettlement() {
    if (!userId || !activeGroup || !paidTo) return;
    const value = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    setSubmitting(true);
    const res = await createSettlement({
      groupId: activeGroup.groupId,
      paidBy: userId,
      paidTo,
      amount: value,
      paymentMethod,
      referenceNote: refNote,
    });
    setSubmitting(false);
    if (!res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', res.error || 'Falha ao registrar pagamento.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModalOpen(false);
    await load();
  }

  async function handleConfirmSettlement(s: Settlement) {
    if (!userId) return;
    Alert.alert(
      'Confirmar recebimento',
      `Confirma que recebeu R$ ${s.amount.toFixed(2)} de ${s.paidByName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            const res = await confirmSettlement(s.id);
            if (!res.success) {
              Alert.alert('Erro', res.error || 'Falha.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await load();
          },
        },
      ],
    );
  }

  // ── Tabs ────────────────────────────────────────────────────────
  // Single mode: only "Resumo" (no Acertar/Histórico). Shared mode:
  // all 3 tabs as before.
  const visibleTabs = isShared
    ? ([
        { value: 'dashboard' as const, label: 'Resumo' },
        { value: 'settlements' as const, label: 'Acertar' },
        { value: 'history' as const, label: 'Histórico' },
      ])
    : ([{ value: 'dashboard' as const, label: 'Resumo' }]);

  // Force back to Resumo if the user lands on a tab that no longer applies
  // (e.g. coparent removed mid-session). Defensive.
  const safeViewMode: ViewMode = visibleTabs.some((t) => t.value === viewMode) ? viewMode : 'dashboard';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Financeiro" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* View toggle — só aparece se houver mais de 1 aba */}
        {visibleTabs.length > 1 ? (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.bgSurface,
              borderRadius: radius.lg,
              padding: 4,
              marginBottom: spacing.lg,
            }}
          >
            {visibleTabs.map((opt) => {
              const active = safeViewMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { Haptics.selectionAsync(); setViewMode(opt.value); }}
                  testID={`finance-view-${opt.value}`}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.bgElevated : 'transparent',
                    ...(active ? shadows.sm : {}),
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: font.sizes.sm,
                    fontWeight: active ? font.weights.semibold : font.weights.medium,
                    color: active ? colors.text : colors.textMuted,
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* Balance card — Resumo + Acertar (apenas em modo shared) */}
        {isShared && safeViewMode !== 'history' ? (
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
        ) : null}

        {/* Solo card — substitui o Saldo quando isShared=false */}
        {!isShared && safeViewMode === 'dashboard' ? (
          <View
            testID="finance-solo-empty-state"
            style={{
              backgroundColor: `${colors.brand}10`,
              borderWidth: 1,
              borderColor: `${colors.brand}30`,
              borderRadius: radius.xl,
              padding: spacing.xl,
              marginBottom: spacing.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <View
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: `${colors.brand}20`,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="people-outline" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                  Divida despesas com outra pessoa
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                  Adicione um co-responsável para dividir gastos automaticamente.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/convite/enviar'); }}
              testID="finance-add-coparent"
              style={{
                backgroundColor: colors.brand,
                borderRadius: radius.md,
                paddingVertical: spacing.md,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                Adicionar co-responsável
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Per-parent monthly breakdown — só Resumo */}
        {safeViewMode === 'dashboard' ? (
          <>
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <TouchableOpacity onPress={() => navigateMonth(-1)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                  {MONTH_NAMES[selectedMonth]} {selectedYear}
                </Text>
                <TouchableOpacity onPress={() => navigateMonth(1)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textAlign: 'center' }}>
                {isShared ? 'Total no mês' : 'Seus gastos no mês'}
              </Text>
              <Text style={{ fontSize: font.sizes['3xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center', marginTop: 2 }}>
                R$ {monthlySpending.totalMonth.toFixed(2)}
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>
                {monthlySpending.expensesCount} {monthlySpending.expensesCount === 1 ? 'despesa' : 'despesas'}
              </Text>
            </View>

            {/* Per-parent breakdown — só faz sentido em shared */}
            {isShared && allMembers.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
                {allMembers.map((m) => {
                  const spent = monthlySpending.memberSpending[m.user_id] || 0;
                  const pct = monthlySpending.totalMonth > 0
                    ? (spent / monthlySpending.totalMonth) * 100
                    : 0;
                  const isMe = m.user_id === userId;
                  return (
                    <View key={m.user_id} style={{
                      flexBasis: '48%',
                      flexGrow: 1,
                      backgroundColor: colors.bgElevated,
                      borderRadius: radius.lg,
                      padding: spacing.md,
                      ...shadows.sm,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color }} />
                        <Text numberOfLines={1} style={{ fontSize: font.sizes.xs, color: colors.textMuted, flex: 1 }}>
                          {m.name}{isMe ? ' (você)' : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                        R$ {spent.toFixed(2)}
                      </Text>
                      <View style={{ height: 6, backgroundColor: colors.bgSurface, borderRadius: 3, marginTop: spacing.xs, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: m.color, borderRadius: 3 }} />
                      </View>
                      <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                        {pct.toFixed(0)}% do total
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Você pagou / Outro pagou — só shared */}
        {isShared && safeViewMode === 'dashboard' ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}>
            <View style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Você pagou (total)</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                R$ {(summary?.myTotal || 0).toFixed(2)}
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Outro pagou (total)</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                R$ {(summary?.otherTotal || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Pending settlements — só shared */}
        {isShared && safeViewMode !== 'history' && pendingForMe.length > 0 ? (
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
              Aguardando sua confirmação
            </Text>
            {pendingForMe.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => handleConfirmSettlement(s)}
                style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: `${colors.brand}40`, ...shadows.sm }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Ionicons name="cash-outline" size={20} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                      R$ {s.amount.toFixed(2)} de {s.paidByName}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                      {(s.payment_method || 'PIX').toUpperCase()}
                      {s.reference_note ? ` · ${s.reference_note.slice(0, 40)}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.brand }}>Confirmar</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Action: register payment — só shared */}
        {isShared && safeViewMode !== 'history' ? (
          <TouchableOpacity
            onPress={openSettlementModal}
            testID="finance-settlement-cta"
            accessibilityLabel="Registrar pagamento"
            style={{ backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.md, marginBottom: spacing.sm }}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={{ fontSize: font.sizes.md, color: '#fff', fontWeight: font.weights.semibold, flex: 1 }}>Registrar pagamento</Text>
            <Ionicons name="chevron-forward" size={16} color="#ffffffaa" />
          </TouchableOpacity>
        ) : null}

        {/* Action: ver despesas — Resumo (sempre visível) */}
        {safeViewMode === 'dashboard' ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/despesas'); }}
            testID="finance-nova-despesa"
            accessibilityLabel="Ver despesas"
            style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm, marginBottom: spacing.lg }}
          >
            <Ionicons name="receipt-outline" size={20} color={colors.brand} />
            <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>Ver despesas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        ) : null}

        {/* Recent confirmed history — só shared */}
        {isShared && safeViewMode === 'dashboard' && recentConfirmed.length > 0 ? (
          <View>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
              Histórico recente
            </Text>
            {recentConfirmed.map((s) => {
              const iAmPayer = s.paid_by === userId;
              return (
                <View key={s.id} style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Ionicons
                      name={iAmPayer ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                      size={18}
                      color={iAmPayer ? colors.error : colors.success}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
                        {iAmPayer ? `Pagou ${s.paidToName}` : `Recebeu de ${s.paidByName}`}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                        {(s.settlement_date || '').split('-').reverse().join('/')} · {(s.payment_method || 'pix').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: colors.text }}>
                      R$ {s.amount.toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Full history view — só shared (ainda assim a aba só aparece em shared) */}
        {isShared && safeViewMode === 'history' ? (
          historyByMonth.length === 0 ? (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing['2xl'], alignItems: 'center', ...shadows.sm }}>
              <Ionicons name="archive-outline" size={32} color={colors.textMuted} />
              <Text style={{ marginTop: spacing.md, fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center' }}>
                Nenhum pagamento registrado ainda.
              </Text>
            </View>
          ) : (
            historyByMonth.map((group) => {
              const [y, mo] = group.key.split('-');
              const label = `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
              const total = group.items
                .filter((s) => s.status === 'confirmed')
                .reduce((acc, s) => acc + s.amount, 0);
              return (
                <View key={group.key} style={{ marginBottom: spacing.lg }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm }}>
                    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                      R$ {total.toFixed(2)}
                    </Text>
                  </View>
                  {group.items.map((s) => {
                    const iAmPayer = s.paid_by === userId;
                    const isPending = s.status === 'pending';
                    return (
                      <View key={s.id} style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, opacity: isPending ? 0.85 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                          <Ionicons
                            name={iAmPayer ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                            size={18}
                            color={iAmPayer ? colors.error : colors.success}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
                              {iAmPayer ? `Pagou ${s.paidToName}` : `Recebeu de ${s.paidByName}`}
                            </Text>
                            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                              {(s.settlement_date || '').split('-').reverse().join('/')} · {(s.payment_method || 'pix').toUpperCase()}
                              {isPending ? ' · Pendente' : ''}
                            </Text>
                            {s.reference_note ? (
                              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                                {s.reference_note}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.bold, color: colors.text }}>
                            R$ {s.amount.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )
        ) : null}
      </ScrollView>

      {/* Settlement modal — só renderiza se isShared (e mesmo assim modalOpen tem que ser true) */}
      <Modal visible={modalOpen && isShared} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ flex: 1, backgroundColor: '#00000080' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xl + insets.bottom }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>Registrar pagamento</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.xs }}>Para quem</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.user_id}
                  onPress={() => changeRecipient(m.user_id)}
                  testID={`finance-member-${m.user_id}`}
                  accessibilityLabel={m.name}
                  style={{
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                    borderRadius: radius.md, borderWidth: 1,
                    backgroundColor: paidTo === m.user_id ? colors.brand : 'transparent',
                    borderColor: paidTo === m.user_id ? colors.brand : colors.borderLight,
                  }}
                >
                  <Text style={{ color: paidTo === m.user_id ? '#fff' : colors.text, fontWeight: font.weights.medium }}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {balanceForCounter !== null ? (
              <Text style={{ fontSize: font.sizes.xs, color: balanceForCounter > 0 ? colors.error : colors.textMuted, marginBottom: spacing.md }}>
                {balanceForCounter > 0
                  ? `Você deve R$ ${balanceForCounter.toFixed(2)} a este coparente.`
                  : balanceForCounter < 0
                    ? `Você está com saldo positivo de R$ ${Math.abs(balanceForCounter).toFixed(2)}.`
                    : 'Saldo zerado com este coparente.'}
              </Text>
            ) : null}

            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.xs }}>Valor (R$)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.lg, color: colors.text, marginBottom: spacing.lg }}
            />

            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.xs }}>Forma de pagamento</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {PAYMENT_METHODS.map((pm) => (
                <TouchableOpacity
                  key={pm.value}
                  onPress={() => setPaymentMethod(pm.value)}
                  style={{
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                    borderRadius: radius.md, borderWidth: 1,
                    backgroundColor: paymentMethod === pm.value ? colors.brand : 'transparent',
                    borderColor: paymentMethod === pm.value ? colors.brand : colors.borderLight,
                  }}
                >
                  <Text style={{ color: paymentMethod === pm.value ? '#fff' : colors.text, fontSize: font.sizes.sm }}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.xs }}>Referência (opcional)</Text>
            <TextInput
              value={refNote}
              onChangeText={setRefNote}
              placeholder="Ex: Aluguel março"
              placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.xl }}
            />

            <TouchableOpacity
              onPress={handleSubmitSettlement}
              disabled={submitting}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', opacity: submitting ? 0.5 : 1 }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Registrar pagamento</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
