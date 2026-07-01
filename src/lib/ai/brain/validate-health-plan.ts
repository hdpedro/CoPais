/* ------------------------------------------------------------------ */
/* validate-health-plan.ts — limites & revalidação da consulta (PURO)   */
/*                                                                      */
/* Roda no serviço ANTES da RPC brain_intake_execute_health_plan: rejeita */
/* entrada malformada (UUID/data inválida, campos obrigatórios) com erro  */
/* claro, em vez de derrubar a transação por cast/constraint. Espelha     */
/* validate-plan.ts (escolar). Determinístico — `today` entra como dado.  */
/* ------------------------------------------------------------------ */

import type { MaterializationPlan } from "./types";
import { isParseableIsoDate, isWithinHorizon } from "./confidence";

/** Teto de medicações por consulta. */
export const MAX_MEDICATIONS_PER_VISIT = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const APPOINTMENT_TYPES = new Set(["rotina", "emergencia", "retorno", "exame"]);
const CARE_TYPES = new Set(["medication", "treatment", "procedure"]);
const SEVERITIES = new Set(["leve", "moderado", "grave"]);

export interface HealthPlanValidationError {
  /** entidade: appointment | episode | medication[i] | plan */
  entity: string;
  field: string;
  reason: string;
}

export interface HealthPlanValidation {
  ok: boolean;
  errors: HealthPlanValidationError[];
}

function checkChild(childId: string | null, entity: string, errors: HealthPlanValidationError[]): void {
  if (childId == null) errors.push({ entity, field: "childId", reason: "missing" });
  else if (!UUID_RE.test(childId)) errors.push({ entity, field: "childId", reason: "invalid_uuid" });
}

function checkDate(
  value: string | null | undefined,
  entity: string,
  field: string,
  today: string,
  errors: HealthPlanValidationError[],
  required: boolean,
): void {
  if (value == null || value === "") {
    if (required) errors.push({ entity, field, reason: "missing" });
    return;
  }
  if (!isParseableIsoDate(value)) errors.push({ entity, field, reason: "invalid_date" });
  else if (!isWithinHorizon(value, today)) errors.push({ entity, field, reason: "out_of_horizon" });
}

/**
 * Valida o plano de saúde antes da materialização:
 *  - plan.health presente; appointment obrigatório;
 *  - childId UUID em appointment/episode/medications;
 *  - datas (consulta, retorno, início/fim de medicação) ISO + dentro do
 *    horizonte [today-7d, today+548d] — retorno pode ser futuro (548d cobre);
 *  - enums (appointment_type/care_type/severity) válidos;
 *  - ≤ MAX_MEDICATIONS medicações; cada uma com name.
 * NÃO exige dose/frequência (transportador: null vira "Conforme prescrição").
 */
export function validateHealthPlanForExecution(
  plan: MaterializationPlan,
  today: string,
): HealthPlanValidation {
  const errors: HealthPlanValidationError[] = [];
  const h = plan.health;
  if (!h) {
    return { ok: false, errors: [{ entity: "plan", field: "health", reason: "missing" }] };
  }

  // Consulta (obrigatória)
  const a = h.appointment;
  if (!a) {
    errors.push({ entity: "appointment", field: "appointment", reason: "missing" });
  } else {
    checkChild(a.childId, "appointment", errors);
    if (!a.title || a.title.trim() === "") errors.push({ entity: "appointment", field: "title", reason: "missing" });
    if (!APPOINTMENT_TYPES.has(a.appointmentType)) {
      errors.push({ entity: "appointment", field: "appointmentType", reason: "invalid_enum" });
    }
    checkDate(a.date, "appointment", "date", today, errors, true);
    if (a.timeStart != null && a.timeStart !== "" && !TIME_RE.test(a.timeStart)) {
      errors.push({ entity: "appointment", field: "timeStart", reason: "invalid_time" });
    }
  }

  // Retorno (opcional; se houver, data válida e no horizonte)
  if (h.followUp) {
    checkDate(h.followUp.date, "appointment", "returnDate", today, errors, true);
  }

  // Episódio (opcional)
  if (h.episode) {
    checkChild(h.episode.childId, "episode", errors);
    if (!h.episode.title || h.episode.title.trim() === "") {
      errors.push({ entity: "episode", field: "title", reason: "missing" });
    }
    checkDate(h.episode.startDate, "episode", "startDate", today, errors, true);
    if (h.episode.severity != null && !SEVERITIES.has(h.episode.severity)) {
      errors.push({ entity: "episode", field: "severity", reason: "invalid_enum" });
    }
  }

  // Medicações
  const meds = h.medications ?? [];
  if (meds.length > MAX_MEDICATIONS_PER_VISIT) {
    errors.push({ entity: "medication", field: "medications", reason: `exceeds_max_${MAX_MEDICATIONS_PER_VISIT}` });
  }
  meds.forEach((m, i) => {
    const entity = `medication[${i}]`;
    if (!m.name || m.name.trim() === "") errors.push({ entity, field: "name", reason: "missing" });
    checkChild(m.childId, entity, errors);
    if (!CARE_TYPES.has(m.careType)) errors.push({ entity, field: "careType", reason: "invalid_enum" });
    checkDate(m.startDate, entity, "startDate", today, errors, true);
    checkDate(m.endDate, entity, "endDate", today, errors, false);
  });

  return { ok: errors.length === 0, errors };
}
