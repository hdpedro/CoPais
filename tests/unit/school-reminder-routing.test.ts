/* ------------------------------------------------------------------ */
/* Roteamento do lembrete de véspera (Fatia R2): a pessoa certa do dia  */
/* recebe; sem escala/rotina → fanout atual (fail-open, nunca silencia).*/
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { pickExamReminderTargets, eveOf } from "@/lib/school-reminder-routing";
import type { CustodyEvent } from "@/lib/custody-resolve";
import type { RoutineSlot } from "@/lib/care-routine-resolve";

const PAI = "user-pai";
const MAE = "user-mae";
const CHILD = "child-1";
const EXAM = "2026-07-09"; // quinta
const MEMBERS = [PAI, MAE];

function ev(over: Partial<CustodyEvent>): CustodyEvent {
  return {
    id: "ev-" + Math.random().toString(36).slice(2),
    child_id: CHILD,
    start_date: EXAM,
    end_date: EXAM,
    responsible_user_id: PAI,
    custody_type: "regular",
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

function base(over: Partial<Parameters<typeof pickExamReminderTargets>[0]> = {}) {
  return {
    arrangement: "rotating" as const,
    custodyEvents: [] as CustodyEvent[],
    slots: [] as RoutineSlot[],
    overrides: [],
    childId: CHILD,
    examDate: EXAM,
    memberIds: MEMBERS,
    ...over,
  };
}

describe("eveOf", () => {
  it("véspera correta, inclusive virada de mês", () => {
    expect(eveOf("2026-07-09")).toBe("2026-07-08");
    expect(eveOf("2026-08-01")).toBe("2026-07-31");
  });
});

describe("pickExamReminderTargets", () => {
  it("sem escala/rotina configurada → fanout atual (todos os membros)", () => {
    expect(pickExamReminderTargets(base()).sort()).toEqual(MEMBERS.slice().sort());
  });

  it("evento sem criança → fanout atual", () => {
    const custodyEvents = [ev({ responsible_user_id: MAE })];
    expect(pickExamReminderTargets(base({ childId: null, custodyEvents })).sort()).toEqual(MEMBERS.slice().sort());
  });

  it("mesma pessoa na véspera e no dia → UM alvo só (dedup)", () => {
    const custodyEvents = [
      ev({ start_date: eveOf(EXAM), end_date: EXAM, responsible_user_id: MAE }),
    ];
    expect(pickExamReminderTargets(base({ custodyEvents }))).toEqual([MAE]);
  });

  it("troca de guarda entre véspera e dia → os DOIS recebem", () => {
    const custodyEvents = [
      ev({ start_date: eveOf(EXAM), end_date: eveOf(EXAM), responsible_user_id: MAE }),
      ev({ start_date: EXAM, end_date: EXAM, responsible_user_id: PAI }),
    ];
    expect(pickExamReminderTargets(base({ custodyEvents })).sort()).toEqual([MAE, PAI].sort());
  });

  it("swap no dia da prova sobrepõe o regular (precedência do resolvedor)", () => {
    const custodyEvents = [
      ev({ start_date: eveOf(EXAM), end_date: EXAM, responsible_user_id: MAE, custody_type: "regular" }),
      ev({ start_date: EXAM, end_date: EXAM, responsible_user_id: PAI, custody_type: "swap" }),
    ];
    expect(pickExamReminderTargets(base({ custodyEvents })).sort()).toEqual([MAE, PAI].sort());
  });

  it("pais juntos: rotina de leva/busca decide (quem leva na quinta recebe)", () => {
    const slots: RoutineSlot[] = [
      {
        id: "s1",
        child_id: CHILD,
        weekday: 4, // quinta (2026-07-09)
        leg: "dropoff",
        pattern_type: "weekly",
        responsible_id: MAE,
        time_of_day: "07:30",
        label: "escola",
      },
      {
        id: "s2",
        child_id: CHILD,
        weekday: 3, // quarta (véspera)
        leg: "dropoff",
        pattern_type: "weekly",
        responsible_id: MAE,
        time_of_day: "07:30",
        label: "escola",
      },
    ];
    expect(pickExamReminderTargets(base({ arrangement: "together", slots }))).toEqual([MAE]);
  });

  it("responsável resolvido que SAIU do grupo → fallback (nunca silencia)", () => {
    const custodyEvents = [ev({ start_date: eveOf(EXAM), end_date: EXAM, responsible_user_id: "user-ex-membro" })];
    expect(pickExamReminderTargets(base({ custodyEvents })).sort()).toEqual(MEMBERS.slice().sort());
  });

  it("sem membros elegíveis → lista vazia (nada a enviar)", () => {
    expect(pickExamReminderTargets(base({ memberIds: [] }))).toEqual([]);
  });
});
