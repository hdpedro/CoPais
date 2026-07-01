import { describe, it, expect } from "vitest";
import { decideUndo, type ArtifactSnapshot } from "@/lib/ai/brain/undo-decision";

// decideUndo agora é AGNÓSTICO da função de hash: o serviço recomputa o hash
// da linha viva (school_log ou child_activity) e passa `currentHash`. Aqui
// usamos strings de hash diretas. (O round-trip real do hash de school_log é
// testado em brain-school-log-payload.test.ts.)

const H = "a".repeat(64);

function snap(id: string, entityId: string, currentHash: string | null, originalPayloadHash = H): ArtifactSnapshot {
  return { artifactId: id, entityId, originalPayloadHash, currentHash };
}

describe("decideUndo — preserva trabalho posterior", () => {
  it("intocada (hash bate) → REMOVE", () => {
    const d = decideUndo([snap("a1", "e1", H, H)]);
    expect(d.deleteEntityIds).toEqual(["e1"]);
    expect(d.detachArtifactIds).toEqual([]);
    expect(d.removedCount).toBe(1);
  });

  it("editada depois (hash diverge) → DETACH (não remove)", () => {
    const d = decideUndo([snap("a1", "e1", "b".repeat(64), H)]);
    expect(d.deleteEntityIds).toEqual([]);
    expect(d.detachArtifactIds).toEqual(["a1"]);
    expect(d.detachedCount).toBe(1);
  });

  it("entidade já ausente (currentHash null) → DETACH (registra, não deleta)", () => {
    const d = decideUndo([snap("a1", "e1", null, H)]);
    expect(d.deleteEntityIds).toEqual([]);
    expect(d.detachArtifactIds).toEqual(["a1"]);
  });

  it("cenário misto: '7 removidas, 1 permanece'", () => {
    const arts: ArtifactSnapshot[] = [];
    for (let i = 0; i < 7; i++) arts.push(snap(`a${i}`, `e${i}`, H, H));
    arts.push(snap("a8", "e8", "c".repeat(64), H)); // editada depois → detach
    const d = decideUndo(arts);
    expect(d.removedCount).toBe(7);
    expect(d.detachedCount).toBe(1);
    expect(d.detachArtifactIds).toEqual(["a8"]);
  });

  it("lista vazia → nada a fazer", () => {
    expect(decideUndo([])).toEqual({ deleteEntityIds: [], detachArtifactIds: [], removedCount: 0, detachedCount: 0 });
  });
});
