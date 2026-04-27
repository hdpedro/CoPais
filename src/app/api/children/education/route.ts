/**
 * PUT /api/children/education → upsert education record (1 row per child)
 *
 * Native-callable wrapper around `src/actions/children.ts:upsertChildEducation`.
 * Native previously read/wrote `child_education` directly, skipping the
 * `child belongs to group` check that the PWA action enforces.
 *
 * Body:
 *   {
 *     groupId: string,
 *     childId: string,
 *     school_name?: string | null,
 *     school_address?: string | null,
 *     school_phone?: string | null,
 *     grade?: string | null,
 *     class_name?: string | null,
 *     teacher_name?: string | null,
 *     coordinator_name?: string | null,
 *     entry_time?: string | null,    // 'HH:MM' or 'HH:MM:SS'
 *     exit_time?: string | null,
 *     extracurricular_activities?: string[] | null,
 *   }
 *
 * Schema reference (table `child_education`): one row per `child_id`.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

const TEXT_FIELDS = [
  "school_name",
  "school_address",
  "school_phone",
  "grade",
  "class_name",
  "teacher_name",
  "coordinator_name",
  "entry_time",
  "exit_time",
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
  if ("extracurricular_activities" in body) {
    const raw = body.extracurricular_activities;
    if (raw === null) {
      payload.extracurricular_activities = null;
    } else if (Array.isArray(raw)) {
      const cleaned = raw
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((a) => a.slice(0, 200));
      payload.extracurricular_activities =
        cleaned.length > 0 ? cleaned : null;
    } else {
      return NextResponse.json(
        { error: "extracurricular_activities deve ser array ou null." },
        { status: 400 },
      );
    }
  }

  // Upsert: existing row → update, else insert. One row per child.
  const { data: existing } = await admin
    .from("child_education")
    .select("id")
    .eq("child_id", childId)
    .maybeSingle();

  if (existing) {
    const { child_id: _c, group_id: _g, ...updates } = payload;
    void _c;
    void _g;
    const { error } = await admin
      .from("child_education")
      .update(updates)
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await admin.from("child_education").insert(payload);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  captureServerEvent(user.id, "child_education_updated", { childId });
  return NextResponse.json({ success: true });
}
