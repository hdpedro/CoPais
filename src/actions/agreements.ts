"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAgreement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const isNonNegotiable = formData.get("isNonNegotiable") === "on";

  const { error } = await supabase.from("agreements").insert({
    group_id: groupId,
    title,
    description,
    category,
    is_non_negotiable: isNonNegotiable,
    created_by: user.id,
  });

  if (error) redirect("/acordos?error=" + encodeURIComponent(error.message));
  redirect("/acordos");
}

export async function acceptAgreement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agreementId = formData.get("agreementId") as string;

  const { error } = await supabase
    .from("agreements")
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", agreementId);

  if (error) redirect("/acordos?error=" + encodeURIComponent(error.message));
  redirect("/acordos");
}
