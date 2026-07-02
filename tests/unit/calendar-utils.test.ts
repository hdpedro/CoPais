import { describe, it, expect } from "vitest";
import {
  buildCustodyMap,
  computeSwapBalance,
  timestamptzToBrazilDateKey,
  timestamptzToBrazilTime,
  type CustodyEvent,
} from "@/lib/calendar-utils";

describe("timestamptzToBrazil* — consulta médica no dia/hora certos (bug 15:00 vs 12:00)", () => {
  it("UTC do banco → data e hora em BRT (retorno criado pelo Brain ao meio-dia)", () => {
    // 2026-08-05 15:00Z = 12:00 em America/Sao_Paulo (UTC-3)
    expect(timestamptzToBrazilDateKey("2026-08-05T15:00:00+00:00")).toBe("2026-08-05");
    expect(timestamptzToBrazilTime("2026-08-05T15:00:00+00:00")).toBe("12:00");
  });

  it("consulta de noite NÃO cai no dia seguinte (virada UTC)", () => {
    // 21:30 BRT do dia 5 = 00:30Z do dia 6 — split de string mostraria dia 6.
    expect(timestamptzToBrazilDateKey("2026-08-06T00:30:00+00:00")).toBe("2026-08-05");
    expect(timestamptzToBrazilTime("2026-08-06T00:30:00+00:00")).toBe("21:30");
  });

  it("entrada com offset -03:00 (formato do write do módulo) é estável", () => {
    expect(timestamptzToBrazilDateKey("2026-08-05T12:00:00-03:00")).toBe("2026-08-05");
    expect(timestamptzToBrazilTime("2026-08-05T12:00:00-03:00")).toBe("12:00");
  });
});

const COLORS = {
  "user-a": { name: "Angelino", color: "#5B9E85" },
  "user-b": { name: "Amanda", color: "#D4735A" },
};

function ev(input: Partial<CustodyEvent>): CustodyEvent {
  return {
    id: input.id || "evt-" + Math.random().toString(36).slice(2),
    group_id: input.group_id || "group-1",
    child_id: input.child_id || "child-1",
    responsible_user_id: input.responsible_user_id || "user-a",
    start_date: input.start_date || "2026-07-25",
    end_date: input.end_date || "2026-07-25",
    custody_type: input.custody_type || "regular",
    notes: input.notes ?? null,
    created_by: input.created_by || "user-a",
  };
}

