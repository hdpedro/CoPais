/* ------------------------------------------------------------------ */
/* validate-invite-plan.ts — revalidação defensiva pré-RPC (convites)   */
/*                                                                      */
/* Espelho dos demais validates: o parse validou na análise, mas o      */
/* plano só materializa DEPOIS (confirmação) — revalida limites antes   */
/* da RPC. PURO (sem I/O).                                              */
/* ------------------------------------------------------------------ */

import type { EventInvitePlan } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MULTIDAY_SPAN = 14;

export type InviteValidation = { ok: true } | { ok: false; reason: string };

function spanDays(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T12:00:00Z").getTime();
  const b = new Date(bIso + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function validateInvitePlanForExecution(plan: EventInvitePlan | undefined): InviteValidation {
  if (!plan) return { ok: false, reason: "empty_plan" };
  if (typeof plan.title !== "string" || !plan.title.trim() || plan.title.length > 120) {
    return { ok: false, reason: "bad_title" };
  }
  if (!ISO_DATE.test(plan.eventDate)) return { ok: false, reason: "bad_date" };
  if (plan.endDate !== null) {
    if (!ISO_DATE.test(plan.endDate)) return { ok: false, reason: "bad_end_date" };
    const span = spanDays(plan.eventDate, plan.endDate);
    if (span < 2 || span > MAX_MULTIDAY_SPAN) return { ok: false, reason: "bad_span" };
  }
  if (plan.timeStart !== null && !HHMM.test(plan.timeStart)) return { ok: false, reason: "bad_time" };
  if (plan.timeEnd !== null && (plan.timeStart === null || !HHMM.test(plan.timeEnd))) {
    return { ok: false, reason: "bad_time" };
  }
  if (plan.childId !== null && !UUID.test(plan.childId)) return { ok: false, reason: "bad_child" };
  if (plan.location !== null && plan.location.length > 200) return { ok: false, reason: "bad_location" };
  if (plan.description !== null && plan.description.length > 600) return { ok: false, reason: "bad_description" };
  return { ok: true };
}
