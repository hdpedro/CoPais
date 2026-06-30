/* ------------------------------------------------------------------ */
/* undo-decision.ts — undo seguro: delete vs detach (PURO)              */
/*                                                                      */
/* O undo NÃO apaga trabalho posterior. Para cada artefato criado pelo  */
/* intake: se a entidade viva ainda bate com o hash do payload original */
/* (intocada) → pode REMOVER; se divergiu (editada depois) ou já não    */
/* existe → DETACH (preserva, registra). Puro: o serviço carrega os      */
/* snapshots e aplica a decisão via RPC atômica brain_intake_apply_undo. */
/* ------------------------------------------------------------------ */

/** Artefato + hash ATUAL da entidade viva (snapshot injetado pelo serviço).
 *  O serviço recomputa `currentHash` com a função certa (school_log ou
 *  child_activity) a partir da linha viva, normalizada igual ao commit.
 *  `currentHash === null` = a entidade já não existe (foi removida por outro
 *  caminho). Desacoplado da função de hash → serve aos dois alvos. */
export interface ArtifactSnapshot {
  artifactId: string;
  entityId: string;
  originalPayloadHash: string;
  currentHash: string | null;
}

export interface UndoDecision {
  /** child_activities a remover (intocadas). */
  deleteEntityIds: string[];
  /** artefatos a destacar (editados depois / já ausentes) — preserva. */
  detachArtifactIds: string[];
  removedCount: number;
  detachedCount: number;
}

/**
 * Particiona os artefatos em "remover" (hash bate = intocado) e "detach"
 * (hash diverge = editado, ou entidade ausente). Determinístico.
 */
export function decideUndo(artifacts: ArtifactSnapshot[]): UndoDecision {
  const deleteEntityIds: string[] = [];
  const detachArtifactIds: string[] = [];

  for (const a of artifacts) {
    if (a.currentHash !== null && a.currentHash === a.originalPayloadHash) {
      deleteEntityIds.push(a.entityId); // intocada → seguro remover
    } else {
      detachArtifactIds.push(a.artifactId); // editada depois / ausente → preserva
    }
  }

  return {
    deleteEntityIds,
    detachArtifactIds,
    removedCount: deleteEntityIds.length,
    detachedCount: detachArtifactIds.length,
  };
}
