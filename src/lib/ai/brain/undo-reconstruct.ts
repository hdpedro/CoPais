/* ------------------------------------------------------------------ */
/* undo-reconstruct.ts — reconstrói o input do hash da linha viva (PURO) */
/*                                                                      */
/* Pro undo recomputar o schoolLogPayloadHash e comparar com o original, */
/* a linha de school_logs (+ event_time do espelho events) precisa virar */
/* um SchoolLogHashInput com a MESMA normalização do commit. Ponto       */
/* crítico: o Postgres pode devolver o horário como "HH:MM:SS" mas o     */
/* payload original tinha "HH:MM" — sem cortar pra HH:MM o hash NUNCA    */
/* bateria e o undo nunca removeria nada (todo artefato pareceria        */
/* "editado"). Aqui está o lugar único dessa normalização, testado       */
/* contra o round-trip. Puro.                                            */
/* ------------------------------------------------------------------ */

import type { SchoolLogHashInput } from "./materialize-payload";

/** Linha viva de school_logs (+ event_time do espelho events). */
export interface SchoolLogRowForUndo {
  child_id: string | null;
  log_type: string;
  title: string;
  subject: string | null;
  description: string | null;
  log_date: string; // YYYY-MM-DD
  priority: string;
  event_time: string | null; // do espelho events; "HH:MM" (TEXT) ou null
}

/**
 * Linha viva de school_logs → input do hash, IDÊNTICO ao montado no commit
 * (schoolLogPayloadHash). `events.event_time` já é "HH:MM" (TEXT); o slice(0,5)
 * é no-op defensivo. Sem isso o hash nunca bateria e o undo nunca removeria.
 */
export function reconstructHashInputFromSchoolLogRow(row: SchoolLogRowForUndo): SchoolLogHashInput {
  return {
    childId: row.child_id,
    logType: row.log_type,
    title: row.title,
    subject: row.subject,
    description: row.description,
    logDate: row.log_date,
    timeStart: row.event_time ? row.event_time.slice(0, 5) : null,
    priority: row.priority,
  };
}
