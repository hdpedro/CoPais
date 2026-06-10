/**
 * Testes da Jornada da Criança (src/lib/care-routine-journey.ts).
 * Composição ordenada casa → leva → atividades → busca → casa.
 */

import { describe, it, expect } from "vitest";
import { buildChildJourney, dedupeJourneyActivities } from "@/lib/care-routine-journey";

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

describe("dedupeJourneyActivities (dois caminhos, mesmo evento — feedback 10/jun)", () => {
  it("mesmo horário + token de nome em comum ⇒ dedupa, mantém o título mais curto", () => {
    const out = dedupeJourneyActivities([
      { name: "Reunião escolar: Reunião com pais", time: "16:30:00", category: "school" },
      { name: "Reunião pais 303 - Martim São Vicente", time: "16:30:00", category: "evento" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("Reunião escolar: Reunião com pais");
  });

  it("mesmo horário mas nomes SEM token em comum ⇒ NÃO dedupa (Teatro × Futsal)", () => {
    const out = dedupeJourneyActivities([
      { name: "Teatro", time: "18:00:00", category: "art" },
      { name: "Futsal", time: "18:00:00", category: "sport" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("nomes parecidos em horários DIFERENTES ⇒ não dedupa", () => {
    const out = dedupeJourneyActivities([
      { name: "Natação Otto", time: "10:00:00", category: "sport" },
      { name: "Natação Martim", time: "15:00:00", category: "sport" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("sem horário não dedupa (não dá pra afirmar que é o mesmo evento)", () => {
    const out = dedupeJourneyActivities([
      { name: "Dever de casa", time: null, category: "school" },
      { name: "Dever de matemática", time: null, category: "school" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("buildChildJourney aplica a dedup (a dupla 16:30 vira UMA parada)", () => {
    const items = buildChildJourney({
      dropoff: null,
      pickup: null,
      activities: [
        { name: "Reunião escolar: Reunião com pais", time: "16:30:00", category: "school" },
        { name: "Reunião pais 303 - Martim São Vicente", time: "16:30:00", category: "evento" },
        { name: "Teatro", time: "18:00:00", category: "art" },
      ],
    });
    expect(items.map((i) => i.text)).toEqual(["Reunião escolar: Reunião com pais", "Teatro"]);
  });
});

describe("responsável da atividade (dono 10/jun)", () => {
  it("passa pra timeline e sobrevive ao dedup (mantido herda do absorvido)", () => {
    const out = dedupeJourneyActivities([
      { name: "Reunião escolar: Reunião com pais", time: "16:30:00", category: "school" },
      { name: "Reunião pais 303 - Martim São Vicente", time: "16:30:00", category: "evento", responsible: "Henrique" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.responsible).toBe("Henrique");
    const items = buildChildJourney({ dropoff: null, pickup: null, activities: out });
    expect(items[0]?.responsible).toBe("Henrique");
  });
});
