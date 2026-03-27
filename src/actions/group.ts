"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { captureServerEvent } from "@/lib/posthog-server";

export async function createGroup(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessao expirada. Faca login novamente." };

  const name = formData.get("name") as string;
  const childName = formData.get("childName") as string;
  const childBirthDate = formData.get("childBirthDate") as string;

  // Generate UUID upfront so we don't need .select() after insert
  // (RLS SELECT policy requires group membership which doesn't exist yet)
  const groupId = crypto.randomUUID();

  // Create group
  const { error: groupError } = await supabase
    .from("coparenting_groups")
    .insert({ id: groupId, name, created_by: user.id });

  if (groupError) return { error: groupError.message };

  // Add creator as admin
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) return { error: memberError.message };

  // Add child if provided
  if (childName && childBirthDate) {
    const { error: childError } = await supabase.from("children").insert({
      group_id: groupId,
      full_name: childName,
      birth_date: childBirthDate,
    });
    if (childError) return { error: childError.message };
  }

  captureServerEvent(user.id, "group_created");

  // Don't call revalidatePath here — it triggers a page re-render during
  // the server action which causes redirect loops with auth token refresh.
  // The client component will navigate with router.push() + router.refresh().
  return { success: true };
}

export async function addChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const fullName = formData.get("fullName") as string;
  const birthDate = formData.get("birthDate") as string;
  const allergies = formData.get("allergies") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("children").insert({
    group_id: groupId,
    full_name: fullName,
    birth_date: birthDate,
    allergies: allergies ? allergies.split(",").map(a => a.trim()) : null,
    notes: notes || null,
  });

  if (error) redirect("/criancas/nova?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "child_added");

  redirect("/criancas");
}

export async function updateChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = formData.get("id") as string;

  // Verify user belongs to the child's group
  const { data: child } = await supabase
    .from("children")
    .select("group_id")
    .eq("id", id)
    .single();

  if (!child) {
    redirect("/criancas?error=" + encodeURIComponent("Crianca nao encontrada."));
  }

  const membership = await verifyGroupMembership(supabase, child.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const fullName = formData.get("fullName") as string;
  const birthDate = formData.get("birthDate") as string;
  const allergies = formData.get("allergies") as string;
  const notes = formData.get("notes") as string;
  const cpf = formData.get("cpf") as string;
  const rg = formData.get("rg") as string;

  const { error } = await supabase
    .from("children")
    .update({
      full_name: fullName,
      birth_date: birthDate,
      allergies: allergies ? allergies.split(",").map(a => a.trim()) : null,
      notes: notes || null,
      cpf: cpf || null,
      rg: rg || null,
    })
    .eq("id", id);

  if (error) redirect("/criancas/" + id + "?tab=geral&error=" + encodeURIComponent(error.message));
  revalidatePath("/criancas/" + id);
  redirect("/criancas/" + id + "?tab=geral");
}
