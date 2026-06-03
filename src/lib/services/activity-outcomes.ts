/* ------------------------------------------------------------------ */
/* services/activity-outcomes.ts                                       */
/* Registra o desfecho "aconteceu?" de uma ocorrência a partir dos     */
/* QUICK ACTIONS do push de follow-up (feedback Amanda themes 1+2).    */
/*                                                                     */
/* REUSA a infra existente:                                            */
/*   - Sim  → activity_reports.status = 'completed' (migration 00023)  */
/*   - Não  → activity_reports.status = 'missed'                       */
/*   - Adiar→ activity_followup_snoozes.snooze_until (migration 00107) */
/* Não cria tabela nova de desfecho — a `activity_reports` (com notes  */
/* + child_mood + modal "Como foi?") já é a fonte de verdade. O write  */
/* do quick action preserva notes/child_mood já preenchidos (só mexe   */
/* em status + reported_by).                                           */
/*                                                                     */
/* Callers (wrappers finos):                                           */
/*   - src/app/api/activities/outcome/route.ts (Native + SW + in-app)  */
/*                                                                     */
/* Admin client + enforceMembership=true (gate manual). PWA in-app já  */
/* tem o ActivityReportModal + a action submitActivityReport.          */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

/** Vocabulário do quick action (mapeia pro status do activity_reports). */
export type ActivityOutcomeStatus = "happened" | "missed" | "snoozed";

export type ActivityOutcomeErrorCode =
  | "missing_fields"
  | "invalid_status"
  | "invalid_date"
  | "not_found"
  | "fk_violation"
  | "check_violation"
  | "permission_denied"
  | "db_error";

export interface ActivityOutcomeFailure {
  ok: false;
  error: string;
  errorCode: ActivityOutcomeErrorCode;
  status: number;
  pgCode?: string;
}

export interface ActivityOutcomeSuccess {
  ok: true;
  data: {
    activityId: string;
    occurrenceDate: string;
    status: ActivityOutcomeStatus;
    snoozeUntil: string | null;
  };
}

export type ActivityOutcomeResult =
  | ActivityOutcomeSuccess
  | ActivityOutcomeFailure;

export interface RecordActivityOutcomeInput {
  activityId: string;
  /** YYYY-MM-DD da ocorrência. */
  occurrenceDate: string;
  status: ActivityOutcomeStatus;
  /** Quem marcou (reported_by / snoozed_by). */
  userId: string;
  /** Só pra 'snoozed': minutos até re-perguntar. Default 60. */
  snoozeMinutes?: number;
}

export interface ActivityOutcomeContext {
  /** Rota/action de origem — vai pro error_logs. */
  callerPath: string;
  /**
   * Quando true, checa membership manualmente ANTES de escrever. Necessário
   * com admin client (bypassa RLS) — caso da API route.
   */
  enforceMembership: boolean;
  /** Origem (analytics). Ex: "push_action_ios". */
  via?: string;
}