describe("buildCustodyMap — swap precedence (Angelino bug 2026-04-27)", () => {
  it("swap row wins when single-day swap collides with multi-day regular range", () => {
    // Scenario: Angelino owns 25-29 July via regular schedule.
    // Approves swap of 28 July to Amanda.
    const events = [
      ev({ id: "regular-1", start_date: "2026-07-25", end_date: "2026-07-29", responsible_user_id: "user-a", custody_type: "regular" }),
      ev({ id: "swap-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
    ];
    const map = buildCustodyMap(events, COLORS);
    // 25-27: Angelino
    expect(map.get("2026-07-25")?.userId).toBe("user-a");
    expect(map.get("2026-07-26")?.userId).toBe("user-a");
    expect(map.get("2026-07-27")?.userId).toBe("user-a");
    // 28: Amanda (swap wins)
    expect(map.get("2026-07-28")?.userId).toBe("user-b");
    // 29: Angelino
    expect(map.get("2026-07-29")?.userId).toBe("user-a");
  });

  it("swap wins regardless of array order (events come in any order from query)", () => {
    const orderA = [
      ev({ start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
      ev({ start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-a", custody_type: "regular" }),
    ];
    const orderB = [
      ev({ start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-a", custody_type: "regular" }),
      ev({ start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
    ];
    expect(buildCustodyMap(orderA, COLORS).get("2026-07-28")?.userId).toBe("user-b");
    expect(buildCustodyMap(orderB, COLORS).get("2026-07-28")?.userId).toBe("user-b");
  });

  it("two swaps for the same date — last swap wins (re-swap behavior)", () => {
    const events = [
      ev({ id: "swap-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
      ev({ id: "swap-2", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-a", custody_type: "swap" }),
    ];
    // Within swap-vs-swap, last in array wins (acceptable — re-swap is rare).
    expect(buildCustodyMap(events, COLORS).get("2026-07-28")?.userId).toBe("user-a");
  });

  it("regular without any swap behaves the same as before", () => {
    const events = [
      ev({ start_date: "2026-07-25", end_date: "2026-07-29", responsible_user_id: "user-a" }),
      ev({ start_date: "2026-07-30", end_date: "2026-08-03", responsible_user_id: "user-b" }),
    ];
    const map = buildCustodyMap(events, COLORS);
    expect(map.get("2026-07-27")?.userId).toBe("user-a");
    expect(map.get("2026-07-29")?.userId).toBe("user-a");
    expect(map.get("2026-07-30")?.userId).toBe("user-b");
    expect(map.get("2026-08-03")?.userId).toBe("user-b");
  });

  it("unknown responsible_user_id is skipped (not in parentColors)", () => {
    const events = [
      ev({ start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "unknown-user", custody_type: "regular" }),
    ];
    expect(buildCustodyMap(events, COLORS).get("2026-07-28")).toBeUndefined();
  });
});

describe("buildCustodyMap — exceção pontual (Kindar Brain, E2E guarda 2026-07-02)", () => {
  it("exception vence regular no mesmo dia e propaga custodyType pro label", () => {
    const events = [
      ev({ start_date: "2026-07-01", end_date: "2026-07-05", responsible_user_id: "user-b", custody_type: "regular" }),
      ev({ start_date: "2026-07-03", end_date: "2026-07-03", responsible_user_id: "user-a", custody_type: "exception" }),
    ];
    const map = buildCustodyMap(events, COLORS);
    expect(map.get("2026-07-03")?.userId).toBe("user-a");
    expect(map.get("2026-07-03")?.custodyType).toBe("exception");
    expect(map.get("2026-07-02")?.userId).toBe("user-b");
  });

  it("mapa SÓ com explícitos (guarda desligada → query filtra) renderiza o dia combinado", () => {
    // Grupo "moram juntos" (custody_enabled=false): o servidor manda apenas
    // exceção/férias/troca. O dia combinado precisa aparecer mesmo sem escala.
    const events = [
      ev({ start_date: "2026-07-03", end_date: "2026-07-03", responsible_user_id: "user-a", custody_type: "exception" }),
    ];
    const map = buildCustodyMap(events, COLORS);
    expect(map.get("2026-07-03")?.userName).toBe("Angelino");
    expect(map.size).toBe(1);
  });
});

describe("computeSwapBalance — saldo só conta após swap real (Angelino bug 2026-04-27)", () => {
  it("counts +1 for the new owner and -1 for the original owner when swap covers a regular day", () => {
    const events = [
      // Angelino owns 25-29 July
      ev({ id: "regular-1", start_date: "2026-07-25", end_date: "2026-07-29", responsible_user_id: "user-a", custody_type: "regular" }),
      // Amanda accepts swap of 28
      ev({ id: "swap-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
    ];
    const result = computeSwapBalance(events, COLORS, "2026-07-25", "2026-07-29");
    expect(result.totalSwapDays).toBe(1);
    expect(result.balanceByUser["user-b"]).toBe(1); // gained one day
    expect(result.balanceByUser["user-a"]).toBe(-1); // gave one day
  });

  it("balanced swap (B accepts day from A AND gives day back) nets to zero", () => {
    const events = [
      // Angelino owns 25-29; Amanda owns 30-31
      ev({ id: "reg-a", start_date: "2026-07-25", end_date: "2026-07-29", responsible_user_id: "user-a", custody_type: "regular" }),
      ev({ id: "reg-b", start_date: "2026-07-30", end_date: "2026-07-31", responsible_user_id: "user-b", custody_type: "regular" }),
      // Swap pair — Amanda gets 28, Angelino gets 30
      ev({ id: "swap-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
      ev({ id: "swap-2", start_date: "2026-07-30", end_date: "2026-07-30", responsible_user_id: "user-a", custody_type: "swap" }),
    ];
    const result = computeSwapBalance(events, COLORS, "2026-07-25", "2026-07-31");
    expect(result.totalSwapDays).toBe(2);
    expect(result.balanceByUser["user-a"]).toBe(0);
    expect(result.balanceByUser["user-b"]).toBe(0);
  });

  it("swap day where the swap restores the original owner does NOT count as imbalance", () => {
    // Edge case: a swap row that confirms the regular owner (no-op) shouldn't move the balance.
    const events = [
      ev({ id: "regular-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-a", custody_type: "regular" }),
      ev({ id: "swap-noop", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-a", custody_type: "swap" }),
    ];
    const result = computeSwapBalance(events, COLORS, "2026-07-28", "2026-07-28");
    expect(result.totalSwapDays).toBe(0);
    expect(result.balanceByUser["user-a"]).toBe(0);
    expect(result.balanceByUser["user-b"]).toBe(0);
  });

  it("days outside the requested range are ignored", () => {
    const events = [
      ev({ id: "regular-1", start_date: "2026-07-25", end_date: "2026-07-29", responsible_user_id: "user-a", custody_type: "regular" }),
      ev({ id: "swap-1", start_date: "2026-07-28", end_date: "2026-07-28", responsible_user_id: "user-b", custody_type: "swap" }),
    ];
    // Range cuts before the swap day
    const before = computeSwapBalance(events, COLORS, "2026-07-25", "2026-07-27");
    expect(before.totalSwapDays).toBe(0);
    // Range covers only the swap day
    const exact = computeSwapBalance(events, COLORS, "2026-07-28", "2026-07-28");
    expect(exact.totalSwapDays).toBe(1);
  });
});
