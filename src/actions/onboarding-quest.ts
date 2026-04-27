"use server";

import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";

export type QuestStep =
  | "add_child"
  | "setup_calendar"
  | "invite_co"
  | "ocr_prescription"
  | "ai_agreement";

export const QUEST_STEPS: QuestStep[] = [
  "add_child",
  "setup_calendar",
  "invite_co",
  "ocr_prescription",
  "ai_agreement",
];

export interface QuestProgress {
  completed: Set<QuestStep>;
  totalSteps: number;
  completedCount: number;
}

/**
 * Idempotently marks a quest step as completed. Safe to call from
 * anywhere — the UNIQUE(user_id, step) constraint in migration 00057
 * prevents duplicate inserts, and we swallow 23505 conflicts as success.
 *
 * Called from wherever the user naturally performs the action:
 *   add_child          → createGroup / addChild actions
 *   setup_calendar     → custody-schedule creation
 *   invite_co          → createInvitation action
 *   ocr_prescription   → /api/ai/parse-invite or /saude/receita upload
 *   ai_agreement       → /api/ai/assistant tool call
 */
export async function markQuestStep(step: QuestStep, metadata?: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "unauthenticated" };

  const { error } = await supabase.from("onboarding_quests").insert({
    user_id: user.id,
    step,
    metadata: metadata ?? {},
  });

  // 23505 = duplicate key; treat as "already completed" which is the
  // intended idempotent behaviour.
  if (error && error.code !== "23505") {
    return { success: false, error: error.message };
  }

  if (!error) {
    // Only fire the analytics event on the FIRST completion — duplicate
    // inserts return a 23505 and skip this branch.
    captureServerEvent(user.id, "quest_step_completed", { step });

    // If this was the final step, fire a milestone event separately.
    const { count } = await supabase
      .from("onboarding_quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (count === QUEST_STEPS.length) {
      captureServerEvent(user.id, "quest_all_completed");
    }
  }

  return { success: true };
}

/** Returns the user's current quest progress. */
export async function getQuestProgress(): Promise<QuestProgress> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { completed: new Set(), totalSteps: QUEST_STEPS.length, completedCount: 0 };
  }

  const { data } = await supabase
    .from("onboarding_quests")
    .select("step")
    .eq("user_id", user.id);

  const completed = new Set((data ?? []).map((r) => r.step as QuestStep));
  return {
    completed,
    totalSteps: QUEST_STEPS.length,
    completedCount: completed.size,
  };
}
