/**
 * Notes Service — All writes use safeWrite.
 *
 * Schema: `private_notes(user_id NOT NULL, group_id NOT NULL, ...)` (migration
 * 00019). Both filters are required to avoid leaking notes between groups
 * when the user belongs to multiple co-parenting groups. The previous
 * native implementation filtered/inserted by `user_id` only — the resulting
 * cross-group leak was flagged as P0 in the 2026-04-27 audit.
 *
 * Categories accepted by the CHECK constraint:
 *   'lembrete' | 'observacao' | 'preparacao' | 'juridico' | 'outro'
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

export interface Note {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  child_id: string | null;
  note_date: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchNotes(userId: string, groupId: string): Promise<Note[]> {
  const { data } = await supabase
    .from('private_notes')
    .select('id, title, content, category, child_id, note_date, created_at, updated_at')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .order('updated_at', { ascending: false })
    .limit(100);
  return data || [];
}

export async function createNote(params: {
  userId: string;
  groupId: string;
  title: string;
  content?: string;
  category?: 'lembrete' | 'observacao' | 'preparacao' | 'juridico' | 'outro';
  childId?: string | null;
  noteDate?: string | null;
}) {
  return safeWrite({
    table: 'private_notes',
    operation: 'insert',
    payload: {
      user_id: params.userId,
      group_id: params.groupId,
      title: params.title.trim(),
      content: params.content?.trim() || null,
      category: params.category || 'lembrete',
      child_id: params.childId ?? null,
      note_date: params.noteDate ?? null,
    },
  });
}

export async function updateNote(
  noteId: string,
  updates: {
    title?: string;
    content?: string;
    category?: 'lembrete' | 'observacao' | 'preparacao' | 'juridico' | 'outro';
    childId?: string | null;
    noteDate?: string | null;
  },
) {
  // Only forward fields the caller actually wants to change.
  const payload: Record<string, unknown> = {
    id: noteId,
    updated_at: new Date().toISOString(),
  };
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.content !== undefined) payload.content = updates.content.trim() || null;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.childId !== undefined) payload.child_id = updates.childId;
  if (updates.noteDate !== undefined) payload.note_date = updates.noteDate;

  return safeWrite({ table: 'private_notes', operation: 'update', payload });
}

export async function deleteNote(noteId: string) {
  return safeWrite({ table: 'private_notes', operation: 'delete', payload: { id: noteId } });
}
