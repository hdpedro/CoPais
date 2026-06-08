/**
 * SwapBalanceCard — Entry point for the custody day-balance feature.
 *
 * Shows current per-user balance, and exposes two actions:
 *   - "Ver historico"  → BalanceHistorySheet
 *   - "Propor ajuste"  → ProposeBalanceAdjustmentSheet
 *
 * Mirrors PWA /calendario/SwapBalanceCard.
 */

import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { MemberColor } from '../../hooks/useCalendar';
import { type BalanceOperation } from '../../services/balance-operations';
import {
  computeSwapBalance,
  getEffectiveBalance,
  type CustodyEventRaw,
} from '../../lib/calendar-balance';
import BalanceHistorySheet from './BalanceHistorySheet';
import ProposeBalanceAdjustmentSheet from './ProposeBalanceAdjustmentSheet';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface Props {
  operations: BalanceOperation[];
  /** Raw custody_events — usado pra calcular saldo automatico de swaps
   *  (paridade com PWA src/lib/calendar-utils.ts:computeSwapBalance). */
  custodyEvents: CustodyEventRaw[];
  members: MemberColor[];
  currentUserId: string;
  groupId: string;
  onChanged?: () => void;
}

export default function SwapBalanceCard({ operations, custodyEvents, members, currentUserId, groupId, onChanged }: Props) {
  const t = useI18n(s => s.t);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const balanceByUser = useMemo(() => {
    const parentIds = members.map(m => m.userId);
    // 1. Saldo bruto: comparar regular schedule vs custody com swaps.
    //    Cada dia onde owner_regular != owner_actual conta +1 / -1.
    const raw = computeSwapBalance(custodyEvents, parentIds);
    // 2. Operacoes manuais (waive/gift_day/forgive/reset) ajustam por cima.
    const opsRaw = operations.map(op => ({
      id: op.id,
      operation_type: op.operation_type,
      status: op.status,
      days: op.days || 1,
      proposed_by: op.proposed_by,
      target_user_id: op.target_user_id,
      responded_at: op.responded_at,
      created_at: op.created_at,
    }));
    const effective = getEffectiveBalance(raw, opsRaw);
    return effective.effectiveByUser;
  }, [custodyEvents, operations, members]);

  const pending = operations.filter(o => o.status === 'pending').length;

  const entries = members
    .map(m => ({ ...m, balance: balanceByUser[m.userId] || 0 }))
    .sort((a, b) => b.balance - a.balance);

  const isBalanced = entries.every(e => e.balance === 0);
  // Mostra o card sempre que houver swaps automaticos OU operacoes manuais.
  // No PWA o equivalente e `totalSwapDays > 0 || operations.length > 0`.
  const hasSwaps = entries.some(e => e.balance !== 0);
  const hasActivity = operations.length > 0 || hasSwaps;

  if (!hasActivity) return null;

  const target = members.find(m => m.userId !== currentUserId);
  const myBalance = balanceByUser[currentUserId] || 0;

  const statusColor = pending > 0 ? '#E8A228' : isBalanced ? '#16a34a' : '#E53935';
  const statusLabel = pending > 0
    ? (pending === 1 ? t('swapBalance.pendingOne') : t('swapBalance.pendingMany', { count: pending }))
    : isBalanced
      ? t('swapBalance.balanced')
      : (() => {
          const debtor = entries.find(e => e.balance < 0);
          if (!debtor) return t('swapBalance.adjusted');
          const days = Math.abs(debtor.balance);
          return days === 1
            ? t('swapBalance.owesOne', { name: debtor.name })
            : t('swapBalance.owesMany', { name: debtor.name, count: days });
        })();
  const statusIcon = pending > 0 ? '🟡' : isBalanced ? '🟢' : '🔴';

  return (
    <>
      <View style={{
        marginHorizontal: spacing.lg, marginBottom: spacing.lg,
        backgroundColor: colors.bgElevated, borderRadius: radius.xl,
        padding: spacing.lg, ...shadows.sm,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 16 }}>{statusIcon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
              {t('swapBalance.title')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: statusColor, fontWeight: font.weights.medium }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {!isBalanced ? (
          <View style={{ marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
            {entries.map(e => {
              if (e.balance === 0) return null;
              const isPositive = e.balance > 0;
              return (
                <View key={e.userId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.color }} />
                    <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{e.name}</Text>
                  </View>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: isPositive ? '#16a34a' : '#E53935' }}>
                    {isPositive ? '+' : ''}{e.balance} {Math.abs(e.balance) === 1 ? t('swapBalance.dayOne') : t('swapBalance.dayMany')}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => setHistoryOpen(true)}
            testID="balance-history-open"
            accessibilityLabel={t('swapBalance.historyA11y')}
            style={{
              flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>
              {t('swapBalance.history')}
            </Text>
          </TouchableOpacity>
          {target ? (
            <TouchableOpacity
              onPress={() => setProposeOpen(true)}
              testID="balance-propose-open"
              accessibilityLabel={t('swapBalance.proposeA11y')}
              style={{
                flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
                backgroundColor: colors.brand, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: font.sizes.xs, color: '#fff', fontWeight: font.weights.semibold }}>
                {t('swapBalance.propose')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <BalanceHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        operations={operations}
        currentUserId={currentUserId}
        groupId={groupId}
        onChanged={onChanged}
      />

      {target ? (
        <ProposeBalanceAdjustmentSheet
          visible={proposeOpen}
          onClose={() => setProposeOpen(false)}
          groupId={groupId}
          proposerId={currentUserId}
          targetUserId={target.userId}
          targetName={target.name}
          currentBalance={myBalance}
          onSubmitted={onChanged}
        />
      ) : null}
    </>
  );
}
