/**
 * Event Requests service — workflow 2/8: propor edicao/cancelamento/reagendamento
 * de evento que afeta outro responsavel, com aprovacao any/all.
 * Mirrors PWA src/actions/events.ts event request functions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { notifyAction } from './notify';

export type EventRequestAction = 'edit' | 'cancel' | 'reschedule' | 'delete';
export type EventRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled_by_system';

export interface EventRequest {
  id: string;
  event_id: string;
  requester_id: string;
  affected_user_ids: string[];
  action_type: EventRequestAction;
  proposed_changes: Record<string, unknown> | null;
  original_snapshot: Record<string, unknown>;
  reason: string | null;
  status: EventRequestStatus;
  approval_mode: 'any' | 'all';
  cancelled_reason: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  requesterName?: string;
  eventTitle?: string;
}

export async function fetchMyPendingEventRequests(
  groupId: string,
  userId: string
): Promise<EventRequest[]> {
  const { data } = await supabase
    .from('event_requests')
    .select('id, event_id, requester_id, affected_user_ids, action_type, proposed_changes, original_snapshot, reason, status, approval_mode, cancelled_reason, responded_by, responded_at, created_at, profiles!event_requests_requester_id_fkey(full_name), events(title)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .contains('affected_user_ids', [userId])
    .order('created_at', { ascending: false });

  return (data || []).map((r: any) => ({
    id: r.id,
    event_id: r.event_id,
    requester_id: r.requester_id,
    affected_user_ids: r.affected_user_ids,
    action_type: r.action_type,
    proposed_changes: r.proposed_changes,
    original_snapshot: r.original_snapshot,
    reason: r.reason,
    status: r.status,
    approval_mode: r.approval_mode,
    cancelled_reason: r.cancelled_reason,
    responded_by: r.responded_by,
    responded_at: r.responded_at,
    created_at: r.created_at,
    requesterName: r.profiles?.full_name?.split(' ')[0] || '',
    eventTitle: r.events?.title || '(sem titulo)',
  }));
}

export async function createEventRequest(params: {
  groupId: string;
  eventId: string;
  requesterId: string;
  affectedUserIds: string[];
  actionType: EventRequestAction;
  proposedChanges?: Record<string, unknown>;
  originalSnapshot: Record<string, unknown>;
  reason?: string;
  approvalMode?: 'any' | 'all';
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { data, error } = await supabase
    .from('event_requests')
    .insert({
      group_id: params.groupId,
      event_id: params.eventId,
      requester_id: params.requesterId,
      affected_user_ids: params.affectedUserIds,
      action_type: params.actionType,
      proposed_changes: params.proposedChanges || null,
      original_snapshot: params.originalSnapshot,
      reason: params.reason || null,
      status: 'pending',
      approval_mode: params.approvalMode || 'any',
    })
    .select('id')
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Erro ao criar pedido' };

  notifyAction('event_request_created', params.groupId, {
    requestId: data.id,
    actionType: params.actionType,
    reason: params.reason,
  });
  return { success: true, id: data.id };
}

/**
 * Respond to an event request. If approval_mode = 'any', single approval
 * closes it. If 'all', need all affected users to approve (this implementation
 * naively closes on first approval — refine for 'all' mode later).
 */
export async function respondToEventRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  userId: string,
  groupId: string
): Promise<{ success: boolean; error?: string; applied?: boolean }> {
  // Fetch request to get action_type + proposed_changes
  const { data: req } = await supabase
    .from('event_requests')
    .select('id, event_id, action_type, proposed_changes, original_snapshot, approval_mode')
    .eq('id', requestId)
    .single();

  if (!req) return { success: false, error: 'Pedido nao encontrado' };

  const { error: updateErr } = await supabase
    .from('event_requests')
    .update({
      status: decision,
      responded_by: userId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateErr) return { success: false, error: updateErr.message };

  let applied = false;
  if (decision === 'approved') {
    // Apply the change to the actual event
    const reqTyped = req as any;
    if (reqTyped.action_type === 'delete' || reqTyped.action_type === 'cancel') {
      const { error: delErr } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', reqTyped.event_id);
      if (!delErr) applied = true;
    } else if ((reqTyped.action_type === 'edit' || reqTyped.action_type === 'reschedule') && reqTyped.proposed_changes) {
      const { error: editErr } = await supabase
        .from('events')
        .update(reqTyped.proposed_changes)
        .eq('id', reqTyped.event_id);
      if (!editErr) applied = true;
    }

    // Log in event_history (best effort)
    try {
      await supabase.from('event_history').insert({
        group_id: groupId,
        event_id: reqTyped.event_id,
        changed_by: userId,
        action: reqTyped.action_type,
        changes: reqTyped.proposed_changes || null,
        previous_state: reqTyped.original_snapshot || null,
      });
    } catch { /* non-fatal */ }
  }

  notifyAction(decision === 'approved' ? 'event_request_approved' : 'event_request_rejected', groupId, {
    requestId,
  });

  return { success: true, applied };
}

export async function cancelEventRequest(
  requestId: string,
  groupId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('event_requests')
    .update({ status: 'cancelled_by_system' })
    .eq('id', requestId);
  if (error) return { success: false, error: error.message };

  notifyAction('event_request_cancelled', groupId, { requestId });
  return { success: true };
}
