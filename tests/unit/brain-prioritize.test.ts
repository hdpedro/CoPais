import { describe, it, expect } from "vitest";
import { prioritize } from "@/lib/ai/brain/prioritize";
import type { ActivitySpec, MaterializationPlan } from "@/lib/ai/brain/types";

const TODAY = "2026-06-30";

function planWithDates(dates: string[]): MaterializationPlan {
  const activities: ActivitySpec[] = dates.map((d, i) => ({
    childId: "11111111-1111-1111-1111-111111111111",
    name: `Prova ${i}`,
    category: "school",
    startDate: d,
  }));
  return { docType: "school_calendar", confirmation: "single", activities };
}

describe("prioritize — distância objetiva até a ação mais próxima", () => {
  it("hoje (<24h) → important + immediate", () => {
    expect(prioritize(planWithDates([TODAY]), TODAY)).toEqual({
      level: "important",
      delivery: "immediate",
    });
  });

  it("amanhã (1 dia) → important + digest", () => {
    expect(prioritize(planWithDates(["2026-07-01"]), TODAY)).toEqual({
      level: "important",
      delivery: "digest",
    });
  });

  it("em 3 dias (fronteira) → important + digest", () => {
    expect(prioritize(planWithDates(["2026-07-03"]), TODAY)).toEqual({
      level: "important",
      delivery: "digest",
    });
  });

  it("em 4 dias (distante) → info + digest", () => {
    expect(prioritize(planWithDates(["2026-07-04"]), TODAY)).toEqual({
      level: "info",
      delivery: "digest",
    });
  });

  it("usa a atividade MAIS PRÓXIMA quando há várias", () => {
    expect(prioritize(planWithDates(["2026-09-01", "2026-07-01", "2026-12-25"]), TODAY)).toEqual({
      level: "important",
      delivery: "digest",
    });
  });

  it("ignora datas passadas (não pautam urgência)", () => {
    // só passado → info/digest
    expect(prioritize(planWithDates(["2026-06-01"]), TODAY)).toEqual({
      level: "info",
      delivery: "digest",
    });
  });

  it("mistura passado + futuro distante → usa o futuro", () => {
    expect(prioritize(planWithDates(["2026-06-01", "2026-08-20"]), TODAY)).toEqual({
      level: "info",
      delivery: "digest",
    });
  });

  it("plano sem atividades → info/digest", () => {
    expect(prioritize({ docType: "school_calendar", confirmation: "single", activities: [] }, TODAY)).toEqual({
      level: "info",
      delivery: "digest",
    });
  });

  it("datas inválidas são ignoradas", () => {
    expect(prioritize(planWithDates(["amanhã", "2026-13-40"]), TODAY)).toEqual({
      level: "info",
      delivery: "digest",
    });
  });

  it("nunca devolve 'urgent' no A0 (adiado)", () => {
    const cases = ["2026-06-30", "2026-07-01", "2026-07-15", "2027-01-01"];
    for (const d of cases) {
      expect(prioritize(planWithDates([d]), TODAY).level).not.toBe("urgent");
    }
  });
});
