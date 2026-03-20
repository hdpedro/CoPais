"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createAgreement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

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
  revalidatePath("/acordos");
  redirect("/acordos");
}

export async function acceptAgreement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agreementId = formData.get("agreementId") as string;

  // Fetch the agreement to verify group membership
  const { data: agreement } = await supabase
    .from("agreements")
    .select("group_id")
    .eq("id", agreementId)
    .single();

  if (!agreement) {
    redirect("/acordos?error=" + encodeURIComponent("Acordo nao encontrado."));
  }

  // Verify user belongs to the agreement's group
  const membership = await verifyGroupMembership(supabase, agreement.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const { error } = await supabase
    .from("agreements")
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", agreementId);

  if (error) redirect("/acordos?error=" + encodeURIComponent(error.message));
  revalidatePath("/acordos");
  redirect("/acordos");
}
