"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createHealthLog(formData: FormData) {
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
  const value = formData.get("value") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("health_logs").insert({
    group_id: groupId,
    child_id: childId,
    log_type: logType,
    value: value || null,
    notes: notes || null,
    logged_by: user.id,
  });

  if (error) redirect("/saude?error=" + encodeURIComponent(error.message));
  redirect("/saude");
}
