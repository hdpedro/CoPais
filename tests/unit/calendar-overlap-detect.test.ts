import { describe, it, expect } from "vitest";
import { detectCustodyOverlap } from "@/lib/calendar-overlap-detect";

/**
 * Tests pro helper de detecção de overlap em custody_events.
 *
 * Importante: a detecção considera overlap SOMENTE entre rows do MESMO
 * custody_type pro mesmo (group, child). Swap+regular coexistindo é
 * intencional (audit trail de troca aprovada — render aplica swap-wins).
 */

describe("detectCustodyOverlap", () => {
  it("vazio → sem overlap", () => {
    const r = detectCustodyOverlap([]);
    expect(r.hasOverlap).toBe(false);
    expect(r.conflicts).toHaveLength(0);
  });

  it("rows isoladas (sem overlap) → sem report", () => {
    const r = detectCustodyOverlap([
      { id: "a", start_date: "2026-05-01", end_date: "2026-05-05", custody_type: "regular", child_id: "c1" },
      { id: "b", start_date: "2026-05-06", end_date: "2026-05-10", custody_type: "regular", child_id: "c1" },
    ]);
    expect(r.hasOverlap).toBe(false);
  });

  it("rows adjacentes (end_date = next.start_date) DETECTAM overlap (mesmo dia)", () => {
    // daterange '[]' inclui as duas pontas — A.end = B.start é overlap.
    const r = detectCustodyOverlap([
      { id: "a", start_date: "2026-05-01", end_date: "2026-05-05", custody_type: "regular", child_id: "c1" },
      { id: "b", start_date: "2026-05-05", end_date: "2026-05-10", custody_type: "regular", child_id: "c1" },
    ]);
    expect(r.hasOverlap).toBe(true);
    expect(r.conflicts[0].overlap_start).toBe("2026-05-05");
  });

  it("range completamente contido em outro do mesmo tipo → overlap", () => {
    const r = detectCustodyOverlap([
      { id: "outer", start_date: "2026-05-01", end_date: "2026-05-31", custody_type: "regular", child_id: "c1" },
      { id: "inner", start_date: "2026-05-10", end_date: "2026-05-15", custody_type: "regular", child_id: "c1" },
    ]);
    expect(r.hasOverlap).toBe(true);
  });

  it("swap + regular no mesmo dia NÃO é overlap (tipos diferentes)", () => {
    const r = detectCustodyOverlap([
      { id: "reg", start_date: "2026-05-14", end_date: "2026-05-16", custody_type: "regular", child_id: "c1" },
      { id: "swp", start_date: "2026-05-14", end_date: "2026-05-14", custody_type: "swap", child_id: "c1" },
    ]);
    expect(r.hasOverlap).toBe(false);
  });

  it("crianças diferentes NÃO é overlap (mesmo se mesmo tipo + datas)", () => {
    const r = detectCustodyOverlap([
      { id: "a", start_date: "2026-05-01", end_date: "2026-05-10", custody_type: "regular", child_id: "c1" },
      { id: "b", start_date: "2026-05-01", end_date: "2026-05-10", custody_type: "regular", child_id: "c2" },
    ]);
    expect(r.hasOverlap).toBe(false);
  });

  it("child_id null (eventos de grupo) compara com outros null mas não com c1", () => {
    const r = detectCustodyOverlap([
      { id: "a", start_date: "2026-05-01", end_date: "2026-05-10", custody_type: "regular", child_id: null },
      { id: "b", start_date: "2026-05-05", end_date: "2026-05-15", custody_type: "regular", child_id: null },
      { id: "c", start_date: "2026-05-05", end_date: "2026-05-15", custody_type: "regular", child_id: "c1" },
    ]);
    expect(r.hasOverlap).toBe(true);
    // só o par (a, b) — não inclui o c
    expect(r.conflicts).toHaveLength(1);
    expect([r.conflicts[0].a_id, r.conflicts[0].b_id].sort()).toEqual(["a", "b"]);
  });

  it("caso real Hailla: 08-11 + 08-09 (mesmo tipo, owner igual) → overlap", () => {
    const r = detectCustodyOverlap([
      { id: "antigo", start_date: "2026-05-08", end_date: "2026-05-11", custody_type: "regular", child_id: "g1" },
      { id: "novo",   start_date: "2026-05-08", end_date: "2026-05-09", custody_type: "regular", child_id: "g1" },
    ]);
    expect(r.hasOverlap).toBe(true);
    expect(r.conflicts[0].overlap_start).toBe("2026-05-08");
    expect(r.conflicts[0].overlap_end).toBe("2026-05-09");
  });

  it("limita conflicts a 5 (não explode log)", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      custody_type: "regular",
      child_id: "c1",
    }));
    const r = detectCustodyOverlap(events);
    expect(r.hasOverlap).toBe(true);
    expect(r.conflicts.length).toBeLessThanOrEqual(5);
  });
});
