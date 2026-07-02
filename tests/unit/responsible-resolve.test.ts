/* ------------------------------------------------------------------ */
/* Resolvedor único "quem responde pela criança no dia X" (Fatia R1     */
/* da épica Guarda & Rotina). Tabela-verdade por ARRANJO — guarda é     */
/* plural no Kindar: separados (custody_events) E juntos (leva/busca).  */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  resolveCustodianOnDate,
  resolveResponsibleForDay,
  type ResolveResponsibleInput,
} from "@/lib/responsible-resolve";
import type { CustodyEvent } from "@/lib/custody-resolve";
import type { RoutineSlot, RoutineOverride } from "@/lib/care-routine-resolve";

const CHILD = "child-1";
const PAI = "user-pai";
const MAE = "user-mae";

const DAY = "2026-07-08"; // quarta-feira (weekday 3)

function ev(over: Partial<CustodyEvent>): CustodyEvent {
  return {
    id: over.id ?? "ev-" + Math.random().toString(36).slice(2),
    child_id: CHILD,
    start_date: DAY,
    end_date: DAY,
    responsible_user_id: PAI,
    custody_type: "regular",
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

function slot(over: Partial<RoutineSlot>): RoutineSlot {
  return {
    id: over.id ?? "slot-" + Math.random().toString(36).slice(2),
    child_id: CHILD,
    weekday: 3, // quarta
    leg: "dropoff",
    pattern_type: "weekly",
    responsible_id: MAE,
    time_of_day: "07:30",
    label: "escola",
    ...over,
  };
}

function input(over: Partial<ResolveResponsibleInput>): ResolveResponsibleInput {
  return {
    arrangement: "rotating",
    custodyEvents: [],
    slots: [],
    overrides: [],
    childId: CHILD,
    dateKey: DAY,
    ...over,
  };
}

describe("resolveCustodianOnDate — mescla criança + família-toda", () => {
  it("férias FAMÍLIA-TODA (child_id null, prio 2) vencem o regular da criança (prio 3)", () => {
    const events = [
      ev({ custody_type: "regular", responsible_user_id: PAI }),
      ev({ child_id: null, custody_type: "vacation", responsible_user_id: MAE, start_date: "2026-07-01", end_date: "2026-07-15" }),
    ];
    expect(resolveCustodianOnDate(events, CHILD, DAY)).toEqual({ userId: MAE, source: "vacation" });
  });

  it("swap da criança (prio 1) vence férias família-toda (prio 2)", () => {
    const events = [
      ev({ child_id: null, custody_type: "vacation", responsible_user_id: MAE, start_date: "2026-07-01", end_date: "2026-07-15" }),
      ev({ custody_type: "swap", responsible_user_id: PAI }),
    ];
    expect(resolveCustodianOnDate(events, CHILD, DAY)).toEqual({ userId: PAI, source: "swap" });
  });

  it("evento de OUTRA criança não vaza; sem cobertura da data → null", () => {
    const events = [
      ev({ child_id: "outra-crianca", custody_type: "swap", responsible_user_id: MAE }),
      ev({ start_date: "2026-07-09", end_date: "2026-07-09" }), // não cobre DAY
    ];
    expect(resolveCustodianOnDate(events, CHILD, DAY)).toBeNull();
  });
});

describe("rotating/custom (separados) — primary = quem está COM a criança", () => {
  it("regular → custodian; swap sobrepõe", () => {
    const base = input({ custodyEvents: [ev({ custody_type: "regular", responsible_user_id: MAE })] });
    expect(resolveResponsibleForDay(base).primary).toEqual({ userId: MAE, reason: "custodian" });

    const comSwap = input({
      custodyEvents: [
        ev({ custody_type: "regular", responsible_user_id: MAE }),
        ev({ custody_type: "swap", responsible_user_id: PAI }),
      ],
    });
    const r = resolveResponsibleForDay(comSwap);
    expect(r.custodian).toEqual({ userId: PAI, source: "swap" });
    expect(r.primary).toEqual({ userId: PAI, reason: "custodian" });
  });

  it("custom sem escala noturna mas com leva/busca → cai na rotina (fallback)", () => {
    const r = resolveResponsibleForDay(input({ arrangement: "custom", slots: [slot({})] }));
    expect(r.custodian).toBeNull();
    expect(r.primary).toEqual({ userId: MAE, reason: "dropoff" });
  });

  it("nada configurado → primary null (call-site mantém fanout atual)", () => {
    const r = resolveResponsibleForDay(input({}));
    expect(r).toEqual({ custodian: null, dropoff: null, pickup: null, primary: null });
  });
});

describe("together/single (juntos/solo) — primary = rotina do dia", () => {
  it("slot de leva → primary dropoff (com hora e destino no retorno rico)", () => {
    const r = resolveResponsibleForDay(input({ arrangement: "together", slots: [slot({})] }));
    expect(r.dropoff).toEqual({ responsibleId: MAE, time: "07:30", label: "escola", source: "slot" });
    expect(r.primary).toEqual({ userId: MAE, reason: "dropoff" });
  });

  it("override do dia vence o slot (avó busca na quinta → aqui: pai leva hoje)", () => {
    const overrides: RoutineOverride[] = [
      { id: "ov1", child_id: CHILD, occurrence_date: DAY, leg: "dropoff", responsible_id: PAI },
    ];
    const r = resolveResponsibleForDay(input({ arrangement: "together", slots: [slot({})], overrides }));
    expect(r.dropoff?.source).toBe("override");
    expect(r.primary).toEqual({ userId: PAI, reason: "dropoff" });
  });

  it("só busca configurada → primary pickup", () => {
    const r = resolveResponsibleForDay(
      input({ arrangement: "single", slots: [slot({ leg: "pickup", responsible_id: PAI, time_of_day: "17:00" })] }),
    );
    expect(r.primary).toEqual({ userId: PAI, reason: "pickup" });
  });

  it("guarda EXPLÍCITA (férias) vence a rotina mesmo em together", () => {
    const r = resolveResponsibleForDay(
      input({
        arrangement: "together",
        slots: [slot({})],
        custodyEvents: [ev({ custody_type: "vacation", responsible_user_id: PAI, start_date: "2026-07-01", end_date: "2026-07-15" })],
      }),
    );
    expect(r.primary).toEqual({ userId: PAI, reason: "custodian" });
  });

  it("guarda 'regular' residual NÃO vence a rotina em together (só explícitas vencem)", () => {
    const r = resolveResponsibleForDay(
      input({
        arrangement: "together",
        slots: [slot({})],
        custodyEvents: [ev({ custody_type: "regular", responsible_user_id: PAI })],
      }),
    );
    expect(r.primary).toEqual({ userId: MAE, reason: "dropoff" });
  });
});

describe("custody_based — a rotina deriva da guarda (resolver injetado)", () => {
  it("slot custody_based resolve pro dono da guarda no dia (com a mescla família-toda)", () => {
    const r = resolveResponsibleForDay(
      input({
        arrangement: "rotating",
        slots: [slot({ pattern_type: "custody_based", responsible_id: null })],
        custodyEvents: [ev({ child_id: null, custody_type: "vacation", responsible_user_id: PAI, start_date: "2026-07-01", end_date: "2026-07-15" })],
      }),
    );
    expect(r.dropoff).toEqual({ responsibleId: PAI, time: "07:30", label: "escola", source: "slot" });
    expect(r.primary).toEqual({ userId: PAI, reason: "custodian" });
  });
});
