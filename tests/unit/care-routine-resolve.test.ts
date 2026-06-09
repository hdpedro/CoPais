/**
 * Testes do resolver puro da Rotina de Leva & Busca (src/lib/care-routine-resolve.ts).
 *
 * Regra: override do dia > slot semanal do weekday. weekday 0=Dom.
 * Cobre o exemplo "Família Pedro" (casal intacto):
 *   Seg → Fernanda leva / Henrique busca.
 */

import { describe, it, expect } from "vitest";
import {
  weekdayOf,
  weekParityOf,
  resolveLegOnDate,
  resolveRoutineOnDate,
  buildRoutineToday,
  type RoutineSlot,
  type RoutineOverride,
  type RoutineLeg,
  type ResolvedRoutine,
} from "@/lib/care-routine-resolve";

// 2026-06-08 = segunda-feira (getDay 1); 06-07 = domingo (0); 06-13 = sábado (6).
const MON = "2026-06-08";
const TUE = "2026-06-09";
const SUN = "2026-06-07";

function slot(p: Partial<RoutineSlot> & { weekday: number; leg: RoutineLeg }): RoutineSlot {
  return {
    id: p.id ?? `s-${p.weekday}-${p.leg}`,
    child_id: p.child_id ?? "c1",
    weekday: p.weekday,
    leg: p.leg,
    pattern_type: p.pattern_type ?? "weekly",
    responsible_id: p.responsible_id === undefined ? "fernanda" : p.responsible_id,
    time_of_day: p.time_of_day ?? null,
    label: p.label ?? null,
    week_parity: p.week_parity ?? null,
  };
}

function ovr(p: Partial<RoutineOverride> & { leg: RoutineLeg; responsible_id: string }): RoutineOverride {
  return {
    id: p.id ?? "o1",
    child_id: p.child_id ?? "c1",
    occurrence_date: p.occurrence_date ?? MON,
    leg: p.leg,
    responsible_id: p.responsible_id,
  };
}

const names: Record<string, string> = { fernanda: "Fernanda", henrique: "Henrique" };
const resolveName = (id: string) => names[id] ?? id;

describe("weekdayOf — 0=Dom, sem off-by-one de UTC", () => {
  it("segunda 2026-06-08 → 1, domingo 06-07 → 0, sábado 06-13 → 6", () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf("2026-06-13")).toBe(6);
  });
});

describe("resolveLegOnDate", () => {
  it("slot semanal resolve no weekday certo, null fora dele", () => {
    const slots = [slot({ weekday: 1, leg: "dropoff", responsible_id: "fernanda" })];
    expect(resolveLegOnDate(slots, [], "c1", MON, "dropoff")?.responsibleId).toBe("fernanda");
    expect(resolveLegOnDate(slots, [], "c1", MON, "dropoff")?.source).toBe("slot");
    // terça não tem slot → null
    expect(resolveLegOnDate(slots, [], "c1", TUE, "dropoff")).toBeNull();
  });

  it("override do dia vence o slot semanal", () => {
    const slots = [slot({ weekday: 1, leg: "pickup", responsible_id: "henrique" })];
    const overrides = [ovr({ leg: "pickup", responsible_id: "fernanda", occurrence_date: MON })];
    const r = resolveLegOnDate(slots, overrides, "c1", MON, "pickup");
    expect(r?.responsibleId).toBe("fernanda");
    expect(r?.source).toBe("override");
  });

  it("override de outra data NÃO afeta o dia", () => {
    const slots = [slot({ weekday: 1, leg: "pickup", responsible_id: "henrique" })];
    const overrides = [ovr({ leg: "pickup", responsible_id: "fernanda", occurrence_date: TUE })];
    expect(resolveLegOnDate(slots, overrides, "c1", MON, "pickup")?.responsibleId).toBe("henrique");
  });

  it("slot não-weekly (custody_based, sem responsável) é ignorado na Fase 1", () => {
    const slots = [
      slot({ weekday: 1, leg: "dropoff", pattern_type: "custody_based", responsible_id: null }),
    ];
    expect(resolveLegOnDate(slots, [], "c1", MON, "dropoff")).toBeNull();
  });

  it("carrega time e label do slot", () => {
    const slots = [
      slot({ weekday: 1, leg: "pickup", responsible_id: "henrique", time_of_day: "17:30", label: "escola" }),
    ];
    const r = resolveLegOnDate(slots, [], "c1", MON, "pickup");
    expect(r?.time).toBe("17:30");
    expect(r?.label).toBe("escola");
  });
});

describe("resolveRoutineOnDate — exemplo Família Pedro (segunda)", () => {
  it("Fernanda leva, Henrique busca", () => {
    const slots = [
      slot({ weekday: 1, leg: "dropoff", responsible_id: "fernanda", label: "escola" }),
      slot({ weekday: 1, leg: "pickup", responsible_id: "henrique", time_of_day: "17:30" }),
    ];
    const r = resolveRoutineOnDate(slots, [], "c1", MON);
    expect(r.dropoff?.responsibleId).toBe("fernanda");
    expect(r.pickup?.responsibleId).toBe("henrique");
    expect(r.pickup?.time).toBe("17:30");
  });
});

