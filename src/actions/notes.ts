"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const noteDate = formData.get("noteDate") as string;

  if (!title?.trim()) {
    redirect("/notas?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  const { error } = await supabase.from("private_notes").insert({
    user_id: user.id,
    group_id: groupId,
    child_id: childId || null,
    category: category || "lembrete",
    title: title.trim(),
    content: content?.trim() || null,
    note_date: noteDate || null,
  });

  if (error) redirect("/notas?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "note_created");

  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota criada."));
}

export async function updateNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const noteId = formData.get("noteId") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const category = formData.get("category") as string;
  const childId = formData.get("childId") as string;
  const noteDate = formData.get("noteDate") as string;

  if (!title?.trim()) {
    redirect("/notas?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  const { error } = await supabase.from("private_notes").update({
    title: title.trim(),
    content: content?.trim() || null,
    category: category || "lembrete",
    child_id: childId || null,
    note_date: noteDate || null,
  }).eq("id", noteId).eq("user_id", user.id);

  if (error) redirect("/notas?error=" + encodeURIComponent(error.message));
  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota atualizada."));
}

export async function deleteNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const noteId = formData.get("noteId") as string;

  const { error, count } = await supabase.from("private_notes").delete({ count: "exact" })
    .eq("id", noteId).eq("user_id", user.id);

  if (error) redirect("/notas?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "note_deleted");

  if (count === 0) {
    redirect("/notas?error=" + encodeURIComponent("Nota nao encontrada ou sem permissao para excluir."));
  }
  revalidatePath("/notas");
  redirect("/notas?success=" + encodeURIComponent("Nota excluida."));
}
