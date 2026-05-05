"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import {
  createSchoolLog as svcCreate,
  deleteSchoolLog as svcDelete,
  updateSchoolLog as svcUpdate,
  toggleSchoolLogCompleted as svcToggle,
  isValidSubtype,
  type SchoolSubtype,
} from "@/lib/services/school";

/**
 * PWA actions: thin wrappers around src/lib/services/school.ts.
 * Native uses /api/school/route.ts — both delegate to the service so
 * subtype validation, calendar mirroring, and rollback are identical.
 */

export async function createSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Backwards-compat: legacy form fields used `logType`. New flow uses
  // `subtype` (clearer naming). Accept either.
  const rawSubtype = (formData.get("subtype") || formData.get("logType")) as string;
  if (!isValidSubtype(rawSubtype)) {
    redirect("/escola?error=" + encodeURIComponent("Tipo inválido."));
  }
  const subtype = rawSubtype as SchoolSubtype;

  const result = await svcCreate(supabase, {
    groupId,
    childId: formData.get("childId") as string,
    userId: user.id,
    subtype,
    title: (formData.get("title") as string) || "",
    description: (formData.get("description") as string) || null,
    logDate: (formData.get("logDate") as string) || new Date().toISOString().split("T")[0],
    eventTime: (formData.get("eventTime") as string) || null,
    subject: (formData.get("subject") as string) || null,
    score: (formData.get("score") as string) || null,
  });

  if (!result.success) {
    redirect("/escola?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/escola");
  revalidatePath("/calendario");
  redirect("/escola");
}

export async function deleteSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const logId = formData.get("logId") as string;

  const { data: log } = await supabase
    .from("school_logs")
    .select("id, group_id")
    .eq("id", logId)
    .single();
  if (!log) redirect("/escola?error=" + encodeURIComponent("Registro nao encontrado."));

  const membership = await verifyGroupMembership(supabase, log.group_id, user.id);
  if (!membership) redirect("/escola?error=" + encodeURIComponent("Sem permissao."));

  const result = await svcDelete(supabase, logId);
  if (!result.success) redirect("/escola?error=" + encodeURIComponent(result.error));

  revalidatePath("/escola");
  revalidatePath("/calendario");
  redirect("/escola");
}

export async function updateSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const logId = formData.get("logId") as string;

  const { data: log } = await supabase
    .from("school_logs")
    .select("id, group_id")
    .eq("id", logId)
    .single();
  if (!log) redirect("/escola?error=" + encodeURIComponent("Registro nao encontrado."));

  const membership = await verifyGroupMembership(supabase, log.group_id, user.id);
  if (!membership) redirect("/escola?error=" + encodeURIComponent("Sem permissao."));

  const result = await svcUpdate(supabase, logId, {
    title: (formData.get("title") as string) ?? undefined,
    description: formData.has("description") ? (formData.get("description") as string) : undefined,
    subject: formData.has("subject") ? (formData.get("subject") as string) : undefined,
    score: formData.has("score") ? (formData.get("score") as string) : undefined,
  });
  if (!result.success) redirect("/escola?error=" + encodeURIComponent(result.error));

  revalidatePath("/escola");
  revalidatePath("/calendario");
  redirect("/escola");
}

export async function toggleSchoolLogCompleted(logId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const { data: log } = await supabase
    .from("school_logs").select("id, group_id").eq("id", logId).single();
  if (!log) return { error: "Registro nao encontrado" };

  const membership = await verifyGroupMembership(supabase, log.group_id, user.id);
  if (!membership) return { error: "Sem permissao" };

  const result = await svcToggle(supabase, logId);
  if (!result.success) return { error: result.error };

  revalidatePath("/escola");
  return { success: true, completed: result.data.completed };
}
