/**
 * Swaps service — mirrors PWA src/actions/balance-operations.ts + legacy swap APIs.
 *
 * Handles the custody swap request approval workflow:
 * - respondToSwap: approve or reject a pending swap_requests row
 * - createSwap: issue a new swap_requests row (target = other co-parent)
 *
 * Notifications + push are emitted via notify.notifyAction() after every state change,
 * keeping both responsibles aligned with the PWA.
 */

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';

export interface SwapRequestDetail {
  id: string;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
}

/** Load pending swap requests where current user is the target (i.e. needs to respond).
 *  Read-only — direct supabase select is fine, RLS already gates by membership. */
export async function loadMyPendingSwaps(groupId: string, userId: string): Promise<SwapRequestDetail[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select(
      'id, requester_id, target_user_id, original_date, proposed_date, reason, status, created_at, profiles!swap_requests_requester_id_fkey(full_name)'
    )
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return data.map((s: any) => ({
    id: s.id,
    requesterId: s.requester_id,
    requesterName: s.profiles?.full_name || 'Co-responsavel',
    targetUserId: s.target_user_id,
    originalDate: s.original_date,
    proposedDate: s.proposed_date,
    reason: s.reason,
    // swap_requests has no `type` column; derive from proposed_date / [DIVIDA] tag
    type: !s.proposed_date ? 'giveaway' : 'swap',
    status: s.status,
    createdAt: s.created_at,
  }));
  /* eslint-enable */
}

/**
 * Respond to a swap request via PWA route `/api/swaps`. The route does the
 * idempotent status flip, the custody_events materialization (Angelino PR #3
 * direction fix) and the push/chat side-effects — single source of truth.
 *
 * groupId/requesterId/originalDate kept in the signature for backwards
 * compat; only swapId + decision are forwarded to the API.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function respondToSwap(
  swapId: string,
  decision: 'approved' | 'rejected',
  _groupId: string,
  _requesterId: string,
  _originalDate: string
): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch<{ success: true }>(`/api/swaps`, {
    method: 'PATCH',
    body: { swapId, decision },
  });
  if (!r.ok) return { success: false, error: r.error || 'Falha ao responder solicitação' };
  return { success: true };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/** Load swap requests SENT by current user (requester). Pending only —
 *  os ja aceitos/rejeitados ja viraram custody_events ou sao historico.
 *  Permite ao solicitante ver o que enviou e cancelar se necessario. */
export async function loadMySentSwaps(groupId: string, userId: string): Promise<SwapRequestDetail[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select(
      'id, requester_id, target_user_id, original_date, proposed_date, reason, status, created_at, profiles!swap_requests_target_user_id_fkey(full_name)'
    )
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return data.map((s: any) => ({
    id: s.id,
    requesterId: s.requester_id,
    requesterName: s.profiles?.full_name || 'Co-responsavel',
    targetUserId: s.target_user_id,
    originalDate: s.original_date,
    proposedDate: s.proposed_date,
    reason: s.reason,
    type: !s.proposed_date ? 'giveaway' : 'swap',
    status: s.status,
    createdAt: s.created_at,
  }));
  /* eslint-enable */
}

/** Cancela uma swap_request enviada pelo proprio user (so pending).
 *  RLS: Requester can cancel own pending swap (migration 00071). */
export async function cancelMySwap(swapId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('swap_requests')
    .update({ status: 'cancelled' })
    .eq('id', swapId)
    .eq('status', 'pending');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Create a new swap request via PWA route `/api/swaps`. */
export async function createSwap(params: {
  groupId: string;
  requesterId: string;
  targetUserId: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type?: 'swap' | 'giveaway';
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const r = await apiFetch<{ success: true; id?: string }>(`/api/swaps`, {
    method: 'POST',
    body: {
      groupId: params.groupId,
      targetUserId: params.targetUserId,
      originalDate: params.originalDate,
      proposedDate: params.proposedDate,
      reason: params.reason,
      // PWA distinguishes 'swap' (trade) vs implicit debt (no proposedDate).
      // 'giveaway' is sent as 'swap' — the route's isDebtSwap detector
      // (proposedDate==null) handles the [DIVIDA] tagging same as PWA action.
      type: params.type === 'giveaway' ? 'swap' : (params.type || 'swap'),
    },
  });
  if (!r.ok || !r.data) return { success: false, error: r.error || 'Erro ao criar troca' };
  return { success: true, id: r.data.id };
}
