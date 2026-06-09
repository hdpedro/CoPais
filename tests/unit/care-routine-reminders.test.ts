/**
 * Testes do núcleo puro do lembrete de Leva & Busca
 * (selectDueRoutineReminders). Janela de slot ±8/7min, lead default 30 (perna),
 * override do dia vence o slot, lead=0 e custody_based (responsável null) são
 * ignorados.
 */

import { describe, it, expect } from "vitest";
import {
  selectDueRoutineReminders,
  selectDueRoutineFollowUps,
  type RoutineSlotForReminder,
  type RoutineOverrideForReminder,
} from "@/lib/services/care-routine-reminders-core";

// Segunda 2026-06-08, 17:00 BRT. Pickup 17:30 com lead 30 → trigger 17:00 = agora.
const NOW = new Date("2026-06-08T17:00:00-03:00");

function slot(p: Partial<RoutineSlotForReminder>): RoutineSlotForReminder {
  return {
    child_id: p.child_id ?? "c1",
    group_id: p.group_id ?? "g1",
    weekday: p.weekday ?? 1, // segunda
    leg: p.leg ?? "pickup",
    responsible_id: p.responsible_id === undefined ? "fernanda" : p.responsible_id,
    time_of_day: p.time_of_day === undefined ? "17:30:00" : p.time_of_day,
    reminder_lead_minutes: p.reminder_lead_minutes ?? null,
  };
}

describe("selectDueRoutineReminders", () => {
  it("pickup 17:30 com lead default (30) cai na janela → due pro responsável", () => {
    const due = selectDueRoutineReminders([slot({})], [], NOW);
    expect(due).toHaveLength(1);
    expect(due[0]?.userId).toBe("fernanda");
    expect(due[0]?.leg).toBe("pickup");
    expect(due[0]?.occurrenceDate).toBe("2026-06-08");
    expect(due[0]?.leadMinutes).toBe(30);
  });

  it("horário fora da janela (20:00) não dispara", () => {
    const due = selectDueRoutineReminders([slot({ time_of_day: "20:00:00" })], [], NOW);
    expect(due).toHaveLength(0);
  });

  it("lead=0 (opt-out) não dispara", () => {
    const due = selectDueRoutineReminders([slot({ reminder_lead_minutes: 0 })], [], NOW);
    expect(due).toHaveLength(0);
  });

  it("responsável null (custody_based) é ignorado", () => {
    const due = selectDueRoutineReminders([slot({ responsible_id: null })], [], NOW);
    expect(due).toHaveLength(0);
  });

  it("slot sem horário não dispara", () => {
    const due = selectDueRoutineReminders([slot({ time_of_day: null })], [], NOW);
    expect(due).toHaveLength(0);
  });

  it("override do dia vence o slot no responsável", () => {
    const overrides: RoutineOverrideForReminder[] = [
      { child_id: "c1", occurrence_date: "2026-06-08", leg: "pickup", responsible_id: "henrique" },
    ];
    const due = selectDueRoutineReminders([slot({})], overrides, NOW);
    expect(due).toHaveLength(1);
    expect(due[0]?.userId).toBe("henrique");
  });

  it("slot de outro weekday (não mapeia em ontem/hoje/amanhã) não dispara", () => {
    // quarta (3) não está em {dom 0, seg 1, ter 2} da janela de NOW
    const due = selectDueRoutineReminders([slot({ weekday: 3 })], [], NOW);
    expect(due).toHaveLength(0);
  });
});

// Pickup 17:30 + 45min = 18:15 → janela do follow-up.
const NOW_FOLLOWUP = new Date("2026-06-08T18:15:00-03:00");

describe("selectDueRoutineFollowUps", () => {
  it("pickup dispara follow-up 45min depois (18:15) se não registrado", () => {
    const due = selectDueRoutineFollowUps([slot({ leg: "pickup" })], [], new Set(), NOW_FOLLOWUP);
    expect(due).toHaveLength(1);
    expect(due[0]?.leg).toBe("pickup");
    expect(due[0]?.userId).toBe("fernanda");
    expect(due[0]?.leadMinutes).toBe(45);
  });

  it("NÃO dispara se já registrado (loggedChildLegs)", () => {
    const due = selectDueRoutineFollowUps([slot({ leg: "pickup" })], [], new Set(["c1:pickup"]), NOW_FOLLOWUP);
    expect(due).toHaveLength(0);
  });

  it("dropoff NÃO tem follow-up (só pickup)", () => {
    const due = selectDueRoutineFollowUps([slot({ leg: "dropoff" })], [], new Set(), NOW_FOLLOWUP);
    expect(due).toHaveLength(0);
  });

  it("antes da janela do follow-up (no horário do evento) não dispara", () => {
    const due = selectDueRoutineFollowUps([slot({ leg: "pickup" })], [], new Set(), NOW);
    expect(due).toHaveLength(0);
  });

  it("override do dia vence o slot no destinatário do follow-up", () => {
    const overrides: RoutineOverrideForReminder[] = [
      { child_id: "c1", occurrence_date: "2026-06-08", leg: "pickup", responsible_id: "henrique" },
    ];
    const due = selectDueRoutineFollowUps([slot({ leg: "pickup" })], overrides, new Set(), NOW_FOLLOWUP);
    expect(due[0]?.userId).toBe("henrique");
  });
});
