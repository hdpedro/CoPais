"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createSensitiveNote(formData: FormData) {
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
  const topic = formData.get("topic") as string;
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const sourceUrl = formData.get("sourceUrl") as string;
  const isUrgent = formData.get("isUrgent") === "on";

  const { error } = await supabase.from("sensitive_notes").insert({
    group_id: groupId,
    child_id: childId || null,
    topic,
    title,
    content,
    source_url: sourceUrl || null,
    is_urgent: isUrgent,
    created_by: user.id,
  });

  if (error) redirect("/temas-sensiveis?error=" + encodeURIComponent(error.message));
  redirect("/temas-sensiveis");
}
