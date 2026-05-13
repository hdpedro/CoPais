/**
 * Helper de detecção defensiva de overlap em custody_events.
 * Mirror of src/lib/calendar-overlap-detect.ts (PWA) — sem package
 * manager compartilhado, então duplicamos. Drift-guard: se mudar
 * lá, mude aqui também. Ambos cabem em 60 linhas.
 *
 * Vide migration 00079 + PostHog event CUSTODY_OVERLAP_DETECTED.
 */

export interface CustodyEventLite {
  id: string;
  start_date: string;
  end_date: string;
  custody_type: string;
  child_id: string | null;
  group_id?: string;
}

export interface OverlapReport {
  hasOverlap: boolean;
  conflicts: Array<{
    a_id: string;
    b_id: string;
    custody_type: string;
    overlap_start: string;
    overlap_end: string;
  }>;
}

export function detectCustodyOverlap(events: CustodyEventLite[]): OverlapReport {
  const buckets = new Map<string, CustodyEventLite[]>();
  for (const e of events) {
    const key = `${e.child_id ?? '__group__'}__${e.custody_type}`;
    const arr = buckets.get(key) || [];
    arr.push(e);
    buckets.set(key, arr);
  }

  const conflicts: OverlapReport['conflicts'] = [];
  for (const [, arr] of buckets) {
    if (arr.length < 2) continue;
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
