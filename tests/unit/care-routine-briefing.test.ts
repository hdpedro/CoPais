/**
 * Testes do núcleo puro do briefing noturno (care-routine-briefing-core.ts):
 * janela de 20h BRT, data de amanhã, furo de cobertura, ordenação.
 */

import { describe, it, expect } from "vitest";
import {
  isBriefingEveningSlot,
  tomorrowKeyBrazil,
  hasCoverageGap,
  sortBriefingActivities,
  type BriefingActivity,
} from "@/lib/services/care-routine-briefing-core";

describe("isBriefingEveningSlot (20:00–20:14 BRT)", () => {
  it("20:00 BRT (23:00 UTC) → true", () => {
    expect(isBriefingEveningSlot(new Date("2026-06-08T23:00:00Z"))).toBe(true);
  });
  it("20:14 BRT → true", () => {
    expect(isBriefingEveningSlot(new Date("2026-06-08T23:14:00Z"))).toBe(true);
  });
  it("20:15 BRT → false (fora da janela)", () => {
    expect(isBriefingEveningSlot(new Date("2026-06-08T23:15:00Z"))).toBe(false);
  });
  it("19:59 BRT → false", () => {
    expect(isBriefingEveningSlot(new Date("2026-06-08T22:59:00Z"))).toBe(false);
  });
  it("08:00 BRT (manhã) → false", () => {
    expect(isBriefingEveningSlot(new Date("2026-06-08T11:00:00Z"))).toBe(false);
  });
});

describe("tomorrowKeyBrazil", () => {
  it("20:00 BRT de 08/jun → amanhã = 09/jun", () => {
    expect(tomorrowKeyBrazil(new Date("2026-06-08T23:00:00Z"))).toBe("2026-06-09");
  });
  it("madrugada UTC (23h BRT do dia anterior) resolve amanhã certo", () => {
    // 02:00 UTC 09/jun = 23:00 BRT 08/jun → amanhã = 09/jun
    expect(tomorrowKeyBrazil(new Date("2026-06-09T02:00:00Z"))).toBe("2026-06-09");
  });
});

describe("hasCoverageGap (furo de cobertura)", () => {
  const act = (time: string | null): BriefingActivity => ({ name: "Jiu-Jitsu", time });
  it("atividade com horário + sem busca → furo", () => {
    expect(hasCoverageGap(null, [act("18:00")])).toBe(true);
  });
  it("tem busca marcada → sem furo", () => {
    expect(hasCoverageGap("Henrique", [act("18:00")])).toBe(false);
  });
  it("sem atividade → sem furo", () => {
    expect(hasCoverageGap(null, [])).toBe(false);
  });
  it("atividade sem horário não dispara furo (conservador)", () => {
    expect(hasCoverageGap(null, [act(null)])).toBe(false);
  });
});

describe("sortBriefingActivities", () => {
  it("ordena por horário; sem horário vai pro fim", () => {
    const out = sortBriefingActivities([
      { name: "B", time: "18:00" },
      { name: "Sem hora", time: null },
      { name: "A", time: "08:00" },
    ]);
    expect(out.map((a) => a.name)).toEqual(["A", "B", "Sem hora"]);
  });
  it("não muta o array original", () => {
    const orig: BriefingActivity[] = [{ name: "X", time: "10:00" }];
    sortBriefingActivities(orig);
    expect(orig).toHaveLength(1);
  });
});
