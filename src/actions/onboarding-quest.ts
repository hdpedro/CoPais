"use server";

// Types + constants live in @/lib/quest-types so Client Components and
// other server files can import them without violating the "use server"
// rule (only async functions allowed as exports).

import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { QUEST_STEPS, type QuestStep, type QuestProgress } from "@/lib/quest-types";

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

/**
 * Marca o onboarding como concluído pro user atual setando
 * `profiles.onboarding_step = 4`. Idempotente. Chamada pelo botão "Ir pro
 * app · convido depois" no fim do wizard.
 *
 * Bug 2026-05-25: o botão antes só fazia `window.location.href` sem
 * persistir o step, deixando 25 users com `onboarding_step=2` no DB —
 * o que travava jobs/quests/observability que segmentam por step.
 */
export async function markOnboardingFinished() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "unauthenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_step: 4 })
    .eq("id", user.id);

  if (error) {
    // Não-fatal — o user já tem grupo + criança, só o métrica fica stale.
    console.warn("[markOnboardingFinished] update failed:", error.message);
    return { success: false, error: error.message };
  }

  captureServerEvent(user.id, "onboarding_finished");
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

  // O convidado (2º responsável) NUNCA dispara markQuestStep("invite_co") —
  // quem convida é o admin — e a tela /convite/enviar é admin-only. Resultado:
  // o convidado ficava preso na etapa 3 do quest sem nunca poder concluí-la
  // (bug reportado 2026-06-22). Para ele a etapa já está satisfeita: o
  // co-responsável existe (é quem o convidou). Tratamos "convidar o
  // co-responsável" como concluído sempre que o grupo do user já tem 2+
  // membros. Vale também pro admin depois que o convite é aceito —
  // idempotente e consistente. Calculado no read (sem migration/backfill):
  // já cura quem está preso em produção no próximo load do dashboard.
  if (!completed.has("invite_co")) {
    const { data: myGroups } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
    const groupIds = (myGroups ?? []).map((g) => g.group_id as string);
    if (groupIds.length > 0) {
      const { count } = await supabase
        .from("group_members")
        .select("user_id", { count: "exact", head: true })
        .in("group_id", groupIds)
        .neq("user_id", user.id);
      if ((count ?? 0) > 0) completed.add("invite_co");
    }
  }

  return {
    completed,
    totalSteps: QUEST_STEPS.length,
    completedCount: completed.size,
  };
}
