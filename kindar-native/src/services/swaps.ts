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
import { notifyAction } from './notify';

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

/** Load pending swap requests where current user is the target (i.e. needs to respond). */
export async function loadMyPendingSwaps(groupId: string, userId: string): Promise<SwapRequestDetail[]> {
  const { data, error } = await supabase
    .from('swap_requests')
    .select(
      'id, requester_id, target_user_id, original_date, proposed_date, reason, type, status, created_at, profiles!swap_requests_requester_id_fkey(full_name)'
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
    type: s.type || 'swap',
    status: s.status,
    createdAt: s.created_at,
  }));
  /* eslint-enable */
}

/** Respond to a swap request: 'approved' or 'rejected'. Non-interactive — caller handles UI feedback. */
export async function respondToSwap(
  swapId: string,
  decision: 'approved' | 'rejected',
  groupId: string,
  requesterId: string,
  originalDate: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('swap_requests')
    .update({
      status: decision,
      responded_at: new Date().toISOString(),
    })
    .eq('id', swapId);

  if (error) return { success: false, error: error.message };

  notifyAction(decision === 'approved' ? 'swap_approved' : 'swap_rejected', groupId, {
    swapId,
    requesterId,
    originalDate,
  });
  return { success: true };
}

/** Create a new swap request. type='swap' means trading dates; 'giveaway' means giving up own day. */
export async function createSwap(params: {
  groupId: string;
  requesterId: string;
  targetUserId: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
  type?: 'swap' | 'giveaway';
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { data, error } = await supabase
    .from('swap_requests')
    .insert({
      group_id: params.groupId,
      requester_id: params.requesterId,
      target_user_id: params.targetUserId,
      original_date: params.originalDate,
      proposed_date: params.proposedDate,
      reason: params.reason,
      type: params.type || 'swap',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Erro ao criar troca' };

  notifyAction('swap_request_created', params.groupId, {
    swapId: data.id,
    originalDate: params.originalDate,
    proposedDate: params.proposedDate,
    reason: params.reason,
    type: params.type || 'swap',
    targetUserId: params.targetUserId,
  });
  return { success: true, id: data.id };
}
