"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createNote as createNoteService,
  updateNote as updateNoteService,
  deleteNote as deleteNoteService,
} from "@/lib/services/notes";

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await createNoteService(supabase, {
    userId: user.id,
    groupId: formData.get("groupId") as string,
    title: (formData.get("title") as string) || "",
    content: (formData.get("content") as string) || null,
    category: (formData.get("category") as string) || "lembrete",
    childId: (formData.get("childId") as string) || null,
    noteDate: (formData.get("noteDate") as string) || null,
  });

  if (!result.ok) {
    redirect("/notas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota criada."));
}

export async function updateNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await updateNoteService(supabase, {
    noteId: formData.get("noteId") as string,
    userId: user.id,
    title: (formData.get("title") as string) || "",
    content: (formData.get("content") as string) || null,
    category: (formData.get("category") as string) || "lembrete",
    childId: (formData.get("childId") as string) || null,
    noteDate: (formData.get("noteDate") as string) || null,
  });

  if (!result.ok) {
    redirect("/notas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota atualizada."));
}

export async function deleteNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await deleteNoteService(supabase, {
    noteId: formData.get("noteId") as string,
    userId: user.id,
  });

  if (!result.ok) {
    redirect("/notas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota excluida."));
}
