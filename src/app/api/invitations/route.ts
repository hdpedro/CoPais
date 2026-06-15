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
import { sendInvitationEmail } from "@/lib/emails/invitation";

// Mantém paridade com `src/actions/invitation.ts:createInvitation` e com a UI
// de convite (PWA `/onboarding/convite` + native `onboarding/convite.tsx`),
// que historicamente expõem 3 papéis familiares (parent/grandparent/caregiver).
// `mediator` e `lawyer` ficam disponíveis para fluxos administrativos (membros
// da página de Família). `group_role` continua sendo derivado abaixo —
// mediator/lawyer ⇒ readonly, demais ⇒ member.
const ALLOWED_ROLES = ["parent", "grandparent", "caregiver", "mediator", "lawyer"];

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

  // Side-effects pós-criação são TODOS best-effort: o convite já foi criado
  // (token garantido), então NADA aqui pode transformar um convite válido em
  // erro pro cliente. Bug Hailla 2026-06-06: um side-effect awaited e
  // desprotegido (notifyCoparents/revalidateTag/profiles update) lançava ->
  // route 500 -> o app mostrava (e crashava ao renderizar) um erro mesmo com o
  // convite JÁ criado. Envolve tudo num try/catch e sempre retorna success.
  try {
    // Envia o e-mail de convite ao convidado (best-effort, primeiro no try pra
    // não ser pulado se um side-effect posterior lançar). Antes o convidado não
    // recebia nada — só o link compartilhável manual (bug Murilo 2026-06-15).
    const [{ data: inviterProfile }, { data: group }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("coparenting_groups").select("name").eq("id", groupId).maybeSingle(),
    ]);
    await sendInvitationEmail({
      to: email,
      inviterName: inviterProfile?.full_name ?? null,
      groupName: group?.name ?? null,
      role,
      token: invitation.token,
    });

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
    await markQuestStep("invite_co", { role });

    // Update onboarding progress to step 4 (complete) when applicable
    await admin
      .from("profiles")
      .update({ onboarding_step: 4 })
      .eq("id", user.id)
      .lt("onboarding_step", 4);

    captureServerEvent(user.id, "onboarding_completed");
    revalidateTag(`invitations-${groupId}`, "max");
  } catch (sideEffectError) {
    // Convite JÁ criado — nunca falhar por notificação/analytics/revalidate.
    // Loga pra investigação e segue retornando success.
    console.error("[invitations] side-effect pós-criação falhou (non-fatal):", sideEffectError);
  }

  return NextResponse.json({
    success: true,
    invitationId: invitation.id,
    token: invitation.token,
  });
}
