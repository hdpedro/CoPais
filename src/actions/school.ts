"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  createSchoolLog as svcCreate,
  deleteSchoolLog as svcDelete,
  updateSchoolLog as svcUpdate,
  toggleSchoolLogCompleted as svcToggle,
  isValidSubtype,
  type SchoolSubtype,
  type SchoolPriority,
} from "@/lib/services/school";

const VALID_PRIORITIES: SchoolPriority[] = ["info", "important", "urgent"];
function parsePriority(raw: FormDataEntryValue | null): SchoolPriority | undefined {
  if (typeof raw !== "string") return undefined;
  return (VALID_PRIORITIES as string[]).includes(raw) ? (raw as SchoolPriority) : undefined;
}

async function resolveActorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return null;
    if (data.display_name?.trim()) return data.display_name.trim();
    if (data.full_name?.trim()) return data.full_name.trim().split(" ")[0];
    return null;
  } catch {
    return null;
  }
}

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
    priority: parsePriority(formData.get("priority")),
    actorDisplayName: await resolveActorName(supabase, user.id),
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

  const rawSubtype = formData.has("subtype") ? (formData.get("subtype") as string) : undefined;
  if (rawSubtype !== undefined && !isValidSubtype(rawSubtype)) {
    redirect("/escola?error=" + encodeURIComponent("Tipo inválido."));
  }

  const result = await svcUpdate(
    supabase,
    logId,
    {
      title: (formData.get("title") as string) ?? undefined,
      description: formData.has("description") ? (formData.get("description") as string) : undefined,
      subject: formData.has("subject") ? (formData.get("subject") as string) : undefined,
      score: formData.has("score") ? (formData.get("score") as string) : undefined,
      subtype: rawSubtype as SchoolSubtype | undefined,
      childId: formData.has("childId") ? (formData.get("childId") as string) : undefined,
      logDate: formData.has("logDate") ? (formData.get("logDate") as string) : undefined,
      eventTime: formData.has("eventTime") ? ((formData.get("eventTime") as string) || null) : undefined,
      priority: parsePriority(formData.get("priority")),
    },
    user.id,
  );
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

/**
 * Mark a school_log as read by the current user. Idempotent.
 *
 * Called ONLY when the user explicitly opens a record detail — never on
 * list mount or scroll (see CLAUDE.md "Collaborative Records" — auto-read
 * destroys the value of read receipts for the coparent).
 *
 * No redirect: this is called from client interaction and the UI
 * optimistically updates. revalidatePath keeps the server-rendered
 * dashboard badge in sync on next navigation.
 */
export async function markSchoolLogRead(logId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const { error } = await supabase.rpc("mark_collab_read", {
    p_record_type: "school_log",
    p_record_id: logId,
  });
  if (error) return { success: false, error: error.message };

  // Telemetry — "the user actually opened the record". Drives the
  // "engajamento real" metric Henrique asked for.
  captureServerEvent(user.id, "school_log_read", { log_id: logId });

  revalidatePath("/escola");
  revalidatePath("/dashboard");
  return { success: true };
}
