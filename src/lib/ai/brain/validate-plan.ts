/* ------------------------------------------------------------------ */
/* validate-plan.ts — limites & revalidação ANTES de executar (PURO)    */
/*                                                                      */
/* O plano exige limites objetivos e numéricos antes do commit. Este    */
/* validador roda no serviço ANTES de chamar a RPC brain_intake_execute */
/* _plan — assim entrada malformada (data inválida, nome ausente, UUID  */
/* inválido, excesso de itens) é REJEITADA com erro claro, em vez de    */
/* chegar à RPC e derrubar a transação por um cast/constraint (a RPC    */
/* reverte tudo com segurança, mas o erro fica opaco e o intake cicla). */
/* É a camada de app do "server sempre re-valida"; a RPC tem um backstop */
/* mínimo (guard de child_id). Determinístico — `today` entra como dado. */
/* ------------------------------------------------------------------ */

import type { MaterializationPlan } from "./types";
import { isParseableIsoDate, isWithinHorizon } from "./confidence";

/** Teto de atividades por intake (plano: ≤20). */
export const MAX_ACTIVITIES_PER_INTAKE = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface PlanValidationError {
  /** índice da atividade (-1 = erro do plano como um todo). */
  index: number;
  field: string;
  reason: string;
}

export interface PlanValidation {
  ok: boolean;
  errors: PlanValidationError[];
}

/**
 * Valida o plano antes da materialização. Impõe:
 *  - ≤ MAX_ATIVIDADES por intake (e ≥1);
 *  - `name` presente e não-vazio (child_activities.name é NOT NULL);
 *  - `startDate` ISO válida E dentro do horizonte [today-7d, today+548d];
 *  - `childId`, se presente, no formato UUID (evita cast ::uuid lançar);
 *  - `timeStart`, se presente, no formato HH:MM (evita cast ::time lançar).
 */
export function validatePlanForExecution(
  plan: MaterializationPlan,
  today: string,
): PlanValidation {
  const errors: PlanValidationError[] = [];
  const activities = plan.activities ?? [];

  if (activities.length === 0) {
    errors.push({ index: -1, field: "activities", reason: "empty" });
  }
  if (activities.length > MAX_ACTIVITIES_PER_INTAKE) {
    errors.push({ index: -1, field: "activities", reason: `exceeds_max_${MAX_ACTIVITIES_PER_INTAKE}` });
  }

  activities.forEach((a, i) => {
    if (!a.name || a.name.trim() === "") {
      errors.push({ index: i, field: "name", reason: "missing" });
    }
    if (!isParseableIsoDate(a.startDate)) {
      errors.push({ index: i, field: "startDate", reason: "invalid_date" });
    } else if (!isWithinHorizon(a.startDate, today)) {
      errors.push({ index: i, field: "startDate", reason: "out_of_horizon" });
    }
    if (a.childId != null && !UUID_RE.test(a.childId)) {
      errors.push({ index: i, field: "childId", reason: "invalid_uuid" });
    }
    if (a.timeStart != null && a.timeStart !== "" && !TIME_RE.test(a.timeStart)) {
      errors.push({ index: i, field: "timeStart", reason: "invalid_time" });
    }
  });

  return { ok: errors.length === 0, errors };
}
