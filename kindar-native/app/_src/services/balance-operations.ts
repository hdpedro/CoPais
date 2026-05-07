/**
 * Custody Balance Operations Service
 *
 * Mirrors PWA src/actions/balance-operations.ts:
 *   - listBalanceOperations(groupId)
 *   - createBalanceOperation(params)
 *   - respondToBalanceOperation(opId, response)
 *
 * Side-effects (push/chat) are fired via notifyAction on success.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export type BalanceOperationType =
  | 'debit' | 'waive' | 'gift_day' | 'forgive_balance' | 'reset_balance';

export interface BalanceOperation {
  id: string;
  operation_type: BalanceOperationType | string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | string;
  days: number;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  proposed_by: string;
  target_user_id: string;
  proposerName: string;
  targetName: string;
}

export const OPERATION_META: Record<string, { icon: string; label: string; needsDays: boolean }> = {
  debit:           { icon: '🔁', label: 'Compensar depois', needsDays: false },
  waive:           { icon: '🤝', label: 'Sem gerar saldo', needsDays: false },
  gift_day:        { icon: '🎁', label: 'Ceder gratuitamente', needsDays: false },
  forgive_balance: { icon: '⚖️', label: 'Abater saldo', needsDays: true },
  reset_balance:   { icon: '🧹', label: 'Zerar pendencias', needsDays: false },
  manual_adjustment: { icon: '🔧', label: 'Ajuste manual', needsDays: false },
  credit:          { icon: '🔁', label: 'Credito', needsDays: false },
};

function directionForType(type: string, isProposer: boolean): 'to_proposer' | 'to_target' {
  // Credit flows:
  //   debit: proposer gets the day now, owes later -> proposer is debtor
  //   gift_day: proposer gives up a day -> target is creditor
  //   forgive_balance: proposer forgives target's debt -> target wins
  //   waive/reset: no direction
  if (type === 'debit') return isProposer ? 'to_target' : 'to_proposer';
  if (type === 'gift_day' || type === 'forgive_balance') return isProposer ? 'to_target' : 'to_proposer';
  return 'to_proposer';
}

export async function listBalanceOperations(groupId: string): Promise<BalanceOperation[]> {
  const { data } = await supabase
    .from('custody_balance_operations')
    .select(`
      id, operation_type, status, days, notes, created_at, responded_at,
      proposed_by, target_user_id,
      proposer:profiles!custody_balance_operations_proposed_by_fkey(full_name),
      target:profiles!custody_balance_operations_target_user_id_fkey(full_name)
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data || []).map((o: any) => ({
    id: o.id,
    operation_type: o.operation_type,
    status: o.status,
    days: o.days || 1,
    notes: o.notes,
    created_at: o.created_at,
    responded_at: o.responded_at,
    proposed_by: o.proposed_by,
    target_user_id: o.target_user_id,
    proposerName: o.proposer?.full_name?.split(' ')[0] || 'Alguem',
    targetName: o.target?.full_name?.split(' ')[0] || 'Alguem',
  }));
}

export async function createBalanceOperation(params: {
  groupId: string;
  proposerId: string;
  targetUserId: string;
  operationType: BalanceOperationType;
  days: number;
  notes: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const direction = directionForType(params.operationType, true);
  const result = await safeWrite({
    table: 'custody_balance_operations',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      operation_type: params.operationType,
      proposed_by: params.proposerId,
      target_user_id: params.targetUserId,
      status: 'pending',
      days: params.days,
      direction,
      notes: params.notes,
    },
  });
  if (!result.success) return { success: false, error: result.error || 'Falha' };
  if (!result.queued) {
    const label = OPERATION_META[params.operationType]?.label || params.operationType;
    notifyAction('swap_request_created', params.groupId, {
      swapId: '', originalDate: '',
      reason: `Proposta: ${label}${params.days > 1 ? ` (${params.days} dias)` : ''}${params.notes ? ` — ${params.notes}` : ''}`,
      type: 'balance_op', targetUserId: params.targetUserId,
    });
  }
  return { success: true };
}

export async function respondToBalanceOperation(
  operationId: string,
  response: 'approved' | 'rejected',
  groupId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await safeWrite({
    table: 'custody_balance_operations',
    operation: 'update',
    payload: {
      id: operationId,
      status: response,
      responded_at: new Date().toISOString(),
    },
  });
  if (!result.success) return { success: false, error: result.error || 'Falha' };
  if (!result.queued) {
    notifyAction(response === 'approved' ? 'swap_approved' : 'swap_rejected', groupId, {
      swapId: operationId, requesterId: '', originalDate: '',
    });
  }
  return { success: true };
}

/**
 * Compute per-user day balance from approved balance operations.
 * Positive = this user has credit (should receive days)
 * Negative = this user owes days
 */
export function computeBalanceFromOps(ops: BalanceOperation[]): Record<string, number> {
  const byUser: Record<string, number> = {};
  for (const op of ops) {
    if (op.status !== 'approved') continue;
    const days = op.days || 1;
    // Simplified directional effect matching PWA heuristics:
    //   debit: proposer becomes debtor (- days), target becomes creditor (+ days)
    //   gift_day / forgive_balance: proposer gives days to target
    //   waive: no effect
    //   reset_balance: zero everything (handled upstream)
    if (op.operation_type === 'waive') continue;
    if (op.operation_type === 'reset_balance') {
      // Reset everyone to 0 — signal by nuking accumulated values
      for (const k of Object.keys(byUser)) byUser[k] = 0;
      continue;
    }
    if (op.operation_type === 'debit') {
      byUser[op.proposed_by] = (byUser[op.proposed_by] || 0) - days;
      byUser[op.target_user_id] = (byUser[op.target_user_id] || 0) + days;
    } else if (op.operation_type === 'gift_day' || op.operation_type === 'forgive_balance') {
      byUser[op.proposed_by] = (byUser[op.proposed_by] || 0) - days;
      byUser[op.target_user_id] = (byUser[op.target_user_id] || 0) + days;
    }
  }
  return byUser;
}
