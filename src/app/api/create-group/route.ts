import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sessao expirada. Faca login novamente." }, { status: 401 });
  }

  const body = await request.json();
  const { name, childName, childBirthDate } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome da familia e obrigatorio." }, { status: 400 });
  }

  // Generate UUID upfront so we don't need .select() after insert
  // (RLS SELECT policy requires group membership which doesn't exist yet)
  const groupId = crypto.randomUUID();

  // Create group
  const { error: groupError } = await supabase
    .from("coparenting_groups")
    .insert({ id: groupId, name, created_by: user.id });

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }

  // Add creator as admin
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  // Add child if provided
  let step = 1; // group created
  if (childName && childBirthDate) {
    const { error: childError } = await supabase.from("children").insert({
      group_id: groupId,
      full_name: childName,
      birth_date: childBirthDate,
    });
    if (childError) {
      return NextResponse.json({ error: childError.message }, { status: 400 });
    }
    step = 2; // child created
  }

  // Update onboarding progress
  await supabase.from("profiles").update({ onboarding_step: step }).eq("id", user.id);

  // Invalidate caches
  revalidateTag(`profile-${user.id}`, "max");
  revalidateTag(`members-${groupId}`, "max");
  revalidateTag(`children-${groupId}`, "max");

  return NextResponse.json({ success: true, groupId });
}
