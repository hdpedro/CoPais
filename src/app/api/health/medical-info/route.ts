/**
 * PUT /api/health/medical-info → upsert child_medical_info (1 row per child)
 *
 * Native-callable wrapper around `src/actions/health.ts:upsertMedicalInfo`.
 * The PWA action uses the service-role admin client because RLS on
 * `child_medical_info` only allows insert, not update for non-creators
 * (see migration 00021). To keep parity for the native side without
 * loosening RLS, this route enforces the same membership + child-in-group
 * checks the action does, then upserts via admin.
 *
 * Body:
 *   {
 *     groupId: string,
 *     childId: string,
 *     blood_type?: string | null,
 *     insurance_name?: string | null,
 *     insurance_number?: string | null,
 *     sus_number?: string | null,
 *     primary_pediatrician_id?: string | null,
 *   }
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

const TEXT_FIELDS = [
  "blood_type",
  "insurance_name",
  "insurance_number",
  "sus_number",
  "primary_pediatrician_id",
] as const;

export async function PUT(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = body.childId as string | undefined;

  if (!groupId || !childId) {
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

  const payload: Record<string, unknown> = {
    child_id: childId,
    group_id: groupId,
  };
  for (const field of TEXT_FIELDS) {
    const v = body[field];
    if (v === undefined) continue;
    if (v === null) {
      payload[field] = null;
      continue;
    }
    if (typeof v !== "string") {
      return NextResponse.json(
        { error: `${field} deve ser string ou null.` },
        { status: 400 },
      );
    }
    const trimmed = v.trim();
    payload[field] = trimmed ? trimmed.slice(0, 500) : null;
  }

  // Upsert: 1 row per (child_id, group_id) — see migration 00021 unique idx.
  const { data: existing } = await admin
    .from("child_medical_info")
    .select("id")
    .eq("child_id", childId)
    .maybeSingle();

  if (existing) {
    const { child_id: _c, group_id: _g, ...updates } = payload;
    void _c;
    void _g;
    const { error } = await admin
      .from("child_medical_info")
      .update(updates)
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await admin.from("child_medical_info").insert(payload);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
