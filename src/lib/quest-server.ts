/**
 * Server-side quest helper compartilhado entre route handlers e server
 * actions. Razão de existir: route handlers (Node/Edge) não podem chamar
 * server actions diretamente sem ginástica; reaproveitamos a lógica de
 * INSERT idempotente + analytics em um único lugar.
 *
 * Callers atuais:
 *   - src/actions/onboarding-quest.ts:markQuestStep (server action)
 *   - src/app/api/onboarding-quest/mark-step/route.ts (native bridge)
 *   - src/app/api/create-group/route.ts (wizard PWA + Native)
 *   - src/app/api/children/route.ts (adicionar criança)
 *
 * Sem essa centralização, F#24 (E2E 2026-05-25) acontecia: caminhos
 * api/* criavam crianças sem marcar quest, dashboard ficava 0/5 mesmo
 * com criança real no DB.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";
import { QUEST_STEPS, type QuestStep } from "@/lib/quest-types";

export interface QuestStepResult {
  success: boolean;
  alreadyCompleted: boolean;
  error?: string;
}

/**
 * Registra um quest step pro user de forma idempotente. Best-effort —
 * non-fatal pra fluxos críticos (create-group, etc.).
 *
 * @param admin - Supabase client com service role (passa pelos RLS).
 * @param userId - User ID do auth.
 * @param step - Quest step (validado contra QUEST_STEPS).
 * @param metadata - Contexto opcional (via, source, etc.) pra audit.
 */
export async function recordQuestStepServer(
  admin: SupabaseClient,
  userId: string,
  step: QuestStep,
  metadata: Record<string, unknown> = {},
): Promise<QuestStepResult> {
  const { error } = await admin.from("onboarding_quests").insert({
    user_id: userId,
    step,
    metadata,
  });

  // 23505 = duplicate; sucesso idempotente (já foi marcado antes).
  if (error && error.code !== "23505") {
    return { success: false, alreadyCompleted: false, error: error.message };
  }

  const alreadyCompleted = !!error;

  // Telemetria só na primeira marcação (skip duplicates).
  if (!error) {
    captureServerEvent(userId, "quest_step_completed", { step });

    // Milestone: completou todos os steps.
    const { count } = await admin
      .from("onboarding_quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count === QUEST_STEPS.length) {
      captureServerEvent(userId, "quest_all_completed");
    }
  }

  return { success: true, alreadyCompleted };
}
