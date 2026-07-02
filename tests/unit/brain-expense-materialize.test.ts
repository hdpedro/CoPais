/* ------------------------------------------------------------------ */
/* Fatia E2 (Fase 2): materialização de DESPESAS — payloads canônicos   */
/* (hash estável p/ undo por proveniência), validação defensiva pré-RPC */
/* e outbox de coordenação com total. A RPC (00141, NÃO aplicada) é o   */
/* espelho SQL destes shapes.                                           */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  buildExpensePayloads,
  buildExpenseOutboxPayloads,
  expensePayloadHash,
} from "@/lib/ai/brain/materialize-expense-payload";
import { validateExpensePlanForExecution } from "@/lib/ai/brain/validate-expense-plan";
import type { ExpensePlan } from "@/lib/ai/brain/types";

const PLAN: ExpensePlan = {
  items: [
    { description: "Consulta pediatra", amount: 250, category: "health", childId: "11111111-1111-4111-8111-111111111111", expenseDate: "2026-07-01", splitHint: "default" },
    { description: "Remédio", amount: 89.9, category: "health", childId: null, expenseDate: "2026-07-02", splitHint: null },
  ],
};

describe("buildExpensePayloads — snake_case + hash canônico", () => {
  it("shapes e hash estável (mesma entrada → mesmo hash)", () => {
    const [a, b] = buildExpensePayloads(PLAN);
    expect(a).toMatchObject({ child_id: "11111111-1111-4111-8111-111111111111", category: "health", amount: 250, expense_date: "2026-07-01" });
    expect(b.child_id).toBeNull();
    expect(a.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.payload_hash).toBe(
      expensePayloadHash({ childId: PLAN.items[0].childId, category: "health", description: "Consulta pediatra", amount: 250, expenseDate: "2026-07-01" }),
    );
    expect(a.payload_hash).not.toBe(b.payload_hash);
  });
});

describe("buildExpenseOutboxPayloads — coordenação por destinatário", () => {
  it("1 linha por destinatário, dedupe_key estável, total no payload", () => {
    const rows = buildExpenseOutboxPayloads({ intakeId: "i1", recipientIds: ["r1", "r2"], count: 2, totalAmount: 339.9 });
    expect(rows).toHaveLength(2);
    expect(rows[0].event_type).toBe("collab_notify");
    expect(rows[0].payload).toMatchObject({ kind: "expense", intake_id: "i1", recipient_id: "r1", count: 2, total_amount: 339.9 });
    expect(rows[0].dedupe_key).not.toBe(rows[1].dedupe_key);
  });
});

describe("validateExpensePlanForExecution — defensiva pré-RPC", () => {
  it("plano válido passa", () => {
    expect(validateExpensePlanForExecution(PLAN)).toEqual({ ok: true });
  });

  it.each([
    ["empty_plan", { items: [] }],
    ["bad_amount", { items: [{ ...PLAN.items[0], amount: 0 }] }],
    ["bad_amount", { items: [{ ...PLAN.items[0], amount: 999_999 }] }],
    ["bad_category", { items: [{ ...PLAN.items[0], category: "crypto" }] }],
    ["bad_child", { items: [{ ...PLAN.items[0], childId: "not-a-uuid" }] }],
    ["bad_date", { items: [{ ...PLAN.items[0], expenseDate: "01/07/2026" }] }],
    ["bad_description", { items: [{ ...PLAN.items[0], description: "" }] }],
  ] as Array<[string, ExpensePlan]>)("rejeita %s", (reason, plan) => {
    expect(validateExpensePlanForExecution(plan)).toEqual({ ok: false, reason });
  });

  it("MAX 5 itens", () => {
    const many: ExpensePlan = { items: Array.from({ length: 6 }, () => ({ ...PLAN.items[1] })) };
    expect(validateExpensePlanForExecution(many)).toEqual({ ok: false, reason: "too_many_items" });
  });
});
