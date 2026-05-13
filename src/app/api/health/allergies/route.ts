/**
 * POST   /api/health/allergies → register a new allergy
 * PATCH  /api/health/allergies → update name/type/severity/reaction
 * DELETE /api/health/allergies?id=… → remove an allergy
 *
 * Native-callable wrapper over the same logic in
 * `src/actions/health.ts:{createAllergy,updateAllergy,deleteAllergy}`.
 * Native previously inserted/deleted directly on `child_allergies`,
 * skipping the `child belongs to group` check that the PWA actions
 * enforce — letting a member touch records pointing to a child outside
 * their own group.
 *
 * Schema reference (table `child_allergies`):
 *   id uuid PK, group_id uuid NOT NULL, child_id uuid NOT NULL,
 *   name text NOT NULL, allergy_type text NOT NULL, severity text NOT NULL,
 *   reaction text NULL, created_by uuid NOT NULL, created_at timestamptz.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifySaudeCreate } from "@/lib/services/health-collab";

const VALID_TYPES = ["food", "medication", "environmental", "other"] as const;
const VALID_SEVERITIES = ["mild", "moderate", "severe"] as const;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = body.childId as string | undefined;
  const name = ((body.name as string | undefined) || "").trim();
  const allergyType = body.allergyType as string | undefined;
  const severity = body.severity as string | undefined;
  const reaction = ((body.reaction as string | undefined) || "").trim();

  if (!groupId || !childId) {
    return NextResponse.json(
      { error: "groupId e childId obrigatórios." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "Nome da alergia obrigatório." },
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

  const { data: inserted, error } = await admin
    .from("child_allergies")
    .insert({
      group_id: groupId,
      child_id: childId,
      name: name.slice(0, 200),
      allergy_type: VALID_TYPES.includes(
        allergyType as (typeof VALID_TYPES)[number],
      )
        ? allergyType
        : "other",
      severity: VALID_SEVERITIES.includes(
        severity as (typeof VALID_SEVERITIES)[number],
      )
        ? severity
        : "mild",
      reaction: reaction ? reaction.slice(0, 500) : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "allergy_created", { childId });

  // Saúde Foundation (migration 00080): notifica coparentes com coalescing
  // 60s + priority 'important' (segurança/emergência). Falha silenciosa.
  if (inserted?.id) {
    const [profileRes, childRes] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
      admin.from("children").select("full_name").eq("id", childId).single(),
    ]);
    const actorName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
    const childName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];
    const sevLabel =
      severity === "severe" ? "Grave" :
      severity === "moderate" ? "Moderada" :
      severity === "mild" ? "Leve" : null;
    const desc = sevLabel ? `${name} · ${sevLabel}` : name;
    await notifySaudeCreate({
      recordType: "child_allergy",
      recordId: inserted.id,
      groupId,
      actorUserId: user.id,
      actorFirstName: actorName,
      childFirstName: childName,
      description: desc,
    });
  }

  return NextResponse.json({ success: true, id: inserted?.id });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const allergyId = body.allergyId as string | undefined;
  if (!allergyId) {
    return NextResponse.json(
      { error: "allergyId obrigatório." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: allergy } = await admin
    .from("child_allergies")
    .select("id, group_id")
    .eq("id", allergyId)
    .single();
  if (!allergy) {
    return NextResponse.json(
      { error: "Alergia não encontrada." },
      { status: 404 },
    );
  }

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", allergy.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v) {
      return NextResponse.json(
        { error: "Nome da alergia não pode ficar vazio." },
        { status: 400 },
      );
    }
    updates.name = v.slice(0, 200);
  }
  if (typeof body.allergyType === "string") {
    if (
      !VALID_TYPES.includes(body.allergyType as (typeof VALID_TYPES)[number])
    ) {
      return NextResponse.json(
        { error: `allergyType inválido. Aceitos: ${VALID_TYPES.join(", ")}.` },
        { status: 400 },
      );
    }
    updates.allergy_type = body.allergyType;
  }
  if (typeof body.severity === "string") {
    if (
      !VALID_SEVERITIES.includes(
        body.severity as (typeof VALID_SEVERITIES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `severity inválido. Aceitos: ${VALID_SEVERITIES.join(", ")}.`,
        },
        { status: 400 },
      );
    }
    updates.severity = body.severity;
  }
  if (typeof body.reaction === "string") {
    const v = body.reaction.trim();
    updates.reaction = v ? v.slice(0, 500) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nenhum campo para atualizar." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("child_allergies")
    .update(updates)
    .eq("id", allergyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "allergy_updated", { allergyId });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(request.url);
  const allergyId = url.searchParams.get("id");
  if (!allergyId) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: allergy } = await admin
    .from("child_allergies")
    .select("id, group_id")
    .eq("id", allergyId)
    .single();
  if (!allergy) {
    return NextResponse.json(
      { error: "Alergia não encontrada." },
      { status: 404 },
    );
  }

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", allergy.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("child_allergies")
    .delete()
    .eq("id", allergyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "allergy_deleted", { allergyId });
  return NextResponse.json({ success: true });
}
