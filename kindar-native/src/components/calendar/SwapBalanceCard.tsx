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
import {
  type BalanceOperation,
  computeBalanceFromOps,
} from '../../services/balance-operations';
import BalanceHistorySheet from './BalanceHistorySheet';
import ProposeBalanceAdjustmentSheet from './ProposeBalanceAdjustmentSheet';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface Props {
  operations: BalanceOperation[];
  members: MemberColor[];
  currentUserId: string;
  groupId: string;
  onChanged?: () => void;
}

export default function SwapBalanceCard({ operations, members, currentUserId, groupId, onChanged }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const balanceByUser = useMemo(() => computeBalanceFromOps(operations), [operations]);
  const pending = operations.filter(o => o.status === 'pending').length;

  const entries = members
    .map(m => ({ ...m, balance: balanceByUser[m.userId] || 0 }))
    .sort((a, b) => b.balance - a.balance);

  const isBalanced = entries.every(e => e.balance === 0);
  const hasActivity = operations.length > 0;

  if (!hasActivity) return null;

  const target = members.find(m => m.userId !== currentUserId);
  const myBalance = balanceByUser[currentUserId] || 0;

  const statusColor = pending > 0 ? '#E8A228' : isBalanced ? '#16a34a' : '#E53935';
  const statusLabel = pending > 0
    ? `${pending} proposta(s) aguardando`
    : isBalanced
      ? 'Sem pendencias'
      : (() => {
          const debtor = entries.find(e => e.balance < 0);
          return debtor ? `${debtor.name} deve ${Math.abs(debtor.balance)} dia(s)` : 'Saldo ajustado';
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
              Saldo de dias
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
                    {isPositive ? '+' : ''}{e.balance} {Math.abs(e.balance) === 1 ? 'dia' : 'dias'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            onPress={() => setHistoryOpen(true)}
            style={{
              flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>
              Ver historico
            </Text>
          </TouchableOpacity>
          {target ? (
            <TouchableOpacity
              onPress={() => setProposeOpen(true)}
              style={{
                flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
                backgroundColor: colors.brand, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: font.sizes.xs, color: '#fff', fontWeight: font.weights.semibold }}>
                Propor ajuste
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
