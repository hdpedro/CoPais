/**
 * POST /api/onboarding-quest/mark-step
 *
 * Native-callable wrapper around `src/actions/onboarding-quest.ts:markQuestStep`.
 * Idempotent — UNIQUE constraint on (user_id, step) handles duplicates.
 * Native previously called `markQuestStep` client-side via direct INSERT
 * which dispersed the analytics events between web and mobile.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { QUEST_STEPS, type QuestStep } from "@/lib/quest-types";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const step = body.step as string | undefined;
  const metadata = (body.metadata as Record<string, unknown> | undefined) ?? {};

  if (!step || !(QUEST_STEPS as readonly string[]).includes(step)) {
    return NextResponse.json(
      { error: `Step inválido. Aceitos: ${QUEST_STEPS.join(", ")}.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("onboarding_quests").insert({
    user_id: user.id,
    step,
    metadata,
  });

  // 23505 = duplicate; idempotent success.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!error) {
    captureServerEvent(user.id, "quest_step_completed", { step });
    const { count } = await admin
      .from("onboarding_quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (count === QUEST_STEPS.length) {
      captureServerEvent(user.id, "quest_all_completed");
    }
  }

  return NextResponse.json({ success: true, alreadyCompleted: !!error });
}

export async function GET(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("onboarding_quests")
    .select("step")
    .eq("user_id", user.id);

  const completed = (data ?? []).map((r) => r.step as QuestStep);
  return NextResponse.json({
    completed,
    totalSteps: QUEST_STEPS.length,
    completedCount: completed.length,
  });
}
