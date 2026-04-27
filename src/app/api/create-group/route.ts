import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // Dual auth: Bearer (native) + cookie (PWA). Without Bearer support
  // native onboarding fails because the middleware redirects unauth
  // requests to /session-recovery and the route never sees them.
  const authHeader = request.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
  } else {
    const cookieClient = await createClient();
    const { data: { user: cookieUser } } = await cookieClient.auth.getUser();
    if (cookieUser) userId = cookieUser.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Sessao expirada. Faca login novamente." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const { name, childName, childBirthDate } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome da familia e obrigatorio." }, { status: 400 });
  }

  // Use admin client for the actual writes — RLS would block the SELECT-
  // after-INSERT pattern (group membership doesn't exist yet) and we
  // already verified the user identity above.
  const admin = createAdminClient();

  // Generate UUID upfront so we don't need .select() after insert.
  const groupId = crypto.randomUUID();

  // Create group
  const { error: groupError } = await admin
    .from("coparenting_groups")
    .insert({ id: groupId, name, created_by: userId });

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }

  // Add creator as admin
  const { error: memberError } = await admin.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "admin",
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  // Add child if provided
  let step = 1; // group created
  if (childName && childBirthDate) {
    const { error: childError } = await admin.from("children").insert({
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
  await admin.from("profiles").update({ onboarding_step: step }).eq("id", userId);

  // Invalidate caches
  revalidateTag(`profile-${userId}`, "max");
  revalidateTag(`members-${groupId}`, "max");
  revalidateTag(`children-${groupId}`, "max");

  return NextResponse.json({ success: true, groupId });
}
