/* ------------------------------------------------------------------ */
/* whatsapp-session-timeouts — guards de fluxo pendente (puros)         */
/*                                                                     */
/* Prova que o fluxo de recibo (receipt_step) agora respeita o mesmo   */
/* timeout dos fluxos do Brain — um toque em lista antiga (rcat:/       */
/* rchild:) fora da janela NÃO reabre um rascunho velho. task_7c05baad. */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { hasReceiptStep, type WASession } from "@/lib/whatsapp/session";
import type { WASessionState } from "@/lib/whatsapp/types";

const THIRTY_MIN_MS = 30 * 60 * 1000;

function session(state: WASessionState): WASession {
  return {
    id: "s1",
    phone_number: "+5511999999999",
    user_id: "u1",
    group_id: "g1",
    state,
    last_message_at: new Date().toISOString(),
    message_count: 1,
  };
}

const draft = { description: "Farmácia", amount: 50, expense_date: "2026-07-01" };

describe("hasReceiptStep — fluxo de recibo respeita o timeout", () => {
  it("receipt_step fresco (pending_at agora) → true", () => {
    expect(
      hasReceiptStep(session({ receipt_step: "category", receipt_draft: draft, pending_at: new Date().toISOString() })),
    ).toBe(true);
  });

  it("receipt_step vencido (> 30min) → false (não reabre rascunho velho)", () => {
    const stale = new Date(Date.now() - THIRTY_MIN_MS - 1000).toISOString();
    expect(
      hasReceiptStep(session({ receipt_step: "child", receipt_draft: draft, pending_at: stale })),
    ).toBe(false);
  });

  it("sem receipt_step → false", () => {
    expect(hasReceiptStep(session({ pending_at: new Date().toISOString() }))).toBe(false);
  });

  it("receipt_step presente mas sem pending_at → false (defensivo)", () => {
    expect(hasReceiptStep(session({ receipt_step: "category", receipt_draft: draft }))).toBe(false);
  });
});
