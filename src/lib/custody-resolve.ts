/**
 * Helper de resolução de custody — espelha a view SQL `custody_resolved`
 * (migration 00079) pro lado JS.
 *
 * # Por que existe
 *
 * O banco aceita coexistência de eventos do mesmo (group, child, dia) em
 * `custody_events` quando os tipos são diferentes — INTENCIONAL pra
 * preservar audit trail de troca aprovada (swap + regular convivem).
 *
 * Pra "quem está com a criança no dia X?", a regra é:
 *   swap > exception > regular
 * Com tie-break por `created_at DESC` (regeneração mais recente vence).
 *
 * A view `custody_resolved` aplica isso server-side mas é pesada pra
 * dashboard (expande dia-a-dia). Pro JS lado, esta lib aplica a mesma
 * regra em memória sobre o conjunto de `custody_events` já carregado.
 *
 * # Bug que motivou (2026-05-14)
 *
 * Usuário Barata (iOS) reportou: trocou final de semana com Amanda
 * (swap aprovado pra sex 15/mai → ele). Calendário refletia OK (porque
 * usa custody_resolved). Mas o dashboard mostrava "PRÓXIMA TROCA SEX
 * 15/mai · AMANDA" — porque o cálculo de "próxima troca" iterava
 * `futureEvents` por `start_date` ASC e pegava o primeiro com
 * responsible_user_id ≠ today, IGNORANDO totalmente a prioridade swap >
 * regular. Como regular tinha start_date mais antigo, regular vencia
 * pela ordenação, retornando "Amanda" quando o swap dava "Barata".
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
 * Prioridade do tipo de evento — menor número vence. Mirrors o CASE do
 * SQL view custody_resolved (migration 00079 + 00082).
 *
 * swap (1) > vacation/exception (2) > regular/holiday/special (3) > resto (4)
 *
 * Migration 00082 (2026-05-14) elevou `vacation` pra prio 2 pra que férias
 * realmente sobreponham a escala regular no calendário, agenda, streak e
 * próxima-troca. Antes vacation valia 3 = igual regular (bug Amanda).
 */
export function custodyPriority(type: string): number {
  switch (type) {
    case "swap":
      return 1;
    case "exception":
    case "vacation":
      return 2;
    case "regular":
    case "holiday":
    case "special":
      return 3;
    default:
      return 4;
  }
}

/**
 * Dado um conjunto de eventos que TODOS cobrem um mesmo dia, retorna o
 * que vence pela regra de prioridade + tie-break por created_at DESC.
 *
 * Retorna undefined apenas pra array vazio.
 */
export function pickCustodyWinner<T extends Pick<CustodyEvent, "custody_type"> & { created_at?: string | null }>(
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
      const eAt = e.created_at || "";
      const wAt = winner.created_at || "";
      if (eAt > wAt) {
        winner = e;
        winnerPrio = ePrio;
      }
    }
  }
  return winner;
}

/**
 * Verifica se um evento cobre uma data específica (inclusive nas pontas).
 * Datas em formato YYYY-MM-DD permitem comparação lexicográfica direta.
 */
function eventCoversDate(e: CustodyEvent, dateKey: string): boolean {
  return e.start_date <= dateKey && e.end_date >= dateKey;
}

/**
 * Resolve quem é o responsável pela criança no dia dado, aplicando a
 * regra swap > exception > regular > created_at DESC.
 *
 * Retorna null se não há evento cobrindo essa data.
 */
export function resolveCustodyOnDate(
  events: readonly CustodyEvent[],
  childId: string,
  dateKey: string,
): CustodyEvent | null {
  const candidates = events.filter((e) => e.child_id === childId && eventCoversDate(e, dateKey));
  return pickCustodyWinner(candidates) ?? null;
}

/**
 * Encontra a próxima troca de custódia depois de hoje, aplicando a
 * regra de prioridade pra cada dia. Itera dia-a-dia (até `horizonDays`)
 * porque é o único jeito correto de detectar transições — não dá pra
 * confiar em `start_date` do evento porque swaps unicelulares têm
 * start_date == end_date e regulares têm start_date no INÍCIO do range,
 * que pode estar no passado.
 *
 * Performance: O(horizonDays × events_count_per_child) — pra 60 dias e
 * ~20 eventos por criança, é ~1200 ops por chamada. Negligible.
 */
