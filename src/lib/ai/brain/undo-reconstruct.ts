/* ------------------------------------------------------------------ */
/* undo-reconstruct.ts — reconstrói o spec da linha viva (PURO)         */
/*                                                                      */
/* Pro undo recomputar o activityPayloadHash e comparar com o original, */
/* a linha de child_activities precisa virar um ActivitySpec com a      */
/* MESMA normalização do commit. Ponto crítico: o Postgres devolve      */
/* `time` como "HH:MM:SS" mas o spec original tinha "HH:MM" — sem cortar */
/* pra HH:MM o hash NUNCA bateria e o undo nunca removeria nada (todo    */
/* artefato pareceria "editado"). Aqui está o lugar único dessa          */
/* normalização, testado contra o round-trip. Puro.                     */
/* ------------------------------------------------------------------ */

import type { ActivitySpec } from "./types";

export interface ChecklistItemRow {
  name: string;
  sort_order: number | null;
}

export interface ActivityRowForUndo {
  child_id: string | null;
  name: string;
  category: string;
  start_date: string; // YYYY-MM-DD
  time_start: string | null; // "HH:MM" ou "HH:MM:SS" (Postgres time)
  notes: string | null;
  checklist: ChecklistItemRow[];
}

/** Linha viva → ActivitySpec normalizado (mesmos campos hasheados no commit). */
export function reconstructSpecFromActivityRow(row: ActivityRowForUndo): ActivitySpec {
  const checklist = row.checklist
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c) => c.name);
  return {
    childId: row.child_id,
    name: row.name,
    category: row.category as ActivitySpec["category"],
    startDate: row.start_date,
    timeStart: row.time_start ? row.time_start.slice(0, 5) : null,
    notes: row.notes,
    checklist: checklist.length > 0 ? checklist : undefined,
  };
}
