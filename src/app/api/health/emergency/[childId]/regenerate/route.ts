/**
 * POST /api/health/emergency/[childId]/regenerate
 *   → rotate the public `emergency_token` on a child.
 *
 * Native-callable wrapper around `src/actions/health.ts:regenerateEmergencyToken`.
 * The PWA action uses service-role admin to update `children.emergency_token`
 * (RLS on `children` allows update only for create_by user, not all parents).
 * This route enforces membership in the child's group, then rotates via admin.
 *
 * Body:
 *   { groupId: string }
 *
 * Response: { success: true, emergency_token: string }
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { childId } = await params;
  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;

  if (!childId || !groupId) {
    return NextResponse.json(
      { error: "groupId e childId obrigatórios." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();
  if (!child) {
    return NextResponse.json(
      { error: "Criança não pertence a este grupo." },
      { status: 403 },
    );
  }

  const newToken = randomUUID();

  const { error } = await admin
    .from("children")
    .update({ emergency_token: newToken })
    .eq("id", childId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, emergency_token: newToken });
}
