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

/**
 * Respond to a swap request ('approved' | 'rejected').
 *
 * Mirrors the PWA server action `respondToSwapRequest` in src/actions/calendar.ts
 * — atomically updates status AND materializes the swap as custody_events so the
 * calendar reflects the change.
 *
 * Previously native only updated status → approved swaps were invisible in the
 * calendar. This full port fixes that, and also applies the direction fix from
 * Angelino PR #3:
 *   - If requester owned the original day, target gets it on approval
 *   - Otherwise requester gets it
 * (old naive code always assigned to requester, which broke cases where the
 * requester was offering HIS OWN day as a swap.)
 */
export async function respondToSwap(
  swapId: string,
  decision: 'approved' | 'rejected',
  groupId: string,
  requesterId: string,
  originalDate: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch full request record (need proposed_date, target, reason, type)
  const { data: req } = await supabase
    .from('swap_requests')
    .select('id, requester_id, target_user_id, original_date, proposed_date, reason, type, status, group_id')
    .eq('id', swapId)
    .maybeSingle();
  if (!req) return { success: false, error: 'Solicitacao nao encontrada' };
  if (req.status !== 'pending') return { success: false, error: 'Solicitacao ja processada' };

  // 2. Update status (idempotent via .eq('status', 'pending'))
  const { data: updated, error: updateError } = await supabase
    .from('swap_requests')
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq('id', swapId)
    .eq('status', 'pending')
    .select('id');
  if (updateError) return { success: false, error: updateError.message };
  if (!updated || updated.length === 0) return { success: false, error: 'Ja processada por outro usuario' };

  // 3. If approved, materialize swap as custody_events rows
  if (decision === 'approved') {
    // Find current responsible for original_date
    const { data: origEvents } = await supabase
      .from('custody_events')
      .select('child_id, responsible_user_id, start_date, end_date')
      .eq('group_id', req.group_id)
      .lte('start_date', req.original_date)
      .gte('end_date', req.original_date)
      .limit(1);

    const swapEvents: Array<Record<string, unknown>> = [];

    if (origEvents && origEvents[0]) {
      // Direction fix (Angelino PR #3): day flips to whoever was NOT the
      // original owner. Requester offering OWN day → target gets it;
      // otherwise requester gets target's day as requested.
      const currentOwner = origEvents[0].responsible_user_id;
      const newOwner = currentOwner === req.requester_id
        ? req.target_user_id
        : req.requester_id;
      swapEvents.push({
        group_id: req.group_id,
        child_id: origEvents[0].child_id,
        responsible_user_id: newOwner,
        start_date: req.original_date,
        end_date: req.original_date,
        custody_type: 'swap',
        notes: req.proposed_date
          ? `Troca aprovada: ${req.reason || 'sem motivo'}`
          : `Divida de dia: ${req.reason || 'sem motivo'}`,
        created_by: req.target_user_id,
      });
    }

    if (req.proposed_date) {
      const { data: propEvents } = await supabase
        .from('custody_events')
        .select('child_id, responsible_user_id, start_date, end_date')
        .eq('group_id', req.group_id)
        .lte('start_date', req.proposed_date)
        .gte('end_date', req.proposed_date)
        .limit(1);
      if (propEvents && propEvents[0]) {
        const currentOwner = propEvents[0].responsible_user_id;
        const newOwner = currentOwner === req.requester_id
          ? req.target_user_id
          : req.requester_id;
        swapEvents.push({
          group_id: req.group_id,
          child_id: propEvents[0].child_id,
          responsible_user_id: newOwner,
          start_date: req.proposed_date,
          end_date: req.proposed_date,
          custody_type: 'swap',
          notes: `Troca aprovada: ${req.reason || 'sem motivo'}`,
          created_by: req.target_user_id,
        });
      }
    }

    if (swapEvents.length > 0) {
      const { error: insertError } = await supabase.from('custody_events').insert(swapEvents);
      if (insertError) return { success: false, error: insertError.message };
    }
  }

  // 4. Fire side-effects (push + chat message) via PWA's /api/native/notify
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
