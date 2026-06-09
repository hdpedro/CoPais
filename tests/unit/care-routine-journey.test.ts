/**
 * Testes da Jornada da Criança (src/lib/care-routine-journey.ts).
 * Composição ordenada casa → leva → atividades → busca → casa.
 */

import { describe, it, expect } from "vitest";
import { buildChildJourney } from "@/lib/care-routine-journey";

describe("buildChildJourney", () => {
  it("ordena casa(manhã) → leva 8h → atividade 18h → busca 19h → casa(noite)", () => {
    const items = buildChildJourney({
      dropoff: { name: "Fernanda", time: "08:00:00" },
      pickup: { name: "Henrique", time: "19:00:00" },
      activities: [{ name: "Jiu-Jitsu", time: "18:00:00", category: "sport" }],
      homeMorning: "Casa Fernanda",
      homeEvening: "Casa Henrique",
    });
    expect(items.map((i) => i.kind)).toEqual(["home", "dropoff", "activity", "pickup", "home"]);
    expect(items[1]?.time).toBe("08:00");
    expect(items[2]?.text).toBe("Jiu-Jitsu");
    expect(items[3]?.time).toBe("19:00");
  });

  it("atividade SEM horário é omitida da timeline", () => {
    const items = buildChildJourney({
      dropoff: null,
      pickup: null,
      activities: [{ name: "Sem hora", time: null, category: "other" }],
    });
    expect(items).toHaveLength(0);
  });

  it("família intacta (sem âncoras de casa) só mostra leva/atividade/busca", () => {
    const items = buildChildJourney({
      dropoff: { name: "Fernanda", time: "08:00" },
      pickup: { name: "Henrique", time: "17:30" },
      activities: [],
    });
    expect(items.map((i) => i.kind)).toEqual(["dropoff", "pickup"]);
    expect(items.every((i) => i.kind !== "home")).toBe(true);
  });

  it("empate de horário mantém ordem de inserção (leva antes da atividade)", () => {
    const items = buildChildJourney({
      dropoff: { name: "Fernanda", time: "08:00" },
      pickup: null,
      activities: [{ name: "Aula", time: "08:00", category: "school" }],
    });
    expect(items.map((i) => i.kind)).toEqual(["dropoff", "activity"]);
  });

  it("dia vazio → timeline vazia", () => {
    expect(buildChildJourney({ dropoff: null, pickup: null, activities: [] })).toHaveLength(0);
  });
});
