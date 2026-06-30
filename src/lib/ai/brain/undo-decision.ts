/* ------------------------------------------------------------------ */
/* undo-decision.ts — undo seguro: delete vs detach (PURO)              */
/*                                                                      */
/* O undo NÃO apaga trabalho posterior. Para cada artefato criado pelo  */
/* intake: se a entidade viva ainda bate com o hash do payload original */
/* (intocada) → pode REMOVER; se divergiu (editada depois) ou já não    */
/* existe → DETACH (preserva, registra). Puro: o serviço carrega os      */
/* snapshots e aplica a decisão via RPC atômica brain_intake_apply_undo. */
/* ------------------------------------------------------------------ */

import { activityPayloadHash } from "./materialize-payload";
import type { ActivitySpec } from "./types";

/** Artefato + estado vivo da entidade (snapshot injetado pelo serviço).
 *  `live` = a atividade reconstruída da linha de child_activities (com os
 *  mesmos campos/normalização do spec original); null se já não existe. */
export interface ArtifactSnapshot {
  artifactId: string;
  entityId: string;
  originalPayloadHash: string;
  live: ActivitySpec | null;
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
    if (a.live === null) {
      // já removida por outro caminho → nada a deletar; registra o detach.
      detachArtifactIds.push(a.artifactId);
      continue;
    }
    if (activityPayloadHash(a.live) === a.originalPayloadHash) {
      deleteEntityIds.push(a.entityId); // intocada → seguro remover
    } else {
      detachArtifactIds.push(a.artifactId); // editada depois → preserva
    }
  }

  return {
    deleteEntityIds,
    detachArtifactIds,
    removedCount: deleteEntityIds.length,
    detachedCount: detachArtifactIds.length,
  };
}
