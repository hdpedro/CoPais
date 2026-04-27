/**
 * PATCH  /api/family/members  → change a member's role (admin-only)
 * DELETE /api/family/members  → remove a member or leave the group
 *
 * Native-callable wrapper around `src/actions/members.ts`. Mirrors the
 * exact admin gates and the "last admin can't leave" rule. Uses the
 * service role for the mutation since `group_members` has no UPDATE/DELETE
 * RLS policies (intentional — actions/API routes are the only writers).
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

const VALID_ROLES = ["admin", "member", "readonly"];

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const memberId = body.memberId as string | undefined;
  const groupId = body.groupId as string | undefined;
  const newRole = body.newRole as string | undefined;

  if (!memberId || !groupId || !newRole) {
    return NextResponse.json({ error: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(newRole)) {
    return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
  }
  if (memberId === user.id) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio papel." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Requester must be admin of the group
  const { data: requesterMembership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!requesterMembership || requesterMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem alterar permissões." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("group_members")
    .update({ role: newRole })
    .eq("group_id", groupId)
    .eq("user_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "member_role_changed", { newRole });
  revalidateTag(`members-${groupId}`, "max");
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  // memberId + groupId via query string (DELETE bodies are unreliable across runtimes).
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");
  const groupId = url.searchParams.get("groupId");

  if (!groupId) {
    return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mode 1: leaving the group (memberId omitted or === user.id)
  const isLeaving = !memberId || memberId === user.id;

  if (isLeaving) {
    const { data: myMembership } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!myMembership) {
      return NextResponse.json(
        { error: "Você não pertence a este grupo." },
        { status: 404 },
      );
    }

    // Last admin guard — must promote someone before leaving
    if (myMembership.role === "admin") {
      const { data: otherAdmins } = await admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("role", "admin")
        .neq("user_id", user.id);
      if (!otherAdmins || otherAdmins.length === 0) {
        return NextResponse.json(
          {
            error:
              "Você é o único administrador. Promova outro membro antes de sair.",
          },
          { status: 400 },
        );
      }
    }

    const { error } = await admin
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    revalidateTag(`members-${groupId}`, "max");
    return NextResponse.json({ success: true, left: true });
  }

  // Mode 2: removing another member — admin only
  const { data: requesterMembership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!requesterMembership || requesterMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem remover membros." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "member_removed");
  revalidateTag(`members-${groupId}`, "max");
  return NextResponse.json({ success: true });
}
