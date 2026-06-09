/**
 * Sensitive Notes service — 2-party deletion approval workflow (8 of 8).
 * Mirrors PWA src/actions/sensitive-topics.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { notifyAction } from './notify';

export { SENSITIVE_TOPICS, type SensitiveTopic } from '../lib/sensitive-topics';
import type { SensitiveTopic } from '../lib/sensitive-topics';

export interface SensitiveNote {
  id: string;
  child_id: string | null;
  topic: SensitiveTopic | string;
  title: string;
  content: string;
  is_urgent: boolean;
  created_by: string;
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  created_at: string;
  childName?: string;
  authorName?: string;
  deletionRequesterName?: string;
}

export async function fetchSensitiveNotes(groupId: string): Promise<SensitiveNote[]> {
  const { data } = await supabase
    .from('sensitive_notes')
    .select('id, child_id, topic, title, content, is_urgent, created_by, deletion_requested_by, deletion_requested_at, created_at, children(full_name), profiles!sensitive_notes_created_by_fkey(full_name), deletion_profile:profiles!sensitive_notes_deletion_requested_by_fkey(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data || []).map((n: any) => ({
    id: n.id,
    child_id: n.child_id,
    topic: n.topic,
    title: n.title,
    content: n.content,
    is_urgent: n.is_urgent,
    created_by: n.created_by,
    deletion_requested_by: n.deletion_requested_by,
    deletion_requested_at: n.deletion_requested_at,
    created_at: n.created_at,
    childName: n.children?.full_name?.split(' ')[0] || '',
    authorName: n.profiles?.full_name?.split(' ')[0] || '',
    deletionRequesterName: n.deletion_profile?.full_name?.split(' ')[0] || '',
  }));
}

export async function createSensitiveNote(params: {
  groupId: string;
  childId?: string;
  topic: SensitiveTopic;
  title: string;
  content: string;
  isUrgent?: boolean;
  createdBy: string;
}) {
  // Wave H: server enforces child-belongs-to-group (LGPD scope) — native
  // previously skipped this check and could store a sensitive note pointing
  // at a child outside the user's own group.
  const r = await apiFetch<{ success: boolean; id: string }>('/api/sensitive-notes', {
    method: 'POST',
    body: {
      groupId: params.groupId,
      childId: params.childId,
      topic: params.topic,
      title: params.title,
      content: params.content,
      isUrgent: params.isUrgent ?? false,
    },
  });
  if (!r.ok) return { success: false, error: r.error };

  notifyAction('sensitive_note_created', params.groupId, {
    title: params.title, topic: params.topic,
  });
  return { success: true };
}

/**
 * Request deletion. If only 1 parent in group, deletes immediately.
 * If 2+, marks deletion_requested_* fields and waits for approval.
 */
export async function requestDeletion(
  noteId: string,
  userId: string,
  groupId: string,
  noteTitle: string
): Promise<{ success: boolean; error?: string; deleted: boolean }> {
  const { count } = await supabase
    .from('group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .neq('role', 'readonly');

  const parentCount = count || 0;

  if (parentCount <= 1) {
    const { error } = await supabase.from('sensitive_notes').delete().eq('id', noteId);
    if (error) return { success: false, error: error.message, deleted: false };
    notifyAction('sensitive_note_deleted', groupId, { title: noteTitle });
    return { success: true, deleted: true };
  }

  const { error } = await supabase
    .from('sensitive_notes')
    .update({ deletion_requested_by: userId, deletion_requested_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) return { success: false, error: error.message, deleted: false };

  notifyAction('sensitive_note_deletion_requested', groupId, { title: noteTitle, noteId });
  return { success: true, deleted: false };
}

/** Second parent approves the deletion → actual delete. */
export async function approveDeletion(
  noteId: string,
  userId: string,
  groupId: string,
  noteTitle: string
): Promise<{ success: boolean; error?: string }> {
  // Verify the approver is not the one who requested
  const { data: note } = await supabase
    .from('sensitive_notes')
    .select('deletion_requested_by')
    .eq('id', noteId)
    .single();
  if (!note) return { success: false, error: 'Nota nao encontrada' };
  if ((note as any).deletion_requested_by === userId) {
    return { success: false, error: 'Voce que pediu a exclusao — o outro responsavel precisa aprovar' };
  }

  const { error } = await supabase.from('sensitive_notes').delete().eq('id', noteId);
  if (error) return { success: false, error: error.message };

  notifyAction('sensitive_note_deleted', groupId, { title: noteTitle });
  return { success: true };
}

/** Author or requester can cancel the deletion request. */
export async function cancelDeletion(
  noteId: string,
  groupId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('sensitive_notes')
    .update({ deletion_requested_by: null, deletion_requested_at: null })
    .eq('id', noteId);
  if (error) return { success: false, error: error.message };

  notifyAction('sensitive_note_deletion_cancelled', groupId, { noteId });
  return { success: true };
}
