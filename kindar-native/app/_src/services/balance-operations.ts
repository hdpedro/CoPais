/**
 * Custody Balance Operations — Native thin wrapper.
 *
 * Consome o service compartilhado via REST API (single source of truth):
 *   - listBalanceOperations  → GET  /api/balance-operations?groupId=
 *   - createBalanceOperation → POST /api/balance-operations
 *   - respondToBalanceOperation → PATCH /api/balance-operations/[id]
 *
 * Por que não usa safeWrite (offline-first) como o ancestral:
 *   - Balance operations são negociação cooperativa, não captura frequente.
 *     Offline-first não é crítico aqui (diferente de expenses/quick-checkins).
 *   - O ancestral safeWrite escrevia direto no Supabase → fugiu da paridade
 *     com PWA → bug do Angelino em 2026-05-29 (direction='to_target'
 *     violando CHECK constraint). API REST fecha a divergência.
 *
 * `computeBalanceFromOps` é função pura UI-local (não toca em rede).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { apiFetch } from '../lib/api-fetch';

export type BalanceOperationType =
  | 'debit'
  | 'credit'
  | 'waive'
  | 'gift_day'
  | 'forgive_balance'
  | 'reset_balance'
  | 'manual_adjustment';

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
  debit:             { icon: '🔁', label: 'Compensar depois', needsDays: false },
  waive:             { icon: '🤝', label: 'Sem gerar saldo', needsDays: false },
  gift_day:          { icon: '🎁', label: 'Ceder gratuitamente', needsDays: false },
  forgive_balance:   { icon: '⚖️', label: 'Abater saldo', needsDays: true },
  reset_balance:     { icon: '🧹', label: 'Zerar pendencias', needsDays: false },
  manual_adjustment: { icon: '🔧', label: 'Ajuste manual', needsDays: false },
  credit:            { icon: '🔁', label: 'Credito', needsDays: false },
};

interface ListResponse {
  operations: Array<{
    id: string;
    operation_type: string;
    status: string;
    days: number;
    notes: string | null;
    created_at: string;
    responded_at: string | null;
    proposed_by: string;
    target_user_id: string;
    proposerName: string;
    targetName: string;
  }>;
}

export async function listBalanceOperations(groupId: string): Promise<BalanceOperation[]> {
  const r = await apiFetch<ListResponse>('/api/balance-operations', {
    method: 'GET',
    query: { groupId },
  });
  if (!r.ok || !r.data) return [];
  return r.data.operations.map((o) => ({
    id: o.id,
    operation_type: o.operation_type,
    status: o.status,
    days: o.days || 1,
    notes: o.notes,
    created_at: o.created_at,
    responded_at: o.responded_at,
    proposed_by: o.proposed_by,
    target_user_id: o.target_user_id,
    proposerName: o.proposerName,
    targetName: o.targetName,
  }));
}

export async function createBalanceOperation(params: {
  groupId: string;
  proposerId: string; // mantido na assinatura por backward-compat; server usa auth.uid()
  targetUserId: string;
  operationType: BalanceOperationType;
  days: number;
  notes: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const r = await apiFetch<{ success: boolean }>('/api/balance-operations', {
    method: 'POST',
    body: {
      groupId: params.groupId,
      targetUserId: params.targetUserId,
      operationType: params.operationType,
      days: params.days,
      notes: params.notes,
    },
  });
  return r.ok
    ? { success: true }
    : { success: false, error: r.error || 'Falha ao criar proposta' };
}

export async function respondToBalanceOperation(
  operationId: string,
  response: 'approved' | 'rejected',
  _groupId: string, // mantido na assinatura por backward-compat
): Promise<{ success: true } | { success: false; error: string }> {
  const r = await apiFetch<{ success: boolean }>(`/api/balance-operations/${operationId}`, {
    method: 'PATCH',
    body: { decision: response },
  });
  return r.ok
    ? { success: true }
    : { success: false, error: r.error || 'Falha ao responder' };
}

/**
 * Compute per-user day balance from approved balance operations.
 * Função UI-local; espelha src/lib/services/balance-operations.ts heurística.
 * Positive = user has credit (should receive days); negative = user owes days.
 */
export function computeBalanceFromOps(ops: BalanceOperation[]): Record<string, number> {
  const byUser: Record<string, number> = {};
  for (const op of ops) {
    if (op.status !== 'approved') continue;
    const days = op.days || 1;

    if (op.operation_type === 'waive') continue;

    if (op.operation_type === 'reset_balance') {
      for (const k of Object.keys(byUser)) byUser[k] = 0;
      continue;
    }

    if (
      op.operation_type === 'debit' ||
      op.operation_type === 'gift_day' ||
      op.operation_type === 'forgive_balance'
    ) {
      byUser[op.proposed_by] = (byUser[op.proposed_by] || 0) - days;
      byUser[op.target_user_id] = (byUser[op.target_user_id] || 0) + days;
    } else if (op.operation_type === 'credit') {
      byUser[op.proposed_by] = (byUser[op.proposed_by] || 0) + days;
      byUser[op.target_user_id] = (byUser[op.target_user_id] || 0) - days;
    }
  }
  return byUser;
}
