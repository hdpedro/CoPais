/* ------------------------------------------------------------------ */
/* validate-expense-plan.ts — revalidação defensiva pré-RPC (despesas)  */
/*                                                                      */
/* Espelho do validate-custody-plan: o parse já validou na análise, mas */
/* o plano fica salvo e só materializa DEPOIS (confirmação). Revalida   */
/* limites imediatamente antes da RPC — plano velho/adulterado nunca    */
/* vira INSERT. PURO (sem I/O).                                         */
/* ------------------------------------------------------------------ */

import type { ExpensePlan } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = new Set([
  "education", "health", "food", "clothing",
  "transport", "leisure", "housing", "other",
]);
const MAX_ITEMS = 5;
const MAX_AMOUNT = 100_000;

export type ExpenseValidation = { ok: true } | { ok: false; reason: string };

export function validateExpensePlanForExecution(plan: ExpensePlan | undefined): ExpenseValidation {
  if (!plan || !Array.isArray(plan.items) || plan.items.length === 0) {
    return { ok: false, reason: "empty_plan" };
  }
  if (plan.items.length > MAX_ITEMS) return { ok: false, reason: "too_many_items" };

  for (const it of plan.items) {
    if (typeof it.description !== "string" || !it.description.trim() || it.description.length > 140) {
      return { ok: false, reason: "bad_description" };
    }
    if (typeof it.amount !== "number" || !Number.isFinite(it.amount) || it.amount <= 0 || it.amount > MAX_AMOUNT) {
      return { ok: false, reason: "bad_amount" };
    }
    if (!CATEGORIES.has(it.category)) return { ok: false, reason: "bad_category" };
    if (it.childId !== null && !UUID.test(it.childId)) return { ok: false, reason: "bad_child" };
    if (!ISO_DATE.test(it.expenseDate)) return { ok: false, reason: "bad_date" };
  }
  return { ok: true };
}
