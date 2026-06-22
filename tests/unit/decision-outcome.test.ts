import { describe, it, expect } from "vitest";
import { computeDecisionOutcome } from "@/lib/services/decisions";

/**
 * Regra de quórum das decisões (fonte de verdade compartilhada por
 * resolveDecisionIfReady, closeDecision e api/decisions/vote).
 *
 * Bug reportado 2026-06-22: decisão com 2 participantes aparecia "APROVADA"
 * com participação 1/2 (1 voto a favor, o outro membro nem votou). O
 * encerramento manual aprovava por maioria dos votos LANÇADOS, ignorando
 * quem ainda não votou.
 */

const m = (...ids: string[]) => ids.map((user_id) => ({ user_id }));
const v = (rows: Array<[string, string]>) =>
  rows.map(([user_id, vote]) => ({ user_id, vote }));

describe("computeDecisionOutcome", () => {
  describe("o bug reportado: 2 membros, só 1 votou a favor", () => {
    it("fluxo automático → segue ABERTA (null), nunca aprova", () => {
      const out = computeDecisionOutcome(m("a", "b"), v([["a", "concordo"]]), null);
      expect(out).toBeNull();
    });

    it("encerramento manual → 'expirada' (sem quórum), nunca 'aprovada'", () => {
      const out = computeDecisionOutcome(m("a", "b"), v([["a", "concordo"]]), "expirada");
      expect(out).toBe("expirada");
    });
  });

  describe("aprovação só com TODOS votando concordo", () => {
    it("2 de 2 concordam → aprovada (auto)", () => {
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "concordo"], ["b", "concordo"]]), null),
      ).toBe("aprovada");
    });

    it("2 de 2 concordam → aprovada (encerramento manual)", () => {
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "concordo"], ["b", "concordo"]]), "expirada"),
      ).toBe("aprovada");
    });

    it("3 membros, 2 concordam, 1 não votou → não aprova", () => {
      expect(
        computeDecisionOutcome(m("a", "b", "c"), v([["a", "concordo"], ["b", "concordo"]]), null),
      ).toBeNull();
      expect(
        computeDecisionOutcome(m("a", "b", "c"), v([["a", "concordo"], ["b", "concordo"]]), "expirada"),
      ).toBe("expirada");
    });
  });

  describe("veto: qualquer discordo rejeita sem esperar todos", () => {
    it("1 de 2 vota discordo → rejeitada (auto)", () => {
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "discordo"]]), null),
      ).toBe("rejeitada");
    });

    it("1 concordo + 1 discordo → rejeitada", () => {
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "concordo"], ["b", "discordo"]]), "expirada"),
      ).toBe("rejeitada");
    });
  });

  describe("abstenção não é concordância", () => {
    it("1 concordo + 1 abstencao → não aprova (auto null / manual expirada)", () => {
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "concordo"], ["b", "abstencao"]]), null),
      ).toBeNull();
      expect(
        computeDecisionOutcome(m("a", "b"), v([["a", "concordo"], ["b", "abstencao"]]), "expirada"),
      ).toBe("expirada");
    });
  });

  describe("bordas defensivas", () => {
    it("sem membros e sem votos → nunca aprova (não inventa quórum)", () => {
      expect(computeDecisionOutcome([], [], null)).toBeNull();
      expect(computeDecisionOutcome([], [], "expirada")).toBe("expirada");
    });

    it("sem nenhum voto, 2 membros → não aprova", () => {
      expect(computeDecisionOutcome(m("a", "b"), [], null)).toBeNull();
      expect(computeDecisionOutcome(m("a", "b"), [], "expirada")).toBe("expirada");
    });

    it("decisão de 1 membro só (grupo solo) que concorda → aprovada", () => {
      expect(
        computeDecisionOutcome(m("a"), v([["a", "concordo"]]), null),
      ).toBe("aprovada");
    });
  });
});
