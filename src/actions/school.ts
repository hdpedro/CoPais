"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;

  if (childId) {
    const { data: child } = await supabase.from("children").select("id").eq("id", childId).eq("group_id", groupId).single();
    if (!child) redirect("/escola?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
  }

  const logType = formData.get("logType") as string;
  const validLogTypes = ["grade", "meeting", "behavior", "homework", "event", "absence", "achievement", "concern", "other"];
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const logDate = formData.get("logDate") as string;

  if (!title?.trim()) redirect("/escola?error=" + encodeURIComponent("Titulo obrigatorio."));

  const { error } = await supabase.from("school_logs").insert({
    group_id: groupId,
    child_id: childId,
    log_type: validLogTypes.includes(logType) ? logType : "other",
    title: title.trim(),
    description: description || null,
    log_date: logDate || new Date().toISOString().split("T")[0],
    logged_by: user.id,
  });

  if (error) redirect("/escola?error=" + encodeURIComponent(error.message));
  revalidatePath("/escola");
  redirect("/escola");
}

export async function deleteSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const logId = formData.get("logId") as string;

  // Verify the log exists and user has access
  const { data: log } = await supabase
    .from("school_logs")
    .select("id, group_id, logged_by")
    .eq("id", logId)
    .single();

  if (!log) redirect("/escola?error=" + encodeURIComponent("Registro nao encontrado."));

  const membership = await verifyGroupMembership(supabase, log!.group_id, user.id);
  if (!membership) redirect("/escola?error=" + encodeURIComponent("Sem permissao."));

  const { error } = await supabase
    .from("school_logs")
    .delete()
    .eq("id", logId);

  if (error) redirect("/escola?error=" + encodeURIComponent(error.message));

  revalidatePath("/escola");
  redirect("/escola");
}

export async function updateSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const logId = formData.get("logId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = formData.get("description") as string;

  if (!title) redirect("/escola?error=" + encodeURIComponent("Titulo obrigatorio."));

  const { data: log } = await supabase
    .from("school_logs")
    .select("id, group_id")
    .eq("id", logId)
    .single();

  if (!log) redirect("/escola?error=" + encodeURIComponent("Registro nao encontrado."));

  const membership = await verifyGroupMembership(supabase, log!.group_id, user.id);
  if (!membership) redirect("/escola?error=" + encodeURIComponent("Sem permissao."));

  const { error } = await supabase
    .from("school_logs")
    .update({ title, description: description || null })
    .eq("id", logId);

  if (error) redirect("/escola?error=" + encodeURIComponent(error.message));

  revalidatePath("/escola");
  redirect("/escola");
}

export async function toggleSchoolLogCompleted(logId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  // Get current state
  const { data: log } = await supabase
    .from("school_logs")
    .select("id, group_id, completed")
    .eq("id", logId)
    .single();

  if (!log) return { error: "Registro nao encontrado" };

  const membership = await verifyGroupMembership(supabase, log.group_id, user.id);
  if (!membership) return { error: "Sem permissao" };

  const { error } = await supabase
    .from("school_logs")
    .update({ completed: !log.completed })
    .eq("id", logId);

  if (error) return { error: error.message };

  revalidatePath("/escola");
  return { success: true, completed: !log.completed };
}
