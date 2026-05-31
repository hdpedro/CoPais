/* eslint-disable jsx-a11y/alt-text */
/**
 * Despesas — Native screen com Foundation collab (Fase 1A + 1B + 1C):
 *   - Badge "Nova" + chip de prioridade + "Visto por X" (Foundation 1A)
 *   - Edit / Cancel / Reopen / Cancel-respond modals (Edit/correção 1B)
 *   - Audit panel inline + filter chips + month grouping (UX 1C)
 *
 * Service ops vão por /api/expenses (backend faz audit + collab notify
 * atomicamente) — exceto approve/reject que ainda usam safeWrite legado
 * (offline support). Ver kindar-native/app/_src/services/expenses.ts.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator,
  Modal, Image, Pressable, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import {
  fetchExpenses,
  approveExpense,
  rejectExpense,
  deleteExpense,
  fetchFinancialSummary,
  fetchExpenseReads,
  fetchExpenseHistory,
  markExpenseRead,
  editExpense,
  requestCancelExpense,
  respondToCancelRequest,
  reopenApproval,
  type Expense,
  type ExpensePriority,
  type ExpenseRead,
  type ExpenseHistoryRow,
} from 'src/services/expenses';
import { EXPENSE_CATEGORIES } from 'src/lib/constants';
import { formatBRL as formatBRLShared } from 'src/lib/currency';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { confirmDestructive } from 'src/components/ui/DestructiveConfirm';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { track, EVENTS } from 'src/lib/analytics';

/* ─── Constants & helpers ────────────────────────────── */

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  pending:        { bg: 'rgba(232,162,40,0.1)', text: '#E8A228', label: 'Pendente' },
  approved:       { bg: 'rgba(76,175,80,0.1)',  text: '#4CAF50', label: 'Aprovada' },
  rejected:       { bg: 'rgba(229,57,53,0.1)',  text: '#E53935', label: 'Rejeitada' },
  cancelled:      { bg: 'rgba(120,120,120,0.1)', text: '#666',   label: 'Cancelada' },
  cancel_pending: { bg: 'rgba(232,162,40,0.1)', text: '#E8A228', label: 'Cancel. pendente' },
};

const PRIORITY_META: Record<ExpensePriority, { bg: string; text: string; label: string; rank: number }> = {
  info:      { bg: 'rgba(107,114,128,0.15)', text: '#4B5563', label: 'Info',       rank: 0 },
  important: { bg: 'rgba(245,158,11,0.18)',  text: '#B45309', label: 'Importante', rank: 1 },
  urgent:    { bg: 'rgba(239,68,68,0.18)',   text: '#B91C1C', label: 'Urgente',    rank: 2 },
};

function formatBRL(v: number): string {
  // Delegamos ao helper canônico em `src/lib/currency` pra ter grouping
  // correto via Intl.NumberFormat ("R$ 1.234,56" em vez de "R$ 1234,56").
  return formatBRLShared(v);
}

function formatReadAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';

const ACTION_LABELS: Record<string, string> = {
  created: 'criou', edited: 'editou', approved: 'aprovou', rejected: 'rejeitou',
  cancel_requested: 'pediu cancelamento', cancelled: 'cancelou',
  reopened: 'reabriu', restored: 'negou cancelamento',
};
const ACTION_ICONS: Record<string, string> = {
  created: '📝', edited: '✏️', approved: '✅', rejected: '❌',
  cancel_requested: '🚫', cancelled: '🗑️', reopened: '🔄', restored: '↩️',
};