export function findNextCustodyHandover(
  events: readonly CustodyEvent[],
  childId: string,
  todayKey: string,
  currentResponsibleId: string,
  horizonDays = 60,
): { dateKey: string; event: CustodyEvent } | null {
  const today = new Date(todayKey + "T12:00:00");
  for (let i = 1; i <= horizonDays; i++) {
    const next = new Date(today);
    next.setDate(today.getDate() + i);
    const dateKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const winner = resolveCustodyOnDate(events, childId, dateKey);
    if (winner && winner.responsible_user_id !== currentResponsibleId) {
      return { dateKey, event: winner };
    }
  }
  return null;
}

/**
 * Resolve quem é o responsável HOJE pra cada criança no grupo, aplicando
 * prioridade swap > exception > regular > created_at DESC.
 *
 * Substitui o pattern antigo "iterar todayEvents e pegar primeiro hit"
 * que ignorava prioridade.
 */
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

/**
 * Helper interno: avança/recua N dias a partir de uma date key.
 * Adicionados como function declaration pra evitar problemas de timezone
 * com strings YYYY-MM-DD que algumas libs tratam como UTC (dia -1 em
 * timezones negativos como UTC-3/BRT).
 */
function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Computa o "streak" de custódia: por quantos dias consecutivos o
 * responsável atual está/vai estar com a criança, e em qual posição
 * desse bloco hoje cai.
 *
 * # Por que existe
 *
 * Bug Barata 2026-05-14: o cálculo antigo de streakDays/streakTotal
 * usava só `start_date`/`end_date` do EVENTO winner de hoje. Pra um
 * cenário com SWAP de 1 dia (start=end=hoje), streakDays=1 streakTotal=1
 * — mas se há swaps EMENDADOS (qui+sex+sáb+dom todos pra Barata), o
 * usuário enxerga 1 bloco contínuo de 4 dias, não 4 swaps de 1 dia.
 *
 * # Algoritmo
 *
 * 1. Pra trás: a partir de hoje, ir dia a dia até achar um dia em que
 *    o responsável MUDA. Marca o `streakStart`.
 * 2. Pra frente: idem até o `streakEnd`.
 * 3. streakDays = today - streakStart + 1
 * 4. streakTotal = streakEnd - streakStart + 1
 *
 * Cada lookup usa `resolveCustodyOnDate` (aplica swap > exception >
 * regular). Horizonte padrão de 60 dias cobre escala quinzenal
 * normalmente e blocos de troca esticados.
 *
 * Retorna `null` se não há custódia hoje pra essa criança.
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

  // Backward: encontra o primeiro dia em que o responsável passa a ser
  // o atual (sem volta).
  let streakStartKey = todayKey;
  for (let i = 1; i <= horizonDays; i++) {
    const prev = shiftDateKey(todayKey, -i);
    const winner = resolveCustodyOnDate(events, childId, prev);
    if (!winner || winner.responsible_user_id !== currentResp) break;
    streakStartKey = prev;
  }

  // Forward: encontra o último dia ainda com o responsável atual.
  let streakEndKey = todayKey;
  for (let i = 1; i <= horizonDays; i++) {
    const next = shiftDateKey(todayKey, i);
    const winner = resolveCustodyOnDate(events, childId, next);
    if (!winner || winner.responsible_user_id !== currentResp) break;
    streakEndKey = next;
  }

  // Calcula dias entre as datas inclusivo.
  const t = new Date(todayKey + "T12:00:00");
  const s = new Date(streakStartKey + "T12:00:00");
  const e = new Date(streakEndKey + "T12:00:00");
  const streakDays = Math.round((t.getTime() - s.getTime()) / 86400000) + 1;
  const streakTotal = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;

  return { streakDays, streakTotal, streakStartKey, streakEndKey };
}
