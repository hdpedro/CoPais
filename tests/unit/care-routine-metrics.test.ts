/**
 * Testes da corresponsabilidade (src/lib/care-routine-metrics.ts).
 * Só contagens neutras; "quem realizou" = responsável resolvido (override > slot);
 * só conta `done`; ordem dos membros (sem ranking).
 */

import { describe, it, expect } from "vitest";
import {
  computeCorresponsibility,
  type RoutineLogEntry,
} from "@/lib/care-routine-metrics";
import type { RoutineSlot, RoutineOverride } from "@/lib/care-routine-resolve";

const MON = "2026-06-08"; // segunda → weekday 1

function slot(p: Partial<RoutineSlot> & { leg: "dropoff" | "pickup" }): RoutineSlot {
  return {
    id: p.id ?? `s-${p.leg}`,
    child_id: p.child_id ?? "c1",
    weekday: p.weekday ?? 1,
    leg: p.leg,
    pattern_type: p.pattern_type ?? "weekly",
    responsible_id: p.responsible_id === undefined ? "fernanda" : p.responsible_id,
    time_of_day: null,
    label: null,
  };
}

const members = [
  { id: "fernanda", name: "Fernanda" },
  { id: "henrique", name: "Henrique" },
];

const log = (leg: "dropoff" | "pickup", status: "done" | "missed", date = MON): RoutineLogEntry => ({
  child_id: "c1",
  occurrence_date: date,
  leg,
  status,
});

describe("computeCorresponsibility", () => {
  it("atribui o 'done' ao responsável do slot (segunda pickup → Fernanda)", () => {
    const rows = computeCorresponsibility(
      [slot({ leg: "pickup", responsible_id: "fernanda" })],
      [],
      [log("pickup", "done")],
      members,
    );
    const f = rows.find((r) => r.userId === "fernanda")!;
    expect(f.pickup).toBe(1);
    expect(f.total).toBe(1);
    expect(rows.find((r) => r.userId === "henrique")!.total).toBe(0);
  });

  it("override do dia vence o slot na atribuição", () => {
    const overrides: RoutineOverride[] = [
      { id: "o", child_id: "c1", occurrence_date: MON, leg: "pickup", responsible_id: "henrique" },
    ];
    const rows = computeCorresponsibility(
      [slot({ leg: "pickup", responsible_id: "fernanda" })],
      overrides,
      [log("pickup", "done")],
      members,
    );
    expect(rows.find((r) => r.userId === "henrique")!.pickup).toBe(1);
    expect(rows.find((r) => r.userId === "fernanda")!.pickup).toBe(0);
  });

  it("'missed' NÃO conta", () => {
    const rows = computeCorresponsibility([slot({ leg: "pickup" })], [], [log("pickup", "missed")], members);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it("responsável fora dos membros (ex-membro) é ignorado, sem erro", () => {
    const rows = computeCorresponsibility(
      [slot({ leg: "pickup", responsible_id: "avo" })],
      [],
      [log("pickup", "done")],
      members,
    );
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it("separa leva e busca; mantém ordem dos membros (sem ranking)", () => {
    const rows = computeCorresponsibility(
      [
        slot({ leg: "dropoff", responsible_id: "henrique" }),
        slot({ leg: "pickup", responsible_id: "fernanda" }),
      ],
      [],
      [log("dropoff", "done"), log("pickup", "done")],
      members,
    );
    expect(rows[0]?.userId).toBe("fernanda"); // ordem de members, não por contagem
    expect(rows.find((r) => r.userId === "henrique")!.dropoff).toBe(1);
    expect(rows.find((r) => r.userId === "fernanda")!.pickup).toBe(1);
  });
});
