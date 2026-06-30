import { describe, it, expect } from "vitest";
import { decideUndo, type ArtifactSnapshot } from "@/lib/ai/brain/undo-decision";
import { activityPayloadHash } from "@/lib/ai/brain/materialize-payload";
import type { ActivitySpec } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

function spec(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return { childId: CHILD, name: "Prova de Matemática", category: "school", startDate: "2026-08-12", ...over };
}

function snap(id: string, entityId: string, live: ActivitySpec | null, hashFrom?: ActivitySpec): ArtifactSnapshot {
  return {
    artifactId: id,
    entityId,
    originalPayloadHash: activityPayloadHash(hashFrom ?? live ?? spec()),
    live,
  };
}

describe("decideUndo — preserva trabalho posterior", () => {
  it("intocada (hash bate) → REMOVE", () => {
    const s = spec();
    const d = decideUndo([snap("a1", "e1", s, s)]);
    expect(d.deleteEntityIds).toEqual(["e1"]);
    expect(d.detachArtifactIds).toEqual([]);
    expect(d.removedCount).toBe(1);
  });

  it("editada depois (hash diverge) → DETACH (não remove)", () => {
    // original tinha notes "cap 3"; a viva foi editada pra "cap 5"
    const original = spec({ notes: "cap 3" });
    const live = spec({ notes: "cap 5" });
    const d = decideUndo([{ artifactId: "a1", entityId: "e1", originalPayloadHash: activityPayloadHash(original), live }]);
    expect(d.deleteEntityIds).toEqual([]);
    expect(d.detachArtifactIds).toEqual(["a1"]);
    expect(d.detachedCount).toBe(1);
  });

  it("entidade já ausente → DETACH (registra, não tenta deletar)", () => {
    const d = decideUndo([snap("a1", "e1", null, spec())]);
    expect(d.deleteEntityIds).toEqual([]);
    expect(d.detachArtifactIds).toEqual(["a1"]);
  });

  it("cenário misto: '7 removidas, 1 permanece'", () => {
    const arts: ArtifactSnapshot[] = [];
    for (let i = 0; i < 7; i++) {
      const s = spec({ name: `Prova ${i}`, startDate: "2026-08-12" });
      arts.push(snap(`a${i}`, `e${i}`, s, s));
    }
    // a8 foi editada depois
    const orig = spec({ name: "Prova 8", notes: "x" });
    arts.push({ artifactId: "a8", entityId: "e8", originalPayloadHash: activityPayloadHash(orig), live: spec({ name: "Prova 8", notes: "EDITADO" }) });

    const d = decideUndo(arts);
    expect(d.removedCount).toBe(7);
    expect(d.detachedCount).toBe(1);
    expect(d.detachArtifactIds).toEqual(["a8"]);
  });

  it("lista vazia → nada a fazer", () => {
    expect(decideUndo([])).toEqual({ deleteEntityIds: [], detachArtifactIds: [], removedCount: 0, detachedCount: 0 });
  });
});
