/**
 * POST /api/invitations
 *
 * Native-callable wrapper around `createInvitation` from
 * `src/actions/invitation.ts`. Enforces the admin gate that native
 * previously bypassed via direct INSERT (auth-bypass P0). Updates
 * onboarding step + quest progress + analytics in a single place.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { markQuestStep } from "@/actions/onboarding-quest";
import { notifyCoparents } from "@/lib/services/notify-coparents";

const ALLOWED_ROLES = ["parent", "mediator", "lawyer"];

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const role = (body.role as string | undefined) || "parent";

  if (!groupId || !email) {
    return NextResponse.json({ error: "groupId e email obrigatórios." }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pai e mae (admin ou member) podem convidar membros — co-pais
  // responsaveis em pe de igualdade. Readonly bloqueado.
  const { data: membership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership || (membership.role !== "admin" && membership.role !== "member")) {
    return NextResponse.json(
      { error: "Apenas pais responsáveis podem convidar membros." },
      { status: 403 },
    );
  }

  const groupRole =
    role === "mediator" || role === "lawyer" ? "readonly" : "member";

  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      group_id: groupId,
      invited_by: user.id,
      email,
      role,
      group_role: groupRole,
    })
    .select("id, token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "invitation_sent", {
    group_id: groupId,
    role,
  });

  // Transparencia: avisa o outro co-pai que um convite foi enviado.
  await notifyCoparents({
    groupId,
    actorUserId: user.id,
    type: "invitation_sent",
    title: "Convite enviado",
    message: `Um novo convite (${role}) foi enviado para ${email}.`,
    link: "/familia",
  });

  // Quest step: inviting a co-responsible unlocks the 'invite_co' step
  // regardless of the invitee's role — the value is "you reached out".
  try {
    await markQuestStep("invite_co", { role });
  } catch {
    // non-fatal
  }

  // Update onboarding progress to step 4 (complete) when applicable
  await admin
    .from("profiles")
    .update({ onboarding_step: 4 })
    .eq("id", user.id)
    .lt("onboarding_step", 4);

  captureServerEvent(user.id, "onboarding_completed");
  revalidateTag(`invitations-${groupId}`, "max");
  return NextResponse.json({
    success: true,
    invitationId: invitation.id,
    token: invitation.token,
  });
}
