/**
 * Helper de detecção defensiva de overlap em custody_events.
 *
 * Contexto (Fase Calendar 1, migration 00079): depois do trigger BEFORE
 * INSERT + EXCLUDE constraint, é IMPOSSÍVEL inserir custody_event do
 * mesmo tipo sobrepondo outro pro mesmo (group, child). Mas mantemos
 * detecção no client como defesa em profundidade — se algum bypass
 * acontecer (raw SQL via admin, edge function que esquece o trigger,
 * dados legados via restore de backup), o problema vira VISÍVEL via
 * PostHog em vez de silencioso.
 *
 * Custo: O(n) por render. Pra n ~50-200 custody_events ativos é
 * imperceptível. Não rodar isso em loop apertado.
 */

export interface CustodyEventLite {
  id: string;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string;
  custody_type: string;
  child_id: string | null;
  group_id?: string;
}

export interface OverlapReport {
  hasOverlap: boolean;
  /** Pares conflitantes pra debug. Limitado a 5 pra não explodir log. */
  conflicts: Array<{
    a_id: string;
    b_id: string;
    custody_type: string;
    overlap_start: string;
    overlap_end: string;
  }>;
}

/**
 * Detecta sobreposição de ranges do MESMO TIPO no mesmo (child).
 * Swap+regular coexistindo NÃO é overlap (intencional).
 *
 * Returns { hasOverlap, conflicts } — caller decide se loga ou alerta.
 */
export function detectCustodyOverlap(events: CustodyEventLite[]): OverlapReport {
  // Agrupa por (child_id, custody_type) — só compara dentro do mesmo bucket.
  const buckets = new Map<string, CustodyEventLite[]>();
  for (const e of events) {
    const key = `${e.child_id ?? "__group__"}__${e.custody_type}`;
    const arr = buckets.get(key) || [];
    arr.push(e);
    buckets.set(key, arr);
  }

  const conflicts: OverlapReport["conflicts"] = [];
  for (const [, arr] of buckets) {
    if (arr.length < 2) continue;
    // Ordena por start_date. Depois compara cada par adjacente —
    // se A.end >= B.start, há overlap. Suficiente pra detecção:
    // overlap entre não-adjacentes implica overlap também adjacente
    // depois do sort (range comparativo).
    const sorted = [...arr].sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.end_date >= b.start_date) {
        conflicts.push({
          a_id: a.id,
          b_id: b.id,
          custody_type: a.custody_type,
          overlap_start: b.start_date,
          overlap_end: a.end_date < b.end_date ? a.end_date : b.end_date,
        });
        if (conflicts.length >= 5) break;
      }
    }
    if (conflicts.length >= 5) break;
  }

  return { hasOverlap: conflicts.length > 0, conflicts };
}
