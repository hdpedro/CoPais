/**
 * Notes Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

export interface Note {
  id: string; title: string; content: string | null; category: string | null;
  created_at: string; updated_at: string;
}

export async function fetchNotes(userId: string): Promise<Note[]> {
  const { data } = await supabase.from('private_notes')
    .select('id, title, content, category, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100);
  return data || [];
}

export async function createNote(params: { userId: string; title: string; content?: string; category?: string }) {
  return safeWrite({
    table: 'private_notes', operation: 'insert',
    payload: { user_id: params.userId, title: params.title.trim(), content: params.content?.trim() || null, category: params.category || 'lembrete' },
  });
}

export async function updateNote(noteId: string, updates: { title?: string; content?: string }) {
  return safeWrite({
    table: 'private_notes', operation: 'update',
    payload: { id: noteId, ...updates, updated_at: new Date().toISOString() },
  });
}

export async function deleteNote(noteId: string) {
  return safeWrite({ table: 'private_notes', operation: 'delete', payload: { id: noteId } });
}