export default function DespesasScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  const [optimisticReads, setOptimisticReads] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(highlight || null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  // Snapshot do tempo p/ checagem de janela 24h do reopen — evita
  // Date.now() em render (hooks/purity). Atualiza a cada load().
  const [loadTime, setLoadTime] = useState(() => Date.now());

  // Modals
  const [editing, setEditing] = useState<Expense | null>(null);
  const [canceling, setCanceling] = useState<Expense | null>(null);
  const [reopening, setReopening] = useState<Expense | null>(null);
  const [respondingCancel, setRespondingCancel] = useState<Expense | null>(null);

  interface DespesasCache {
    expenses: Expense[];
    reads: ExpenseRead[];
    balance: { myTotal: number; otherTotal: number; balance: number; totalMonth: number } | null;
  }
  const EMPTY_CACHE: DespesasCache = { expenses: [], reads: [], balance: null };
  const { data, loading, refresh: load } = useCachedFetch<DespesasCache>({
    cacheKey: activeGroup && userId ? `despesas_${activeGroup.groupId}_${userId}` : null,
    tag: 'despesas:load',
    empty: EMPTY_CACHE,
    fetcher: async () => {
      const [list, summary, readsList] = await Promise.all([
        fetchExpenses(activeGroup!.groupId),
        fetchFinancialSummary(activeGroup!.groupId, userId!),
        fetchExpenseReads(activeGroup!.groupId),
      ]);
      // Limpa optimistic reads que ja chegaram do server.
      const serverReadIds = new Set(readsList.filter(r => r.user_id === userId).map(r => r.expense_id));
      setOptimisticReads(prev => {
        const next = new Set<string>();
        for (const id of prev) if (!serverReadIds.has(id)) next.add(id);
        return next;
      });
      setLoadTime(Date.now());
      return { expenses: list, balance: summary, reads: readsList };
    },
  });
  const expenses = data.expenses;
  const reads = data.reads;
  const balance = data.balance;

  // Real-time entre coparentes (Foundation Collab): quando o outro pai
  // adiciona/edita despesa em outro device, lista atualiza sozinha + toast.
  useCollabRealtime({
    table: 'expenses',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'despesa',
    myUserId: userId,
  });

  // Push deep link → mark read + track.
  useEffect(() => {
    if (!highlight) return;
    track(EVENTS.NOTIFICATION_OPENED, { record_type: 'expense', record_id: highlight });
    const target = expenses.find(e => e.id === highlight);
    if (target) {
      const alreadyRead = reads.some(r => r.expense_id === highlight && r.user_id === userId);
      if (!alreadyRead && !optimisticReads.has(highlight)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOptimisticReads(prev => new Set(prev).add(highlight));
        void markExpenseRead(highlight);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, expenses.length]);

  // Unread snapshot for analytics.
  const readsByExpenseId = useMemo(() => {
    const m = new Map<string, ExpenseRead[]>();
    for (const r of reads) {
      const arr = m.get(r.expense_id) || [];
      arr.push(r);
      m.set(r.expense_id, arr);
    }
    return m;
  }, [reads]);

  function isUnread(e: Expense): boolean {
    if (optimisticReads.has(e.id)) return false;
    const arr = readsByExpenseId.get(e.id) || [];
    return !arr.some(r => r.user_id === userId);
  }

  function coparentReaders(e: Expense): ExpenseRead[] {
    const arr = readsByExpenseId.get(e.id) || [];
    return arr.filter(r => r.user_id !== userId);
  }

  const unreadCount = useMemo(
    () => expenses.filter(e => e.status !== 'cancelled' && e.status !== 'rejected' && isUnread(e)).length,
    [expenses, optimisticReads, readsByExpenseId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    track(EVENTS.UNREAD_COUNT, { record_type: 'expense', count: unreadCount });
  }, [unreadCount]);

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  function handleOpenCard(expense: Expense) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasExpanded = expandedId === expense.id;
    setExpandedId(wasExpanded ? null : expense.id);
    if (wasExpanded) return;
    if (isUnread(expense)) {
      setOptimisticReads(prev => new Set(prev).add(expense.id));
      void markExpenseRead(expense.id);
    }
  }

  /** Sort + filter into sections. */
  const sections = useMemo(() => {
    if (!userId) return [];
    const pendingForMe: Expense[] = [];
    const others: Expense[] = [];
    for (const e of expenses) {
      const passFilter = filter === 'all'
        ? e.status !== 'cancelled'
        : filter === 'cancelled'
          ? (e.status === 'cancelled' || e.status === 'cancel_pending')
          : e.status === filter;
      if (!passFilter) continue;
      if (e.status === 'pending' && e.paid_by !== userId) {
        pendingForMe.push(e);
      } else {
        others.push(e);
      }
    }

    const cmp = (a: Expense, b: Expense) => {
      const ua = isUnread(a) ? 1 : 0;
      const ub = isUnread(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      const pa = PRIORITY_META[a.priority]?.rank ?? 0;
      const pb = PRIORITY_META[b.priority]?.rank ?? 0;
      if (pa !== pb) return pb - pa;
      return b.expense_date.localeCompare(a.expense_date);
    };
    pendingForMe.sort(cmp);
    others.sort(cmp);

    const result: { title: string; data: Expense[] }[] = [];
    if (pendingForMe.length > 0) {
      result.push({ title: `Aguardando sua aprovação (${pendingForMe.length})`, data: pendingForMe });
    }
    if (others.length > 0) {
      result.push({ title: 'Histórico', data: others });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, userId, filter, optimisticReads, readsByExpenseId]);

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

  async function confirmDelete(expense: Expense) {
    const valor = expense.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const statusHint = expense.status === 'approved'
      ? '\n⚠️ Despesa já aprovada — apagar remove do histórico financeiro dos dois.'
      : expense.status === 'pending'
        ? '\nAguardando aprovação do co-responsável.'
        : '';
    const ok = await confirmDestructive({
      title: `Remover "${expense.description}"?`,
      warning: `Valor: ${valor}${statusHint}\n\nEsta ação não pode ser desfeita.`,
      destructiveLabel: 'Remover',
    });
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await deleteExpense(expense.id);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.deleteFailed'), variant: 'error' });
    }
  }

  async function openReceipt(expense: Expense) {
    if (!expense.receipt_url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { getSignedFileUrl } = await import('src/services/storage');
    const signed = await getSignedFileUrl('receipts', expense.receipt_url, 3600);
    setViewingReceipt(signed || expense.receipt_url);
  }

  /* ─── Card render ─────────────────────────────────────── */

  const renderItem = ({ item }: { item: Expense; section: { title: string } }) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === item.category);
    const statusMeta = STATUS_META[item.status] || STATUS_META.pending;
    const priorityMeta = PRIORITY_META[item.priority] || PRIORITY_META.info;
    const unread = isUnread(item);
    const expanded = expandedId === item.id;
    const isOwn = item.paid_by === userId;
    const canApprove = !isOwn && item.status === 'pending';
    const canRespondCancel = !isOwn && item.status === 'cancel_pending';
    const canEdit = isOwn && (item.status === 'pending' || item.status === 'rejected' || item.status === 'approved');
    const canCancel = isOwn && (item.status === 'pending' || item.status === 'rejected' || item.status === 'approved');
    const canDelete = isOwn && (item.status === 'pending' || item.status === 'rejected');
    // Snapshot do tempo no render parent (loadTime) pra evitar Date.now()
    // direto (hooks/purity proíbe). Recomputa a cada load() — bom o suficiente.
    const canReopen = !isOwn
      && item.status === 'approved'
      && item.approved_by === userId
      && item.approved_at
      && (loadTime - new Date(item.approved_at).getTime() < 24 * 60 * 60 * 1000);
    const readers = coparentReaders(item);
    const isHighlighted = highlight && item.id === highlight;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleOpenCard(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.description}, ${formatBRL(item.amount)}, ${statusMeta.label}${unread ? ', não lida' : ''}`}
        accessibilityState={{ expanded }}
        style={{
          backgroundColor: unread ? 'rgba(192,112,85,0.06)' : colors.bgElevated,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.sm,
          opacity: item.status === 'cancelled' ? 0.6 : 1,
          borderLeftWidth: 4,
          borderLeftColor: unread
            ? colors.brand
            : item.priority === 'urgent' ? '#EF4444'
            : item.priority === 'important' ? '#F59E0B'
            : 'transparent',
          borderWidth: isHighlighted ? 2 : 0,
          borderColor: isHighlighted ? colors.brand : 'transparent',
          ...shadows.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ fontSize: 22 }}>{cat?.icon || '📦'}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{
                fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text,
                textDecorationLine: item.status === 'cancelled' ? 'line-through' : 'none',
              }}>
                {item.description}
              </Text>
              {unread && (
                <View style={{ backgroundColor: colors.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Nova</Text>
                </View>
              )}
              {item.priority !== 'info' && (
                <View style={{ backgroundColor: priorityMeta.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: priorityMeta.text, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                    {priorityMeta.label}
                  </Text>
                </View>
              )}
              {item.edit_count > 0 && (
                <View style={{ backgroundColor: 'rgba(107,114,128,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: '#4B5563', fontSize: 10, fontWeight: '500' }}>editada</Text>
                </View>
              )}
              {item.receipt_url && <Ionicons name="receipt-outline" size={14} color={colors.textSecondary} />}
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
            <View style={{ backgroundColor: statusMeta.bg, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 }}>
              <Text style={{ fontSize: 10, color: statusMeta.text, fontWeight: font.weights.medium }}>
                {statusMeta.label}
              </Text>
            </View>
          </View>
        </View>

        {/* State info always visible */}
        {item.status === 'rejected' && item.rejection_reason && (
          <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.sm }}>
            <Text style={{ fontSize: 11, color: '#E53935' }}>Motivo: {item.rejection_reason}</Text>
          </View>
        )}
        {item.status === 'cancel_pending' && item.cancel_reason && (
          <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: 'rgba(232,162,40,0.08)', borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(232,162,40,0.3)' }}>
            <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>Pedido de cancelamento</Text>
            <Text style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>Motivo: {item.cancel_reason}</Text>
          </View>
        )}

        {/* Approve/reject quick actions */}
        {canApprove && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              disabled={responding === item.id}
              onPress={(e) => { e.stopPropagation(); handleDecision(item, 'rejected'); }}
              accessibilityRole="button"
              accessibilityLabel={`Rejeitar despesa ${item.description}`}
              accessibilityState={{ disabled: responding === item.id, busy: responding === item.id }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', opacity: responding === item.id ? 0.5 : 1 }}
            >
              {responding === item.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>Rejeitar</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={responding === item.id}
              onPress={(e) => { e.stopPropagation(); handleDecision(item, 'approved'); }}
              accessibilityRole="button"
              accessibilityLabel={`Aprovar despesa ${item.description}`}
              accessibilityState={{ disabled: responding === item.id, busy: responding === item.id }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', opacity: responding === item.id ? 0.5 : 1 }}
            >
              {responding === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>Aprovar</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel response */}
        {canRespondCancel && (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); setRespondingCancel(item); }}
            accessibilityRole="button"
            accessibilityLabel="Responder pedido de cancelamento"
            style={{ marginTop: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: '#E8A228', alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
              Responder pedido de cancelamento
            </Text>
          </TouchableOpacity>
        )}

        {/* Expanded: read receipts + actions + audit */}
        {expanded && (
          <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.sm }} onStartShouldSetResponder={() => true}>
            {readers.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 }}>
                {readers.map(r => (
                  <Text key={r.user_id} style={{ fontSize: 11, color: colors.brand }}>
                    ✓ Visto · {formatReadAt(r.read_at)}
                  </Text>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {item.receipt_url && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); openReceipt(item); }} accessibilityRole="button" accessibilityLabel="Ver comprovante" style={pillStyle('#374151', '#F3F4F6')}>
                  <Text style={pillText('#374151')}>📎 Comprovante</Text>
                </TouchableOpacity>
              )}
              {canEdit && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setEditing(item); }} accessibilityRole="button" accessibilityLabel={`Editar despesa${item.status === 'approved' ? ', reverte aprovação' : ''}`} style={pillStyle('#2E7268', 'rgba(46,114,104,0.1)')}>
                  <Text style={pillText('#2E7268')}>✏️ Editar{item.status === 'approved' ? ' (reverte aprovação)' : ''}</Text>
                </TouchableOpacity>
              )}
              {canCancel && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setCanceling(item); }} accessibilityRole="button" accessibilityLabel="Cancelar despesa" style={pillStyle('#B45309', 'rgba(232,162,40,0.1)')}>
                  <Text style={pillText('#B45309')}>🚫 Cancelar</Text>
                </TouchableOpacity>
              )}
              {canReopen && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setReopening(item); }} accessibilityRole="button" accessibilityLabel="Reabrir aprovação" style={pillStyle('#C07055', 'rgba(192,112,85,0.1)')}>
                  <Text style={pillText('#C07055')}>🔄 Reabrir (24h)</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); confirmDelete(item); }} accessibilityRole="button" accessibilityLabel="Excluir despesa" style={pillStyle('#E53935', 'rgba(229,57,53,0.1)')}>
                  <Text style={pillText('#E53935')}>🗑️ Excluir</Text>
                </TouchableOpacity>
              )}
            </View>

            <ExpenseAuditPanel expenseId={item.id} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const BalanceHeader = balance !== null ? (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Meu saldo
          </Text>
          {unreadCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unreadCount}</Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.brand, fontWeight: '600' }}>
                {unreadCount === 1 ? 'nova' : 'novas'}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: font.sizes['3xl'], fontWeight: font.weights.bold, color: balance.balance >= 0 ? colors.success : colors.error }}>
          {balance.balance >= 0 ? '+' : ''}{formatBRL(balance.balance)}
        </Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
          {balance.balance >= 0 ? 'você tem a receber' : 'você tem a pagar'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md }}>
          <View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Paguei (aprovado)</Text>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{formatBRL(balance.myTotal)}</Text>
          </View>
          <View>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Co-responsável pagou</Text>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{formatBRL(balance.otherTotal)}</Text>
          </View>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingTop: spacing.md, paddingBottom: 2 }}>
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(f => {
          const filterLabel = f === 'all' ? 'Tudo' : f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : f === 'rejected' ? 'Rejeitadas' : 'Canceladas';
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="radio"
              accessibilityState={{ selected: filter === f }}
              accessibilityLabel={`Filtrar por ${filterLabel}`}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs + 2,
                borderRadius: 999,
                backgroundColor: filter === f ? colors.brand : colors.bgElevated,
                borderWidth: filter === f ? 0 : 1,
                borderColor: colors.borderLight,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: filter === f ? '#fff' : colors.textSecondary }}>
                {filterLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('expensesPage.headerTitle')} />
      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={BalanceHeader}
          renderSectionHeader={({ section }) => (
            <Text style={{
              fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm,
            }}>
              {section.title}
            </Text>
          )}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="🧾" title={t('empty.despesas.title')} description={t('empty.despesas.description')} />}
        />
      )}
      <FAB onPress={() => router.push('/despesas/nova')} />

      {/* Receipt viewer */}
      <Modal visible={!!viewingReceipt} transparent animationType="fade" onRequestClose={() => setViewingReceipt(null)}>
        <Pressable onPress={() => setViewingReceipt(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' }}>
          {viewingReceipt && <Image source={{ uri: viewingReceipt }} style={{ width: '96%', height: '80%' }} resizeMode="contain" />}
          <TouchableOpacity onPress={() => setViewingReceipt(null)} accessibilityRole="button" accessibilityLabel="Fechar" style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      {editing && (
        <EditExpenseModal expense={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />
      )}

      {/* Cancel modal */}
      {canceling && (
        <ReasonModal
          title={canceling.status === 'approved' ? 'Pedir cancelamento' : 'Cancelar despesa'}
          description={canceling.status === 'approved'
            ? 'Esta despesa já foi aprovada. Vai precisar da concordância do coparente pra cancelar.'
            : 'Esta ação cancela a despesa. Audit trail preserva o registro.'}
          onClose={() => setCanceling(null)}
          onSubmit={async (reason) => {
            const res = await requestCancelExpense(canceling.id, reason);
            if (res.success) { setCanceling(null); await load(); }
            else toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
          }}
        />
      )}

      {/* Reopen modal */}
      {reopening && (
        <ReasonModal
          title="Reabrir aprovação"
          description="A despesa volta a 'pendente' e o criador pode editar antes de você aprovar de novo. Disponível por 24h após a aprovação."
          onClose={() => setReopening(null)}
          onSubmit={async (reason) => {
            const res = await reopenApproval(reopening.id, reason);
            if (res.success) { setReopening(null); await load(); }
            else toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
          }}
        />
      )}

      {/* Cancel respond modal */}
      {respondingCancel && (
        <CancelRespondModal
          expense={respondingCancel}
          onClose={() => setRespondingCancel(null)}
          onResponded={async () => { setRespondingCancel(null); await load(); }}
        />
      )}
    </View>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

function pillStyle(_textColor: string, bg: string) {
  return {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: bg,
  } as const;
}
function pillText(color: string) {
  return { color, fontSize: 12, fontWeight: '600' as const };
}

/** Lazy-loaded audit trail panel. Fetches on mount; só renderiza quando
 *  o card está expandido (ver renderItem). */
function ExpenseAuditPanel({ expenseId }: { expenseId: string }) {
  const [rows, setRows] = useState<ExpenseHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchExpenseHistory(expenseId);
      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expenseId]);

  if (loading) return <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>Carregando histórico…</Text>;
  if (!rows || rows.length === 0) return <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>Sem histórico.</Text>;

  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: radius.sm, padding: spacing.sm }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
        Histórico
      </Text>
      {rows.map(row => (
        <View key={row.id} style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 12 }}>{ACTION_ICONS[row.action] || '•'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: colors.text }}>
              <Text style={{ fontWeight: '600' }}>{(ACTION_LABELS[row.action] || row.action)}</Text>
              <Text style={{ color: colors.textMuted }}> · {new Date(row.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            </Text>
            {row.reason && (
              <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>{`"${row.reason}"`}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Modal de edição. Patch parcial → backend faz revert de aprovação se preciso. */
function EditExpenseModal({ expense, onClose, onSaved }: {
  expense: Expense;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [category, setCategory] = useState(expense.category);
  const [priority, setPriority] = useState<ExpensePriority>(expense.priority);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) { toast.show({ message: t('toasts.expense.descriptionRequired'), variant: 'error' }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast.show({ message: t('toasts.expense.invalidAmount'), variant: 'error' }); return; }
    setSaving(true);
    const res = await editExpense(expense.id, {
      description: description.trim(),
      amount: amt,
      category,
      priority,
    });
    setSaving(false);
    if (res.success) onSaved();
    else toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>Editar despesa</Text>

          {expense.status === 'approved' && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>⚠️ Já aprovada</Text>
              <Text style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>Qualquer mudança reverte a aprovação. Coparente precisa reaprovar.</Text>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={labelStyle()}>Descrição</Text>
            <TextInput value={description} onChangeText={setDescription} maxLength={200} style={inputStyle()} />

            <Text style={labelStyle()}>Valor (R$)</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={inputStyle()} />

            <Text style={labelStyle()}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {EXPENSE_CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === c.value }}
                  accessibilityLabel={c.label}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 36, borderRadius: 999,
                    borderWidth: 1, borderColor: category === c.value ? colors.brand : colors.borderLight,
                    backgroundColor: category === c.value ? `${colors.brand}15` : 'transparent',
                    justifyContent: 'center',
                  }}
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 12, color: category === c.value ? colors.brand : colors.textSecondary }}>{c.icon} {c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={labelStyle()}>Prioridade</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md }}>
              {(['info', 'important', 'urgent'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: priority === p }}
                  accessibilityLabel={p === 'info' ? 'Info' : p === 'important' ? 'Importante' : 'Urgente'}
                  style={{
                    flex: 1, paddingVertical: 12, minHeight: 44, borderRadius: radius.md,
                    borderWidth: 1, borderColor: priority === p ? colors.brand : colors.borderLight,
                    backgroundColor: priority === p ? `${colors.brand}15` : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: priority === p ? colors.brand : colors.textSecondary }}>
                    {p === 'info' ? 'Info' : p === 'important' ? 'Importante' : 'Urgente'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <PrimaryButton
              label="Salvar"
              onPress={handleSave}
              loading={saving}
              testID="despesa-inline-save"
            />
          </ScrollView>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

function ReasonModal({ title, description, onClose, onSubmit }: {
  title: string;
  description: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSaving(true);
    await onSubmit(reason.trim());
    setSaving(false);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>{title}</Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>{description}</Text>
          <Text style={labelStyle()}>Motivo (obrigatório)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            style={[inputStyle(), { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Explique brevemente"
            placeholderTextColor={colors.textMuted}
          />
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton
              label="Confirmar"
              onPress={handleSubmit}
              loading={saving}
              disabled={!reason.trim()}
              testID="despesa-reason-confirm"
            />
          </View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

function CancelRespondModal({ expense, onClose, onResponded }: {
  expense: Expense;
  onClose: () => void;
  onResponded: () => void;
}) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (approved === null) return;
    setSaving(true);
    const res = await respondToCancelRequest(expense.id, approved, reason.trim() || null);
    setSaving(false);
    if (res.success) onResponded();
    else toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <ModalBackdrop onClose={onClose} align="bottom" dim={0.4} padding={0}>
        <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.xs }}>Responder cancelamento</Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: spacing.md }}>
            {expense.paidByName} quer cancelar: <Text style={{ fontWeight: '600', color: colors.text }}>{expense.description}</Text> · {formatBRL(expense.amount)}
          </Text>
          {expense.cancel_reason && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', textTransform: 'uppercase' }}>Motivo</Text>
              <Text style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>{expense.cancel_reason}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <TouchableOpacity
              onPress={() => setApproved(true)}
              accessibilityRole="radio"
              accessibilityState={{ selected: approved === true }}
              accessibilityLabel="Concordo, cancelar"
              style={{
                flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                borderWidth: 1, borderColor: approved === true ? '#2E7268' : colors.borderLight,
                backgroundColor: approved === true ? 'rgba(46,114,104,0.1)' : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: approved === true ? '#2E7268' : colors.textSecondary }}>✅ Concordo (cancelar)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setApproved(false)}
              accessibilityRole="radio"
              accessibilityState={{ selected: approved === false }}
              accessibilityLabel="Não concordo"
              style={{
                flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                borderWidth: 1, borderColor: approved === false ? '#E53935' : colors.borderLight,
                backgroundColor: approved === false ? 'rgba(229,57,53,0.08)' : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: approved === false ? '#E53935' : colors.textSecondary }}>❌ Não concordo</Text>
            </TouchableOpacity>
          </View>

          {approved === false && (
            <>
              <Text style={labelStyle()}>Motivo (opcional)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={2}
                style={[inputStyle(), { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Por que não concorda?"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}

          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton
              label="Enviar resposta"
              onPress={handleSubmit}
              loading={saving}
              disabled={approved === null}
              testID="despesa-cancel-respond"
            />
          </View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

function labelStyle() {
  return {
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };
}
function inputStyle() {
  return {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.sizes.md,
    color: colors.text,
  };
}
