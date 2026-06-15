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
  /** child_id é nullable — NULL = evento de grupo (família toda). Paridade
   *  com src/lib/custody-resolve.ts (PWA). Migration vacation 00082. */
  child_id: string | null;
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
    // child_id nullable (eventos grupais) — chave especial "__group__"
    const key = e.child_id ?? '__group__';
    const arr = byChild.get(key) || [];
    arr.push(e);
    byChild.set(key, arr);
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

export interface CustodyRhythmCell {
  dateKey: string;
  responsibleUserId: string | null;
  isToday: boolean;
}

export interface CustodyRhythmRow {
  /** Filho(s) com ritmo idêntico nesta janela (agrupados). */
  childIds: string[];
  cells: CustodyRhythmCell[];
  todayResponsibleId: string | null;
  streakDays: number;
  streakTotal: number;
  /** Dias do bloco atual à esquerda da janela (pro componente mostrar "+N"). */
  truncatedBefore: number;
}

/**
 * Ritmo da guarda ancorado no BLOCO (não na semana do calendário).
 * Espelho EXATO de src/lib/custody-resolve.ts (PWA) — manter idêntico.
 *
 * Bug Barata 2026-06-15: a faixa fixa "Seg→Dom" não consegue mostrar um
 * bloco de guarda que cruza a virada de semana (ex.: qui 11 → seg 15), então
 * exibe 1 de 5 dias enquanto o texto diz "5 de 5 consecutivos". A janela
 * rolante ancorada no bloco conserta — e, por medir o bloco empiricamente,
 * encaixa em qualquer arranjo (7/7, 2-2-3, 5-2, fim de semana alternado,
 * custom, com swap/férias). Split: agrupa filhos com ritmo idêntico; ritmos
 * distintos viram linhas separadas (uma faixa por filho).
 */
export function buildCustodyRhythm(
  events: readonly CustodyEvent[],
  childIds: readonly string[],
  todayKey: string,
  opts?: { lead?: number; trail?: number },
): CustodyRhythmRow[] {
  const lead = opts?.lead ?? 4;
  const trail = opts?.trail ?? 2;
  const windowStartKey = shiftDateKey(todayKey, -lead);

  const perChild = childIds.map((childId) => {
    const cells: CustodyRhythmCell[] = [];
    for (let i = -lead; i <= trail; i++) {
      const dateKey = shiftDateKey(todayKey, i);
      const winner = resolveCustodyOnDate(events, childId, dateKey);
      cells.push({
        dateKey,
        responsibleUserId: winner?.responsible_user_id ?? null,
        isToday: i === 0,
      });
    }
    const streak = computeCustodyStreak(events, childId, todayKey);
    let truncatedBefore = 0;
    if (streak && streak.streakStartKey < windowStartKey) {
      const a = new Date(streak.streakStartKey + 'T12:00:00').getTime();
      const b = new Date(windowStartKey + 'T12:00:00').getTime();
      truncatedBefore = Math.round((b - a) / 86400000);
    }
    return {
      childId,
      cells,
      todayResponsibleId: cells[lead]?.responsibleUserId ?? null,
      streakDays: streak?.streakDays ?? 0,
      streakTotal: streak?.streakTotal ?? 0,
      truncatedBefore,
      sig: cells.map((c) => c.responsibleUserId ?? '·').join('|'),
    };
  });

  const order: string[] = [];
  const bySig = new Map<string, (typeof perChild)[number][]>();
  for (const pc of perChild) {
    const bucket = bySig.get(pc.sig);
    if (bucket) bucket.push(pc);
    else {
      bySig.set(pc.sig, [pc]);
      order.push(pc.sig);
    }
  }
  return order.map((sig) => {
    const group = bySig.get(sig)!;
    const first = group[0];
    return {
      childIds: group.map((g) => g.childId),
      cells: first.cells,
      todayResponsibleId: first.todayResponsibleId,
      streakDays: first.streakDays,
      streakTotal: first.streakTotal,
      truncatedBefore: first.truncatedBefore,
    };
  });
}
