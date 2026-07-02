/* ------------------------------------------------------------------ */
/* materialize-expense-payload.ts — plano de despesas → payloads RPC    */
/*                                                                      */
/* PURO/determinístico (sem I/O), espelho do materialize-custody:       */
/* cada item vira payload snake_case + payload_hash canônico (base do   */
/* undo por proveniência). A materialização escreve na tabela expenses  */
/* EXISTENTE: paid_by = quem confirmou, status 'pending' (o fluxo de    */
/* aprovação do módulo segue normal), split = PADRÃO do grupo (schema   */
/* default) — o splitHint da narrativa é informativo e o preview        */
/* declara isso com honestidade.                                        */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";
import { canonicalize } from "./plan-hash";
import { outboxDedupeKey } from "./dedupe";
import type { ExpensePlan } from "./types";

function sha256(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface ExpensePayload {
  child_id: string | null;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  payload_hash: string;
}

export function expensePayloadHash(input: {
  childId: string | null;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
}): string {
  return sha256(
    canonicalize({
      amount: input.amount,
      category: input.category,
      childId: input.childId,
      description: input.description,
      expenseDate: input.expenseDate,
    }),
  );
}

export function buildExpensePayloads(plan: ExpensePlan): ExpensePayload[] {
  return plan.items.map((it) => ({
    child_id: it.childId,
    category: it.category,
    description: it.description,
    amount: it.amount,
    expense_date: it.expenseDate,
    payload_hash: expensePayloadHash({
      childId: it.childId,
      category: it.category,
      description: it.description,
      amount: it.amount,
      expenseDate: it.expenseDate,
    }),
  }));
}

/* ---- Coordenação (outbox): "Henrique registrou R$ 250 — consulta" ---- */

export interface ExpenseOutboxPayload {
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

export function buildExpenseOutboxPayloads(args: {
  intakeId: string;
  recipientIds: string[];
  count: number;
  totalAmount: number;
}): ExpenseOutboxPayload[] {
  return args.recipientIds.map((recipientId) => ({
    event_type: "collab_notify",
    dedupe_key: outboxDedupeKey(args.intakeId, "collab_notify", recipientId),
    payload: {
      kind: "expense",
      intake_id: args.intakeId,
      recipient_id: recipientId,
      count: args.count,
      total_amount: args.totalAmount,
    },
  }));
}
