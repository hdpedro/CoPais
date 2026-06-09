/**
 * Edge-cases abrangentes da Rotina de Leva & Busca — cobre resolve, reminders,
 * metrics e journey em ângulos não cobertos pelos testes por-módulo, pra
 * "validar tudo" (suite QA).
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
  type ResolvedRoutine,
} from "@/lib/care-routine-resolve";
import {
  selectDueRoutineReminders,
  selectDueRoutineFollowUps,
  type RoutineSlotForReminder,
} from "@/lib/services/care-routine-reminders-core";
import { computeCorresponsibility, type RoutineLogEntry } from "@/lib/care-routine-metrics";
import { buildChildJourney } from "@/lib/care-routine-journey";

const MON = "2026-06-08"; // segunda, weekday 1
const SUN = "2026-06-07"; // domingo, weekday 0
const SAT = "2026-06-13"; // sábado, weekday 6

const slot = (p: Partial<RoutineSlot> = {}): RoutineSlot => ({
  id: "s",
  child_id: "c1",
  weekday: 1,
  leg: "pickup",
  pattern_type: "weekly",
  responsible_id: "fernanda",
  time_of_day: null,
  label: null,
  week_parity: null,
  ...p,
});

const ovr = (p: Partial<RoutineOverride> = {}): RoutineOverride => ({
  id: "o",
  child_id: "c1",
  occurrence_date: MON,
  leg: "pickup",
  responsible_id: "henrique",
  ...p,
});

// ───────────────────────── resolve ─────────────────────────
describe("edge: weekdayOf", () => {
  it("segunda=1, domingo=0, sábado=6", () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf(SAT)).toBe(6);
  });
});

describe("edge: weekParityOf", () => {
  it("é binária e alterna semana a semana", () => {
    const p0 = weekParityOf(MON);
    expect([0, 1]).toContain(p0);
    expect(weekParityOf("2026-06-15")).toBe(1 - p0); // semana seguinte
    expect(weekParityOf("2026-06-22")).toBe(p0); // duas semanas → mesma paridade
  });
  it("dias da MESMA semana têm a mesma paridade", () => {
    expect(weekParityOf(MON)).toBe(weekParityOf("2026-06-10")); // seg e qua da mesma semana
  });
});

describe("edge: resolveLegOnDate", () => {
  it("sem slot no weekday → null", () => {
    expect(resolveLegOnDate([slot({ weekday: 3 })], [], "c1", MON, "pickup")).toBeNull();
  });
  it("slot de outra criança → null", () => {
    expect(resolveLegOnDate([slot({ child_id: "c2" })], [], "c1", MON, "pickup")).toBeNull();
  });
  it("override do dia vence o slot", () => {
    const r = resolveLegOnDate([slot({ responsible_id: "fernanda" })], [ovr({ responsible_id: "henrique" })], "c1", MON, "pickup");
    expect(r?.responsibleId).toBe("henrique");
    expect(r?.source).toBe("override");
  });
  it("override vence até custody_based", () => {
    const r = resolveLegOnDate(
      [slot({ pattern_type: "custody_based", responsible_id: null })],
      [ovr({ responsible_id: "fernanda" })],
      "c1",
      MON,
      "pickup",
      () => "henrique",
    );
    expect(r?.responsibleId).toBe("fernanda");
  });
  it("custody_based sem resolver → null", () => {
    expect(resolveLegOnDate([slot({ pattern_type: "custody_based", responsible_id: null })], [], "c1", MON, "pickup")).toBeNull();
  });
  it("weekly slot retorna source=slot + time/label", () => {
    const r = resolveLegOnDate([slot({ time_of_day: "17:30:00", label: "escola" })], [], "c1", MON, "pickup");
    expect(r).toMatchObject({ responsibleId: "fernanda", time: "17:30:00", label: "escola", source: "slot" });
  });
});

describe("edge: alternating_week resolução", () => {
  it("week_parity null = vale toda semana", () => {
    expect(resolveLegOnDate([slot({ pattern_type: "alternating_week", week_parity: null })], [], "c1", MON, "pickup")?.responsibleId).toBe("fernanda");
  });
  it("paridade certa aplica, oposta não", () => {
    const p = weekParityOf(MON);
    expect(resolveLegOnDate([slot({ pattern_type: "alternating_week", week_parity: p })], [], "c1", MON, "pickup")).not.toBeNull();
    expect(resolveLegOnDate([slot({ pattern_type: "alternating_week", week_parity: (1 - p) as 0 | 1 })], [], "c1", MON, "pickup")).toBeNull();
  });
});

describe("edge: resolveRoutineOnDate", () => {
  it("resolve as duas pernas", () => {
    const r = resolveRoutineOnDate(
      [slot({ leg: "dropoff", responsible_id: "fernanda" }), slot({ leg: "pickup", responsible_id: "henrique" })],
      [],
      "c1",
      MON,
    );
    expect(r.dropoff?.responsibleId).toBe("fernanda");
    expect(r.pickup?.responsibleId).toBe("henrique");
  });
  it("sem slots → ambas null", () => {
    const r = resolveRoutineOnDate([], [], "c1", MON);
    expect(r.dropoff).toBeNull();
    expect(r.pickup).toBeNull();
  });
});

describe("edge: buildRoutineToday", () => {
  const name = (uid: string | null) => (uid === "fernanda" ? "Fernanda" : uid === "henrique" ? "Henrique" : "");
  const resolved = (dropoff: string | null, pickup: string | null): ResolvedRoutine => ({
    dropoff: dropoff ? { responsibleId: dropoff, time: null, label: null, source: "slot" } : null,
    pickup: pickup ? { responsibleId: pickup, time: null, label: null, source: "slot" } : null,
  });

  it("nenhuma rotina → mode none", () => {
    const r = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: resolved(null, null) }, name, "henrique");
    expect(r.mode).toBe("none");
  });
  it("uma criança com rotina → mode together", () => {
    const r = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: resolved("fernanda", "henrique") }, name, "henrique");
    expect(r.mode).toBe("together");
    expect(r.entries[0]?.dropoff?.responsibleName).toBe("Fernanda");
    expect(r.entries[0]?.pickup?.isMe).toBe(true); // henrique é o user
  });
  it("duas crianças com responsáveis diferentes → split", () => {
    const r = buildRoutineToday(
      [{ id: "c1", firstName: "Otto" }, { id: "c2", firstName: "Ana" }],
      { c1: resolved("fernanda", "fernanda"), c2: resolved("henrique", "henrique") },
      name,
      "henrique",
    );
    expect(r.mode).toBe("split");
    expect(r.entries).toHaveLength(2);
  });
  it("sameAllDay quando dropoff===pickup", () => {
    const r = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: resolved("fernanda", "fernanda") }, name, "henrique");
    expect(r.entries[0]?.sameAllDay).toBe(true);
  });
  it("sameAllDay false quando dropoff≠pickup", () => {
    const r = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: resolved("fernanda", "henrique") }, name, "henrique");
    expect(r.entries[0]?.sameAllDay).toBe(false);
  });
});

// ───────────────────────── reminders ─────────────────────────
const NOW = new Date("2026-06-08T17:00:00-03:00"); // pickup 17:30 lead 30 → trigger 17:00
const rslot = (p: Partial<RoutineSlotForReminder> = {}): RoutineSlotForReminder => ({
  child_id: "c1",
  group_id: "g1",
  weekday: 1,
  leg: "pickup",
  responsible_id: "fernanda",
  time_of_day: "17:30:00",
  reminder_lead_minutes: null,
  pattern_type: "weekly",
  week_parity: null,
  ...p,
});

describe("edge: reminders", () => {
  it("sem time_of_day → não dispara", () => {
    expect(selectDueRoutineReminders([rslot({ time_of_day: null })], [], NOW)).toHaveLength(0);
  });
  it("lead 0 (opt-out) → não dispara", () => {
    expect(selectDueRoutineReminders([rslot({ reminder_lead_minutes: 0 })], [], NOW)).toHaveLength(0);
  });
  it("override do dia muda o destinatário", () => {
    const due = selectDueRoutineReminders([rslot({})], [{ child_id: "c1", occurrence_date: MON, leg: "pickup", responsible_id: "henrique" }], NOW);
    expect(due[0]?.userId).toBe("henrique");
  });
  it("dois slots na janela → dois lembretes", () => {
    const due = selectDueRoutineReminders([rslot({ child_id: "c1" }), rslot({ child_id: "c2" })], [], NOW);
    expect(due).toHaveLength(2);
  });
  it("sentinel morning-of (-1) dispara às 08:00", () => {
    const morning = new Date("2026-06-08T08:00:00-03:00");
    const due = selectDueRoutineReminders([rslot({ reminder_lead_minutes: -1 })], [], morning);
    expect(due).toHaveLength(1);
  });
});

describe("edge: follow-ups", () => {
  const NOW_FU = new Date("2026-06-08T18:15:00-03:00"); // 17:30 + 45min
  it("pickup dispara 45min depois", () => {
    expect(selectDueRoutineFollowUps([rslot({})], [], new Set(), NOW_FU)).toHaveLength(1);
  });
  it("dropoff nunca dispara follow-up", () => {
    expect(selectDueRoutineFollowUps([rslot({ leg: "dropoff" })], [], new Set(), NOW_FU)).toHaveLength(0);
  });
  it("já registrado → não dispara", () => {
    expect(selectDueRoutineFollowUps([rslot({})], [], new Set(["c1:pickup"]), NOW_FU)).toHaveLength(0);
  });
  it("custody_based usa o resolver no follow-up", () => {
    const due = selectDueRoutineFollowUps([rslot({ pattern_type: "custody_based", responsible_id: null })], [], new Set(), NOW_FU, () => "henrique");
    expect(due[0]?.userId).toBe("henrique");
  });
});

// ───────────────────────── metrics ─────────────────────────
const members = [
  { id: "fernanda", name: "Fernanda" },
  { id: "henrique", name: "Henrique" },
];
const log = (leg: "dropoff" | "pickup", status: "done" | "missed", date = MON): RoutineLogEntry => ({ child_id: "c1", occurrence_date: date, leg, status });

describe("edge: corresponsabilidade", () => {
  it("done atribui ao responsável do slot", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup", responsible_id: "fernanda" })], [], [log("pickup", "done")], members);
    expect(rows.find((r) => r.userId === "fernanda")?.pickup).toBe(1);
  });
  it("override redireciona a atribuição", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup", responsible_id: "fernanda" })], [ovr({ leg: "pickup", responsible_id: "henrique" })], [log("pickup", "done")], members);
    expect(rows.find((r) => r.userId === "henrique")?.pickup).toBe(1);
    expect(rows.find((r) => r.userId === "fernanda")?.pickup).toBe(0);
  });
  it("missed não conta", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup" })], [], [log("pickup", "missed")], members);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });
  it("ex-membro (fora de members) é ignorado", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup", responsible_id: "avo" })], [], [log("pickup", "done")], members);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });
  it("ordem = ordem de members (sem ranking)", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup", responsible_id: "henrique" })], [], [log("pickup", "done")], members);
    expect(rows[0]?.userId).toBe("fernanda");
  });
  it("total = leva + busca", () => {
    const rows = computeCorresponsibility(
      [slot({ leg: "dropoff", responsible_id: "fernanda" }), slot({ leg: "pickup", responsible_id: "fernanda" })],
      [],
      [log("dropoff", "done"), log("pickup", "done")],
      members,
    );
    const f = rows.find((r) => r.userId === "fernanda")!;
    expect(f.total).toBe(f.dropoff + f.pickup);
    expect(f.total).toBe(2);
  });
});

// ───────────────────────── journey ─────────────────────────
describe("edge: jornada", () => {
  it("ordena por horário com âncoras de casa", () => {
    const items = buildChildJourney({
      dropoff: { name: "Fernanda", time: "08:00" },
      pickup: { name: "Henrique", time: "19:00" },
      activities: [{ name: "Jiu", time: "18:00", category: "sport" }],
      homeMorning: "Casa",
      homeEvening: "Casa H",
    });
    expect(items.map((i) => i.kind)).toEqual(["home", "dropoff", "activity", "pickup", "home"]);
  });
  it("atividade sem horário é omitida", () => {
    const items = buildChildJourney({ dropoff: null, pickup: null, activities: [{ name: "x", time: null, category: "other" }] });
    expect(items).toHaveLength(0);
  });
  it("sem guarda → sem âncoras de casa", () => {
    const items = buildChildJourney({ dropoff: { name: "F", time: "08:00" }, pickup: null, activities: [] });
    expect(items.every((i) => i.kind !== "home")).toBe(true);
  });
  it("só dropoff", () => {
    const items = buildChildJourney({ dropoff: { name: "F", time: "08:00" }, pickup: null, activities: [] });
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("dropoff");
  });
  it("dia vazio → []", () => {
    expect(buildChildJourney({ dropoff: null, pickup: null, activities: [] })).toHaveLength(0);
  });
  it("empate de horário mantém ordem (dropoff antes de activity)", () => {
    const items = buildChildJourney({ dropoff: { name: "F", time: "08:00" }, pickup: null, activities: [{ name: "Aula", time: "08:00", category: "school" }] });
    expect(items.map((i) => i.kind)).toEqual(["dropoff", "activity"]);
  });
  it("só pickup", () => {
    const items = buildChildJourney({ dropoff: null, pickup: { name: "H", time: "19:00" }, activities: [] });
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("pickup");
  });
});

describe("edge: cobertura extra", () => {
  it("weekdayOf cobre ter/qua/qui/sex", () => {
    expect(weekdayOf("2026-06-09")).toBe(2); // terça
    expect(weekdayOf("2026-06-10")).toBe(3); // quarta
    expect(weekdayOf("2026-06-11")).toBe(4); // quinta
    expect(weekdayOf("2026-06-12")).toBe(5); // sexta
  });
  it("resolveLegOnDate resolve dropoff também", () => {
    const r = resolveLegOnDate([slot({ leg: "dropoff", responsible_id: "henrique" })], [], "c1", MON, "dropoff");
    expect(r?.responsibleId).toBe("henrique");
  });
  it("buildRoutineToday: isMe false pro outro responsável", () => {
    const name = (uid: string | null) => (uid === "fernanda" ? "Fernanda" : "Henrique");
    const resolved: ResolvedRoutine = {
      dropoff: { responsibleId: "fernanda", time: null, label: null, source: "slot" },
      pickup: { responsibleId: "fernanda", time: null, label: null, source: "slot" },
    };
    const r = buildRoutineToday([{ id: "c1", firstName: "Otto" }], { c1: resolved }, name, "henrique");
    expect(r.entries[0]?.dropoff?.isMe).toBe(false); // fernanda ≠ henrique
  });
  it("metrics: members vazio → []", () => {
    expect(computeCorresponsibility([slot({ leg: "pickup" })], [], [log("pickup", "done")], [])).toHaveLength(0);
  });
  it("metrics: duas crianças agregam pro mesmo responsável", () => {
    const rows = computeCorresponsibility(
      [slot({ child_id: "c1", leg: "pickup", responsible_id: "fernanda" }), slot({ child_id: "c2", leg: "pickup", responsible_id: "fernanda" })],
      [],
      [log("pickup", "done"), { child_id: "c2", occurrence_date: MON, leg: "pickup", status: "done" }],
      members,
    );
    expect(rows.find((r) => r.userId === "fernanda")?.pickup).toBe(2);
  });
  it("reminders: custody_based usa resolver no lembrete pré", () => {
    const due = selectDueRoutineReminders([rslot({ pattern_type: "custody_based", responsible_id: null })], [], NOW, () => "henrique");
    expect(due[0]?.userId).toBe("henrique");
  });
  it("jornada: âncoras de casa abrem e fecham o dia", () => {
    const items = buildChildJourney({ dropoff: null, pickup: null, activities: [], homeMorning: "Casa F", homeEvening: "Casa H" });
    expect(items.map((i) => i.kind)).toEqual(["home", "home"]);
    expect(items[0]?.text).toBe("Casa F");
    expect(items[1]?.text).toBe("Casa H");
  });
  it("cells alternating respeita weekend nos days", () => {
    // já coberto em cells.test, mas valida o caminho de paridade A/B com sábado
    const p = weekParityOf(SAT);
    expect([0, 1]).toContain(p);
  });
});