const VALID_STATUS: ReadonlySet<string> = new Set(["happened", "missed", "snoozed"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SNOOZE_MINUTES = 60;

/** quick action → status do activity_reports. */
const REPORT_STATUS: Record<"happened" | "missed", "completed" | "missed"> = {
  happened: "completed",
  missed: "missed",
};

/* ------------------------------------------------------------------ */
/* mapPgError                                                          */
/* ------------------------------------------------------------------ */

export function mapPgError(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  fallback: ActivityOutcomeErrorCode = "db_error",
): ActivityOutcomeFailure {
  const pgCode = error.code;
  if (pgCode === "23503") {
    return { ok: false, errorCode: "fk_violation", error: "Essa atividade não existe mais.", status: 409, pgCode };
  }
  if (pgCode === "23514") {
    return { ok: false, errorCode: "check_violation", error: "Status inválido para o registro da atividade.", status: 400, pgCode };
  }
  if (pgCode === "42501") {
    return { ok: false, errorCode: "permission_denied", error: "Você não faz parte do grupo dessa atividade.", status: 403, pgCode };
  }
  return { ok: false, errorCode: fallback, error: "Não consegui registrar agora. Tente de novo.", status: 500, pgCode };
}

/* ------------------------------------------------------------------ */
/* recordActivityOutcome                                               */
/* ------------------------------------------------------------------ */

export async function recordActivityOutcome(
  supabase: SupabaseClient,
  input: RecordActivityOutcomeInput,
  ctx: ActivityOutcomeContext,
): Promise<ActivityOutcomeResult> {
  const { activityId, occurrenceDate, status, userId } = input;

  // ── Validações ───────────────────────────────────────────────────
  if (!activityId || !occurrenceDate || !status || !userId) {
    return { ok: false, errorCode: "missing_fields", error: "activityId, occurrenceDate, status e userId são obrigatórios.", status: 400 };
  }
  if (!VALID_STATUS.has(status)) {
    return { ok: false, errorCode: "invalid_status", error: `status inválido: ${status}.`, status: 400 };
  }
  if (!ISO_DATE.test(occurrenceDate)) {
    return { ok: false, errorCode: "invalid_date", error: "occurrenceDate deve ser YYYY-MM-DD.", status: 400 };
  }

  // ── Resolve group_id (necessário pro insert em activity_reports + gate) ──
  const { data: act } = await supabase
    .from("child_activities")
    .select("group_id")
    .eq("id", activityId)
    .maybeSingle();
  if (!act) {
    return { ok: false, errorCode: "not_found", error: "Atividade não encontrada.", status: 404 };
  }
  const groupId = (act as { group_id: string }).group_id;

  if (ctx.enforceMembership) {
    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return { ok: false, errorCode: "permission_denied", error: "Você não faz parte do grupo dessa atividade.", status: 403 };
    }
  }

  const fail = (error: { code?: string; message?: string; details?: string | null; hint?: string | null }, op: string) => {
    const failure = mapPgError(error);
    void reportServerError(new Error(error.message || `activity_outcome_${op}_failed`), {
      filePath: ctx.callerPath,
      severity: "error",
      userId,
      metadata: { op, activityId, occurrenceDate, status, pgCode: error.code, pgDetails: error.details, pgHint: error.hint, mappedCode: failure.errorCode },
    });
    return failure;
  };

  // ── 'snoozed' → activity_followup_snoozes ────────────────────────
  if (status === "snoozed") {
    const snoozeUntil = new Date(
      Date.now() + (input.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES) * 60_000,
    ).toISOString();
    const { error } = await supabase
      .from("activity_followup_snoozes")
      .upsert(
        { activity_id: activityId, occurrence_date: occurrenceDate, snooze_until: snoozeUntil, snoozed_by: userId },
        { onConflict: "activity_id,occurrence_date" },
      );
    if (error) return fail(error, "snooze");
    captureServerEvent(userId, "activity_outcome_recorded", {
      activity_id: activityId, occurrence_date: occurrenceDate, status: "snoozed", via: ctx.via ?? null,
    });
    return { ok: true, data: { activityId, occurrenceDate, status, snoozeUntil } };
  }

  // ── 'happened'/'missed' → activity_reports (preserva notes/child_mood) ──
  const reportStatus = REPORT_STATUS[status];
  const { data: existing } = await supabase
    .from("activity_reports")
    .select("id")
    .eq("activity_id", activityId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  if (existing) {
    // Só status + reported_by — NÃO toca notes/child_mood já preenchidos.
    const { error } = await supabase
      .from("activity_reports")
      .update({ status: reportStatus, reported_by: userId })
      .eq("id", (existing as { id: string }).id);
    if (error) return fail(error, "report_update");
  } else {
    const { error } = await supabase
      .from("activity_reports")
      .insert({ group_id: groupId, activity_id: activityId, occurrence_date: occurrenceDate, reported_by: userId, status: reportStatus });
    if (error) return fail(error, "report_insert");
  }

  captureServerEvent(userId, "activity_outcome_recorded", {
    activity_id: activityId, occurrence_date: occurrenceDate, status: reportStatus, via: ctx.via ?? null,
  });
  return { ok: true, data: { activityId, occurrenceDate, status, snoozeUntil: null } };
}
