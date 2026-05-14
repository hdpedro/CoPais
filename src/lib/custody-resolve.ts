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
 * SQL view custody_resolved.
 *
 * swap (1) > exception (2) > regular (3) > tudo o resto (4)
 */
export function custodyPriority(type: string): number {
  switch (type) {
    case "swap":
      return 1;
    case "exception":
      return 2;
    case "regular":
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
