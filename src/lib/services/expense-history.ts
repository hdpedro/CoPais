/**
 * Expense History — Audit trail helper
 *
 * Pequena camada de conveniência sobre a tabela `expense_history`
 * (migration 00078). Usada pelo service `expenses.ts` em todos os
 * pontos de mutação pra registrar quem fez o quê.
 *
 * Imutabilidade: a tabela tem RLS sem UPDATE/DELETE policies. Eventos
 * só podem ser INSERTED, nunca modificados. Esse helper só expõe
 * `logExpenseHistory` (não há `update*` ou `delete*`).
 *
 * Convenções de payload:
 *   - 'created': only `after`
 *   - 'edited': both `before` and `after` (snapshots dos campos editáveis)
 *   - 'approved' / 'rejected': sem snapshots (status muda; texto via reason)
 *   - 'cancel_requested' / 'cancelled' / 'reopened': `reason` obrigatório
 *   - 'restored' (cancel rejeitado pelo reviewer): `reason` obrigatório
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpenseHistoryAction =
  | "created"
  | "edited"
  | "approved"
  | "rejected"
  | "cancel_requested"
  | "cancelled"
  | "reopened"
  | "restored";

/** Snapshot do estado de uma despesa pros campos que podem ser editados.
 *  Reuso: before/after têm o mesmo shape, comparável field-by-field na UI. */
export interface ExpenseSnapshot {
  description?: string;
  amount?: number;
  category?: string;
  expense_date?: string;
  child_id?: string | null;
  priority?: string;
}

interface LogExpenseHistoryArgs {
  supabase: SupabaseClient;
  expenseId: string;
  actorId: string;
  action: ExpenseHistoryAction;
  before?: ExpenseSnapshot | null;
  after?: ExpenseSnapshot | null;
  reason?: string | null;
}

/**
 * Insere uma linha em `expense_history`. Falha silenciosa: audit é
 * defesa-em-profundidade, nunca deve bloquear a ação principal
 * (igual contrato do `notifyCollabCreate`). Logs vão pro console
 * em desenvolvimento pra debug.
 */
export async function logExpenseHistory(args: LogExpenseHistoryArgs): Promise<void> {
  try {
    const { error } = await args.supabase.from("expense_history").insert({
      expense_id: args.expenseId,
      actor_id: args.actorId,
      action: args.action,
      before: args.before ?? null,
      after: args.after ?? null,
      reason: args.reason ?? null,
    });
    if (error) {
      console.warn("[expense-history] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[expense-history] insert threw:", err);
  }
}
