/**
 * Event Requests service — workflow 2/8: propor edicao/cancelamento/reagendamento
 * de evento que afeta outro responsavel, com aprovacao any/all.
 * Mirrors PWA src/actions/events.ts event request functions.
 *
 * Mutations (create/respond/cancel) go through `/api/event-requests` so the
 * snapshot conflict-check, approval_mode 'all' aggregation, side-effects
 * (event_history, push, chat notification) and tag revalidation are owned
 * by the PWA — single source of truth (Wave I migration).
 *
 * Reads (`fetchMyPendingEventRequests`) still hit Supabase directly because
 * RLS already gates them (only affected_user_ids see pending requests in
 * their group) and there's no business logic on the read path.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';

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
  const r = await apiFetch<{ success: boolean; id?: string; error?: string }>(
    '/api/event-requests',
    {
      method: 'POST',
      body: {
        groupId: params.groupId,
        eventId: params.eventId,
        affectedUserIds: params.affectedUserIds,
        actionType: params.actionType,
        proposedChanges: params.proposedChanges ?? null,
        originalSnapshot: params.originalSnapshot,
        reason: params.reason ?? null,
        approvalMode: params.approvalMode ?? 'any',
      },
    }
  );
  if (!r.ok) return { success: false, error: r.error || 'Erro ao criar pedido' };
  return { success: true, id: r.data?.id };
}

/**
 * Respond to an event request. Server-side handles approval_mode aggregation
 * (under 'all', returns `applied=false` and `status='pending'` until every
 * affected user has approved) plus snapshot conflict-detection.
 */
export async function respondToEventRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _groupId: string
): Promise<{ success: boolean; error?: string; applied?: boolean }> {
  const r = await apiFetch<{ success: boolean; applied?: boolean; status?: string; error?: string }>(
    '/api/event-requests',
    {
      method: 'PATCH',
      body: { requestId, decision },
    }
  );
  if (!r.ok) return { success: false, error: r.error || 'Erro ao responder' };
  return { success: true, applied: r.data?.applied ?? false };
}

export async function cancelEventRequest(
  requestId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _groupId: string
): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch<{ success: boolean; error?: string }>(
    '/api/event-requests',
    {
      method: 'DELETE',
      query: { id: requestId },
    }
  );
  if (!r.ok) return { success: false, error: r.error || 'Erro ao cancelar' };
  return { success: true };
}
