/* ------------------------------------------------------------------ */
/* Dedupe L1 por CONTEÚDO (intake-dedupe) — decisão pura do reenvio:     */
/* mesmo arquivo/foto/texto de novo (mesma pessoa, coparente ou retry)   */
/* nunca vira registro duplicado; reuso conservador (dado faltando →     */
/* proceed, porque reanalisar é seguro e duplicar não é).                */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  computeSourceSha256,
  resolvePriorIntakeAction,
  isUniqueViolation,
  IN_FLIGHT_STALE_MS,
  type PriorIntakeRow,
} from "@/lib/ai/brain/intake-dedupe";

const NOW = Date.parse("2026-07-02T12:00:00Z");

function prior(over: Partial<PriorIntakeRow> = {}): PriorIntakeRow {
  return {
    id: "prior-1",
    status: "awaiting_confirmation",
    created_at: "2026-07-02T11:59:00Z",
    confirmation_expires_at: "2026-07-02T13:00:00Z",
    plan: { docType: "health_visit", confirmation: "single", activities: [] },
    plan_hash: "hash-1",
    confirmation_token: "tok-1",
    doc_type: "health_visit",
    impacts: [],
    ...over,
  };
}

describe("computeSourceSha256 — hash canônico do conteúdo", () => {
  it("texto igual → hash igual; texto diferente → hash diferente", () => {
    expect(computeSourceSha256("mesma mensagem")).toBe(computeSourceSha256("mesma mensagem"));
    expect(computeSourceSha256("mensagem A")).not.toBe(computeSourceSha256("mensagem B"));
  });
  it("buffer e texto com os mesmos bytes → mesmo hash (foto reenviada)", () => {
    expect(computeSourceSha256(Buffer.from("conteudo"))).toBe(computeSourceSha256("conteudo"));
  });
});

describe("resolvePriorIntakeAction — o que fazer com o reenvio", () => {
  it("sem anterior → proceed", () => {
    expect(resolvePriorIntakeAction(null, NOW)).toEqual({ action: "proceed" });
  });

  it("executado → duplicate (aponta o registro existente, sem IA)", () => {
    const p = prior({ status: "executed" });
    expect(resolvePriorIntakeAction(p, NOW)).toEqual({ action: "duplicate", prior: p });
  });

  it("aguardando confirmação e válido → reuse_preview (mesma prévia/botões)", () => {
    const p = prior();
    expect(resolvePriorIntakeAction(p, NOW)).toEqual({ action: "reuse_preview", prior: p });
  });

  it("aguardando mas confirmação VENCIDA → proceed (reanalisa)", () => {
    const p = prior({ confirmation_expires_at: "2026-07-02T11:00:00Z" });
    expect(resolvePriorIntakeAction(p, NOW).action).toBe("proceed");
  });

  it.each([
    ["plan", { plan: null }],
    ["plan_hash", { plan_hash: null }],
    ["confirmation_token", { confirmation_token: "" }],
    ["confirmation_expires_at", { confirmation_expires_at: null }],
  ] as const)("aguardando sem %s → proceed (reuso conservador)", (_campo, over) => {
    expect(resolvePriorIntakeAction(prior(over as Partial<PriorIntakeRow>), NOW).action).toBe("proceed");
  });

  it.each(["uploaded", "analyzing"] as const)("%s fresco → in_flight (duplo toque/coparente simultâneo)", (status) => {
    const p = prior({ status, created_at: new Date(NOW - 30_000).toISOString() });
    expect(resolvePriorIntakeAction(p, NOW)).toEqual({ action: "in_flight", prior: p });
  });

  it("em voo MORTO (mais velho que o stale) → proceed (reenvio legítimo destrava)", () => {
    const p = prior({ status: "analyzing", created_at: new Date(NOW - IN_FLIGHT_STALE_MS - 1000).toISOString() });
    expect(resolvePriorIntakeAction(p, NOW).action).toBe("proceed");
  });

  it.each(["failed", "undone", "expired"] as const)("%s → proceed (desfazer/reenviar continua funcionando)", (status) => {
    expect(resolvePriorIntakeAction(prior({ status }), NOW).action).toBe("proceed");
  });
});

describe("isUniqueViolation — corrida fechada no banco", () => {
  it("23505 → true; outros/null → false", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "22P02" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
