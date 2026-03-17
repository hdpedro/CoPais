"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCustodyEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const responsibleUserId = formData.get("responsibleUserId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const custodyType = formData.get("custodyType") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("custody_events").insert({
    group_id: groupId,
    child_id: childId,
    responsible_user_id: responsibleUserId,
    start_date: startDate,
    end_date: endDate,
    custody_type: custodyType,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/calendario/novo?error=" + encodeURIComponent(error.message));
  redirect("/calendario");
}
