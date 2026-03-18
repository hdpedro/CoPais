"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createSchoolLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;
  const logType = formData.get("logType") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const logDate = formData.get("logDate") as string;

  const { error } = await supabase.from("school_logs").insert({
    group_id: groupId,
    child_id: childId,
    log_type: logType,
    title,
    description: description || null,
    log_date: logDate || new Date().toISOString().split("T")[0],
    logged_by: user.id,
  });

  if (error) redirect("/escola?error=" + encodeURIComponent(error.message));
  redirect("/escola");
}