describe("buildRoutineToday", () => {
  const children = [
    { id: "c1", firstName: "Otto" },
    { id: "c2", firstName: "Martim" },
  ];

  it("mode 'none' quando nenhuma criança tem rotina hoje", () => {
    const res = buildRoutineToday(children, { c1: { dropoff: null, pickup: null } }, resolveName, "henrique");
    expect(res.mode).toBe("none");
    expect(res.entries).toHaveLength(0);
  });

  it("colapsa em 'together' quando os filhos vão juntos (mesmo par)", () => {
    const same: ResolvedRoutine = {
      dropoff: { responsibleId: "fernanda", time: null, label: "escola", source: "slot" },
      pickup: { responsibleId: "henrique", time: "17:30", label: null, source: "slot" },
    };
    const res = buildRoutineToday(children, { c1: same, c2: same }, resolveName, "henrique");
    expect(res.mode).toBe("together");
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]?.childNames).toEqual(["Otto", "Martim"]);
    expect(res.entries[0]?.dropoff?.responsibleName).toBe("Fernanda");
    expect(res.entries[0]?.pickup?.isMe).toBe(true); // currentUser = henrique
    expect(res.entries[0]?.sameAllDay).toBe(false);
  });

  it("separa em 'split' quando os filhos divergem", () => {
    const c1r: ResolvedRoutine = {
      dropoff: { responsibleId: "fernanda", time: null, label: null, source: "slot" },
      pickup: { responsibleId: "henrique", time: null, label: null, source: "slot" },
    };
    const c2r: ResolvedRoutine = {
      dropoff: { responsibleId: "henrique", time: null, label: null, source: "slot" },
      pickup: { responsibleId: "henrique", time: null, label: null, source: "slot" },
    };
    const res = buildRoutineToday(children, { c1: c1r, c2: c2r }, resolveName, "fernanda");
    expect(res.mode).toBe("split");
    expect(res.entries).toHaveLength(2);
  });

  it("sameAllDay=true quando o mesmo responsável leva E busca (dia inteiro)", () => {
    const allDay: ResolvedRoutine = {
      dropoff: { responsibleId: "fernanda", time: null, label: null, source: "slot" },
      pickup: { responsibleId: "fernanda", time: null, label: null, source: "slot" },
    };
    const res = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: allDay }, resolveName, "henrique");
    expect(res.mode).toBe("together");
    expect(res.entries[0]?.sameAllDay).toBe(true);
  });
});

describe("alternating_week (semana A/B)", () => {
  it("weekParityOf é estável e binário (segunda 2026-06-08 = 1; semana seguinte = 0)", () => {
    expect(weekParityOf(MON)).toBe(1);
    expect(weekParityOf("2026-06-15")).toBe(0);
    expect([0, 1]).toContain(weekParityOf("2026-03-03"));
  });

  it("slot da MESMA paridade aplica; da paridade oposta não", () => {
    const same = [slot({ weekday: 1, leg: "dropoff", pattern_type: "alternating_week", week_parity: weekParityOf(MON) })];
    expect(resolveLegOnDate(same, [], "c1", MON, "dropoff")?.responsibleId).toBe("fernanda");
    const opposite = [slot({ weekday: 1, leg: "dropoff", pattern_type: "alternating_week", week_parity: 1 - weekParityOf(MON) })];
    expect(resolveLegOnDate(opposite, [], "c1", MON, "dropoff")).toBeNull();
  });

  it("week_parity null → vale toda semana", () => {
    const s = [slot({ weekday: 1, leg: "dropoff", pattern_type: "alternating_week", week_parity: null })];
    expect(resolveLegOnDate(s, [], "c1", MON, "dropoff")?.responsibleId).toBe("fernanda");
  });
});

describe("custody_based", () => {
  it("responsável vem do custodyResolver injetado", () => {
    const s = [slot({ weekday: 1, leg: "pickup", pattern_type: "custody_based", responsible_id: null })];
    const r = resolveLegOnDate(s, [], "c1", MON, "pickup", () => "henrique");
    expect(r?.responsibleId).toBe("henrique");
  });

  it("sem custodyResolver (ou guarda indefinida) → null", () => {
    const s = [slot({ weekday: 1, leg: "pickup", pattern_type: "custody_based", responsible_id: null })];
    expect(resolveLegOnDate(s, [], "c1", MON, "pickup")).toBeNull();
    expect(resolveLegOnDate(s, [], "c1", MON, "pickup", () => null)).toBeNull();
  });

  it("override do dia vence até custody_based", () => {
    const s = [slot({ weekday: 1, leg: "pickup", pattern_type: "custody_based", responsible_id: null })];
    const overrides = [ovr({ leg: "pickup", responsible_id: "fernanda", occurrence_date: MON })];
    expect(resolveLegOnDate(s, overrides, "c1", MON, "pickup", () => "henrique")?.responsibleId).toBe("fernanda");
  });
});
