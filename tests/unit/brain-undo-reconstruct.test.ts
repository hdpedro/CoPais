import { describe, it, expect } from "vitest";
import { reconstructSpecFromActivityRow, type ActivityRowForUndo } from "@/lib/ai/brain/undo-reconstruct";
import { activityPayloadHash } from "@/lib/ai/brain/materialize-payload";
import type { ActivitySpec } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

describe("reconstructSpecFromActivityRow — round-trip de hash (anti false-detach)", () => {
  it("linha viva (time 'HH:MM:SS', checklist em items) recompõe o MESMO hash do spec original", () => {
    // Spec como o playbook produziu e o execute_plan hasheou:
    const original: ActivitySpec = {
      childId: CHILD,
      name: "Prova de Matemática",
      category: "school",
      startDate: "2026-08-12",
      timeStart: "08:00",
      notes: "Capítulos 3 e 4",
      checklist: ["Calculadora", "Régua"],
    };
    const originalHash = activityPayloadHash(original);

    // Como o Postgres devolve a linha: time com segundos, checklist em items.
    const row: ActivityRowForUndo = {
      child_id: CHILD,
      name: "Prova de Matemática",
      category: "school",
      start_date: "2026-08-12",
      time_start: "08:00:00", // <-- Postgres time inclui segundos
      notes: "Capítulos 3 e 4",
      checklist: [
        { name: "Calculadora", sort_order: 0 },
        { name: "Régua", sort_order: 1 },
      ],
    };
    expect(activityPayloadHash(reconstructSpecFromActivityRow(row))).toBe(originalHash);
  });

  it("checklist fora de ordem é reordenado por sort_order (hash estável)", () => {
    const original: ActivitySpec = {
      childId: CHILD, name: "P", category: "school", startDate: "2026-08-12",
      checklist: ["A", "B", "C"],
    };
    const row: ActivityRowForUndo = {
      child_id: CHILD, name: "P", category: "school", start_date: "2026-08-12", time_start: null, notes: null,
      checklist: [
        { name: "C", sort_order: 2 },
        { name: "A", sort_order: 0 },
        { name: "B", sort_order: 1 },
      ],
    };
    expect(activityPayloadHash(reconstructSpecFromActivityRow(row))).toBe(activityPayloadHash(original));
  });

  it("edição real (notes mudou) PRODUZ hash diferente (detecta corretamente)", () => {
    const original = activityPayloadHash({ childId: CHILD, name: "P", category: "school", startDate: "2026-08-12", notes: "v1" });
    const row: ActivityRowForUndo = {
      child_id: CHILD, name: "P", category: "school", start_date: "2026-08-12", time_start: null, notes: "v2", checklist: [],
    };
    expect(activityPayloadHash(reconstructSpecFromActivityRow(row))).not.toBe(original);
  });

  it("sem time e sem checklist recompõe (timeStart null, checklist undefined)", () => {
    const original = activityPayloadHash({ childId: CHILD, name: "P", category: "school", startDate: "2026-08-12" });
    const row: ActivityRowForUndo = {
      child_id: CHILD, name: "P", category: "school", start_date: "2026-08-12", time_start: null, notes: null, checklist: [],
    };
    expect(activityPayloadHash(reconstructSpecFromActivityRow(row))).toBe(original);
  });
});
