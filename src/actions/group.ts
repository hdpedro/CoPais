"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const childName = formData.get("childName") as string;
  const childBirthDate = formData.get("childBirthDate") as string;

  // Create group
  const { data: group, error: groupError } = await supabase
    .from("coparenting_groups")
    .insert({ name, created_by: user.id })
    .select()
    .single();

  if (groupError) redirect("/onboarding?error=" + encodeURIComponent(groupError.message));

  // Add creator as admin
  await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin",
  });

  // Add child if provided
  if (childName && childBirthDate) {
    await supabase.from("children").insert({
      group_id: group.id,
      full_name: childName,
      birth_date: childBirthDate,
    });
  }

  redirect("/onboarding/convite");
}

export async function addChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
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
  redirect("/criancas");
}

export async function updateChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = formData.get("id") as string;
  const fullName = formData.get("fullName") as string;
  const birthDate = formData.get("birthDate") as string;
  const allergies = formData.get("allergies") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase
    .from("children")
    .update({
      full_name: fullName,
      birth_date: birthDate,
      allergies: allergies ? allergies.split(",").map(a => a.trim()) : null,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) redirect("/criancas?error=" + encodeURIComponent(error.message));
  redirect("/criancas");
}
