/**
 * Espelho do src/lib/custody-resolve.ts do PWA.
 *
 * Mantida cópia em vez de import shared porque o native usa paths
 * relativos do `app/_src/` e o PWA importa via `@/lib/...`. As duas
 * versões DEVEM permanecer idênticas em comportamento — qualquer
 * mudança aqui replicar lá e vice-versa.
 *
 * Vide migration 00079 (view custody_resolved) e bug Barata 2026-05-14
 * pra contexto completo.
 */

export type CustodyEvent = {
  id: string;
  child_id: string;
  start_date: string;
  end_date: string;
  responsible_user_id: string;
  custody_type: string;
  created_at?: string | null;
};

export function custodyPriority(type: string): number {
  switch (type) {
    case 'swap':
      return 1;
    case 'exception':
      return 2;
    case 'regular':
      return 3;
    default:
      return 4;
  }
}

export function pickCustodyWinner<T extends Pick<CustodyEvent, 'custody_type'> & { created_at?: string | null }>(
  events: readonly T[],
): T | undefined {
  if (events.length === 0) return undefined;
  if (events.length === 1) return events[0];
  let winner = events[0];
  let winnerPrio = custodyPriority(winner.custody_type);
  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    const ePrio = custodyPriority(e.custody_type);
    if (ePrio < winnerPrio) {
      winner = e;
      winnerPrio = ePrio;
    } else if (ePrio === winnerPrio) {
      const eAt = e.created_at || '';
      const wAt = winner.created_at || '';
      if (eAt > wAt) {
        winner = e;
        winnerPrio = ePrio;
      }
    }
  }
  return winner;
}

function eventCoversDate(e: CustodyEvent, dateKey: string): boolean {
  return e.start_date <= dateKey && e.end_date >= dateKey;
}

export function resolveCustodyOnDate(
  events: readonly CustodyEvent[],
  childId: string,
  dateKey: string,
): CustodyEvent | null {
  const candidates = events.filter((e) => e.child_id === childId && eventCoversDate(e, dateKey));
  return pickCustodyWinner(candidates) ?? null;
}

export function findNextCustodyHandover(
  events: readonly CustodyEvent[],
  childId: string,
  todayKey: string,
  currentResponsibleId: string,
  horizonDays = 60,
): { dateKey: string; event: CustodyEvent } | null {
  const today = new Date(todayKey + 'T12:00:00');
  for (let i = 1; i <= horizonDays; i++) {
    const next = new Date(today);
    next.setDate(today.getDate() + i);
    const dateKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    const winner = resolveCustodyOnDate(events, childId, dateKey);
    if (winner && winner.responsible_user_id !== currentResponsibleId) {
      return { dateKey, event: winner };
    }
  }
  return null;
}

export function resolveTodayCustody<E extends CustodyEvent>(
  todayEvents: readonly E[],
  todayKey: string,
): Map<string, E> {
  const byChild = new Map<string, E[]>();
  for (const e of todayEvents) {
    if (!eventCoversDate(e, todayKey)) continue;
    const arr = byChild.get(e.child_id) || [];
    arr.push(e);
    byChild.set(e.child_id, arr);
  }
  const out = new Map<string, E>();
  for (const [childId, events] of byChild.entries()) {
    const winner = pickCustodyWinner(events);
    if (winner) out.set(childId, winner);
  }
  return out;
}
