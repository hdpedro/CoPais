import { describe, it, expect } from "vitest";
import {
  getConfidencePolicy,
  composeConfidence,
  assessFieldConfidence,
  isParseableIsoDate,
  isYearCoherent,
  isWithinHorizon,
  type ConfidenceSignal,
} from "@/lib/ai/brain/confidence";

describe("getConfidencePolicy — faixas", () => {
  it("≥0.8 high · ≥0.6 medium · <0.6 low", () => {
    expect(getConfidencePolicy(0.95)).toBe("high");
    expect(getConfidencePolicy(0.8)).toBe("high");
    expect(getConfidencePolicy(0.79)).toBe("medium");
    expect(getConfidencePolicy(0.6)).toBe("medium");
    expect(getConfidencePolicy(0.59)).toBe("low");
    expect(getConfidencePolicy(0)).toBe("low");
  });
});

describe("composeConfidence — LLM + validações determinísticas", () => {
  it("sinal HARD falho força low mesmo com LLM 0.9 (não confiar no autorrelato)", () => {
    const signals: ConfidenceSignal[] = [{ id: "date_parseable", pass: false, weight: 1, hard: true }];
    const score = composeConfidence(0.9, signals);
    expect(score).toBeLessThanOrEqual(0.3);
    expect(getConfidencePolicy(score)).toBe("low");
  });

  it("sinais soft falhos reduzem proporcional ao weight", () => {
    const signals: ConfidenceSignal[] = [{ id: "legible", pass: false, weight: 0.5 }];
    expect(composeConfidence(0.9, signals)).toBeCloseTo(0.45, 5);
  });

  it("todos os sinais passam → mantém a estimativa do LLM", () => {
    const signals: ConfidenceSignal[] = [
      { id: "date_parseable", pass: true, weight: 1, hard: true },
      { id: "legible", pass: true, weight: 0.5 },
    ];
    expect(composeConfidence(0.85, signals)).toBeCloseTo(0.85, 5);
  });

  it("cenário verificação #4: data 2023 sem contexto escolar → baixa apesar de LLM 0.9", () => {
    // O modelo se diz confiante, mas o ano não bate com o ano letivo (hard).
    const yearCoherent = isYearCoherent("2023-08-12", 2026);
    expect(yearCoherent).toBe(false);
    const signals: ConfidenceSignal[] = [{ id: "year_coherent", pass: yearCoherent, weight: 1, hard: true }];
    const { level } = assessFieldConfidence(0.9, signals);
    expect(level).toBe("low");
  });
});

describe("validadores determinísticos", () => {
  it("isParseableIsoDate rejeita datas irreais", () => {
    expect(isParseableIsoDate("2026-08-12")).toBe(true);
    expect(isParseableIsoDate("2026-02-31")).toBe(false);
    expect(isParseableIsoDate("12/08/2026")).toBe(false);
    expect(isParseableIsoDate(null)).toBe(false);
  });

  it("isYearCoherent aceita ano letivo e o próximo", () => {
    expect(isYearCoherent("2026-08-12", 2026)).toBe(true);
    expect(isYearCoherent("2027-02-10", 2026)).toBe(true);
    expect(isYearCoherent("2023-08-12", 2026)).toBe(false);
  });

  it("isWithinHorizon respeita passado/futuro", () => {
    expect(isWithinHorizon("2026-07-16", "2026-06-28")).toBe(true);
    expect(isWithinHorizon("2020-01-01", "2026-06-28")).toBe(false);
    expect(isWithinHorizon("2030-01-01", "2026-06-28")).toBe(false);
  });
});
