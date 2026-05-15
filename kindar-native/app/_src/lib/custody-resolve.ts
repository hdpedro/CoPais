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

/**
 * Migration 00082 (2026-05-14): `vacation` virou prio 2 (antes era 3 =
 * igual regular). Pra que férias realmente sobreponham a escala regular
 * no calendário, agenda, streak e próxima-troca. Mantém paridade com
 * `src/lib/custody-resolve.ts` PWA + view SQL `custody_resolved`.
 */
export function custodyPriority(type: string): number {
  switch (type) {
    case 'swap':
      return 1;
    case 'exception':
    case 'vacation':
      return 2;
    case 'regular':
    case 'holiday':
    case 'special':
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

function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Streak da custódia atual (espelho do PWA src/lib/custody-resolve.ts).
 * Encontra o bloco consecutivo de dias com o mesmo responsável.
 *
 * Bug Barata 2026-05-14: cálculo antigo usava só start/end do evento
 * winner de HOJE (swap 1 dia → 1/1). Pra 4 swaps emendados, ele via
 * só o swap de hoje e mostrava "Dia 1 de 1" em vez de "Dia 1 de 4".
 *
 * Algoritmo: backward + forward até achar dias em que o responsável
 * muda. Aplica swap > exception > regular em cada lookup.
 */
export function computeCustodyStreak(
  events: readonly CustodyEvent[],
  childId: string,
  todayKey: string,
  horizonDays = 60,
): { streakDays: number; streakTotal: number; streakStartKey: string; streakEndKey: string } | null {
  const todayWinner = resolveCustodyOnDate(events, childId, todayKey);
  if (!todayWinner) return null;
  const currentResp = todayWinner.responsible_user_id;

  let streakStartKey = todayKey;
  for (let i = 1; i <= horizonDays; i++) {
    const prev = shiftDateKey(todayKey, -i);
    const winner = resolveCustodyOnDate(events, childId, prev);
    if (!winner || winner.responsible_user_id !== currentResp) break;
    streakStartKey = prev;
  }

  let streakEndKey = todayKey;
  for (let i = 1; i <= horizonDays; i++) {
    const next = shiftDateKey(todayKey, i);
    const winner = resolveCustodyOnDate(events, childId, next);
    if (!winner || winner.responsible_user_id !== currentResp) break;
    streakEndKey = next;
  }

  const t = new Date(todayKey + 'T12:00:00');
  const s = new Date(streakStartKey + 'T12:00:00');
  const e = new Date(streakEndKey + 'T12:00:00');
  const streakDays = Math.round((t.getTime() - s.getTime()) / 86400000) + 1;
  const streakTotal = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;

  return { streakDays, streakTotal, streakStartKey, streakEndKey };
}
