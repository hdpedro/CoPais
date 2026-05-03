/* ------------------------------------------------------------------ */
/* services/notes.ts                                                   */
/* Single source of truth for private_notes CRUD.                      */
/* Called by: actions/notes.ts (PWA) and tools.ts:create_note.         */
/* Notes are private to the user — no group-broadcast notifications.   */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";

export interface CreateNoteInput {
  userId: string;
  groupId: string;
  title: string;
  content?: string | null;
  category?: string;
  childId?: string | null;
  noteDate?: string | null;
}

export interface UpdateNoteInput {
  noteId: string;
  userId: string;
  title: string;
  content?: string | null;
  category?: string;
  childId?: string | null;
  noteDate?: string | null;
}

export interface DeleteNoteInput {
  noteId: string;
  userId: string;
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function createNote(
  supabase: SupabaseClient,
  input: CreateNoteInput,
): Promise<ServiceResult<{ id: string }>> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Titulo obrigatorio.", status: 400 };

  const { data, error } = await supabase
    .from("private_notes")
    .insert({
      user_id: input.userId,
      group_id: input.groupId,
      child_id: input.childId || null,
      category: input.category || "lembrete",
      title: title.slice(0, 200),
      content: input.content?.trim() || null,
      note_date: input.noteDate || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Falha ao criar nota.", status: 400 };
  }

  captureServerEvent(input.userId, "note_created");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateNote(
  supabase: SupabaseClient,
  input: UpdateNoteInput,
): Promise<ServiceResult<{ id: string }>> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Titulo obrigatorio.", status: 400 };

  const { error } = await supabase
    .from("private_notes")
    .update({
      title: title.slice(0, 200),
      content: input.content?.trim() || null,
      category: input.category || "lembrete",
      child_id: input.childId || null,
      note_date: input.noteDate || null,
    })
    .eq("id", input.noteId)
    .eq("user_id", input.userId);

  if (error) return { ok: false, error: error.message, status: 400 };
  return { ok: true, data: { id: input.noteId } };
}

export async function deleteNote(
  supabase: SupabaseClient,
  input: DeleteNoteInput,
): Promise<ServiceResult<{ id: string }>> {
  const { error, count } = await supabase
    .from("private_notes")
    .delete({ count: "exact" })
    .eq("id", input.noteId)
    .eq("user_id", input.userId);

  if (error) return { ok: false, error: error.message, status: 400 };
  if (count === 0) {
    return {
      ok: false,
      error: "Nota nao encontrada ou sem permissao para excluir.",
      status: 404,
    };
  }

  captureServerEvent(input.userId, "note_deleted");
  return { ok: true, data: { id: input.noteId } };
}
