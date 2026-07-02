/* ------------------------------------------------------------------ */
/* validate-custody-plan.ts — validação DEFENSIVA antes da RPC          */
/*                                                                      */
/* Espelha validate-health-plan: o parse do playbook já validou, mas o  */
/* plano fica persistido (JSONB) entre a prévia e o confirmar — esta    */
/* checagem roda no confirmIntake, imediatamente antes de montar os     */
/* payloads. Rejeita ANTES de tocar o banco. PURO.                      */
/* ------------------------------------------------------------------ */

import { isParseableIsoDate } from "./confidence";
import type { CustodyRoutinePlan } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LEGS = ["dropoff", "pickup"] as const;
const MAX_ITEMS = 10;

export interface CustodyPlanValidation {
  ok: boolean;
  reason?: string;
}

function validIso(s: unknown): s is string {
  return typeof s === "string" && isParseableIsoDate(s);
}

function validMember(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

function validChildIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= 10 && ids.every((c) => validMember(c));
}

export function validateCustodyPlanForExecution(plan: CustodyRoutinePlan | undefined | null): CustodyPlanValidation {
  if (!plan || !Array.isArray(plan.items) || plan.items.length === 0) {
    return { ok: false, reason: "empty_plan" };
  }
  if (plan.items.length > MAX_ITEMS) return { ok: false, reason: "too_many_items" };

  for (const item of plan.items) {
    switch (item.kind) {
      case "custody_exception": {
        if (!validChildIds(item.childIds)) return { ok: false, reason: "exception_children" };
        if (!validIso(item.startDate) || !validIso(item.endDate) || item.startDate > item.endDate)
          return { ok: false, reason: "exception_dates" };
        if (!validMember(item.responsible.memberId)) return { ok: false, reason: "exception_responsible" };
        break;
      }
      case "vacation": {
        if (item.childIds !== null && !validChildIds(item.childIds)) return { ok: false, reason: "vacation_children" };
        if (!validIso(item.startDate) || !validIso(item.endDate) || item.startDate > item.endDate)
          return { ok: false, reason: "vacation_dates" };
        if (!validMember(item.responsible.memberId)) return { ok: false, reason: "vacation_responsible" };
        break;
      }
      case "swap_proposal": {
        if (!validIso(item.originalDate)) return { ok: false, reason: "swap_original_date" };
        if (item.proposedDate !== null && !validIso(item.proposedDate)) return { ok: false, reason: "swap_proposed_date" };
        if (!validMember(item.counterpart.memberId)) return { ok: false, reason: "swap_counterpart" };
        break;
      }
      case "leg_override": {
        if (!validChildIds(item.childIds)) return { ok: false, reason: "override_children" };
        if (!validIso(item.date)) return { ok: false, reason: "override_date" };
        if (!(LEGS as readonly string[]).includes(item.leg)) return { ok: false, reason: "override_leg" };
        // Externo permitido (memberId null) — o payload resolve pro narrador.
        if (item.responsible.memberId !== null && !validMember(item.responsible.memberId))
          return { ok: false, reason: "override_responsible" };
        if (item.time !== null && !TIME_RE.test(item.time)) return { ok: false, reason: "override_time" };
        break;
      }
      case "slot_change": {
        if (!validChildIds(item.childIds)) return { ok: false, reason: "slot_children" };
        if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6)
          return { ok: false, reason: "slot_weekday" };
        if (!(LEGS as readonly string[]).includes(item.leg)) return { ok: false, reason: "slot_leg" };
        if (!validMember(item.responsible.memberId)) return { ok: false, reason: "slot_responsible" };
        if (item.time !== null && !TIME_RE.test(item.time)) return { ok: false, reason: "slot_time" };
        break;
      }
      default:
        return { ok: false, reason: "unknown_kind" };
    }
  }
  return { ok: true };
}
