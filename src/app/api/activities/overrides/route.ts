/**
 * POST /api/activities/overrides
 *
 * Native-callable wrapper for single-occurrence activity overrides.
 * Mirrors PWA `editActivityOccurrence` (src/actions/activities.ts:826-913)
 * and `cancelActivityOccurrence` semantics, replacing direct
 * `activity_reports.overrides` jsonb writes from the native client.
 *
 * Body:
 *   {
 *     activityId: string,
 *     occurrenceDate: string,             // YYYY-MM-DD
 *     overrides: Record<string, unknown>, // whitelisted keys only
 *     mode: 'merge' | 'clear'
 *   }
 *
 * Allowed override keys (others → 400):
 *   time_start, time_end, responsible_id, notes, location, status
 *
 * Behaviour:
 *  1. Verifies activityId belongs to user's active group
 *  2. mode='clear'    → writes overrides: {} (or no-op when no row exists)
 *  3. mode='merge'    → top-level shallow merge of new keys onto existing
 *  4. If no activity_reports row yet, INSERTs one (status='completed' as a
 *     placeholder unless `status` is supplied by caller).
 *  5. If overrides.responsible_id is supplied, verifies that user is a
 *     member of the same group.
 *  6. If overrides.status === 'cancelled', fires the activity_cancelled
 *     push (createNotificationWithPush) for the other group members.
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createNotificationWithPush } from "@/lib/push";

const ALLOWED_KEYS = [
  "time_start",
  "time_end",
  "responsible_id",
  "notes",
  "location",
  "status",
] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

const ALLOWED_STATUSES = ["completed", "missed", "cancelled"] as const;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const activityId = body.activityId as string | undefined;
  const occurrenceDate = body.occurrenceDate as string | undefined;
  const mode = body.mode as string | undefined;
  const inputOverrides = (body.overrides ?? {}) as Record<string, unknown>;

  if (!activityId || !occurrenceDate) {
    return NextResponse.json(
      { error: "activityId e occurrenceDate obrigatórios." },
      { status: 400 },
    );
  }
  if (mode !== "merge" && mode !== "clear") {
    return NextResponse.json(
      { error: "mode deve ser 'merge' ou 'clear'." },
      { status: 400 },
    );
  }

  // Whitelist override keys
  const cleaned: Record<string, unknown> = {};
  if (mode === "merge") {
    for (const [k, v] of Object.entries(inputOverrides)) {
      if (!ALLOWED_KEYS.includes(k as AllowedKey)) {
        return NextResponse.json(
          { error: `Chave de override não permitida: ${k}.` },
          { status: 400 },
        );
      }
      cleaned[k] = v;
    }

    if (
      typeof cleaned.status === "string" &&
      !ALLOWED_STATUSES.includes(
        cleaned.status as (typeof ALLOWED_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Status inválido." },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  // Verify activity belongs to user's active group
  const { data: activity } = await admin
    .from("child_activities")
    .select("id, group_id")
    .eq("id", activityId)
    .single();
  if (!activity) {
    return NextResponse.json(
      { error: "Atividade não encontrada." },
      { status: 404 },
    );
  }

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", activity.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para esta atividade." },
      { status: 403 },
    );
  }

  // If responsible_id supplied, verify it's a member of the same group
  if (mode === "merge" && typeof cleaned.responsible_id === "string") {
    const { data: respMembership } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", activity.group_id)
      .eq("user_id", cleaned.responsible_id)
      .single();
    if (!respMembership) {
      return NextResponse.json(
        { error: "Responsável não pertence ao grupo." },
        { status: 400 },
      );
    }
  }

  // Read existing report row
  const { data: existing } = await admin
    .from("activity_reports")
    .select("id, overrides")
    .eq("activity_id", activityId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  let mergedOverrides: Record<string, unknown> = {};

  if (mode === "clear") {
    if (!existing) {
      return NextResponse.json({ success: true, overrides: {} });
    }
    const { error } = await admin
      .from("activity_reports")
      .update({ overrides: {} })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    // mode === 'merge'
    if (existing) {
      mergedOverrides = {
        ...((existing.overrides as Record<string, unknown>) ?? {}),
        ...cleaned,
      };
      const { error } = await admin
        .from("activity_reports")
        .update({ overrides: mergedOverrides })
        .eq("id", existing.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      mergedOverrides = { ...cleaned };
      const insertStatus =
        typeof cleaned.status === "string" ? cleaned.status : "completed";
      const { error } = await admin.from("activity_reports").insert({
        group_id: activity.group_id,
        activity_id: activityId,
        occurrence_date: occurrenceDate,
        reported_by: user.id,
        status: insertStatus,
        overrides: mergedOverrides,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  // Fire activity_cancelled push if status flipped to cancelled
  if (mode === "merge" && cleaned.status === "cancelled") {
    try {
      const { data: act } = await admin
        .from("child_activities")
        .select("name, child_id, children(full_name)")
        .eq("id", activityId)
        .single();
      const actName = act?.name ?? "Atividade";
      const childName =
        (act?.children as unknown as { full_name: string | null } | null)
          ?.full_name?.split(" ")[0] || "Criança";

      const { data: otherMembers } = await admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", activity.group_id)
        .neq("user_id", user.id);

      if (otherMembers) {
        await Promise.allSettled(
          otherMembers.map((m) =>
            createNotificationWithPush(
              m.user_id,
              "activity_cancelled",
              `${actName} cancelada`,
              `${childName} — ${actName} (${occurrenceDate}) foi cancelada.`,
              "/calendario",
            ).catch(() => {}),
          ),
        );
      }
    } catch {
      // notification failure is non-critical
    }
  }

  revalidatePath("/calendario");
  revalidateTag(`activities-${activity.group_id}`, "max");

  return NextResponse.json({ success: true, overrides: mergedOverrides });
}
