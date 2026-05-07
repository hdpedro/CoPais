/**
 * Calendar balance — porta direta de src/lib/calendar-utils.ts (PWA).
 *
 * Por que existe: ate hoje o native calculava saldo de dias APENAS via
 * `custody_balance_operations` (computeBalanceFromOps). Isso ignorava
 * swaps automaticos aprovados (que viram custody_events com type='swap').
 * Resultado: usuario cedia 5 dias, swap aprovado, custody_events criados,
 * mas saldo no card aparecia zero.
 *
 * Paridade obrigatoria pelo CLAUDE.md: PWA usa computeSwapBalance(events)
 * + getEffectiveBalance(operations) — native faz o mesmo agora.
 *
 * SoT continua no service (PWA src/lib/services/swap.ts) — esta logica
 * e PURE COMPUTATION sobre dados ja sincronizados via supabase, entao
 * duplicar aqui e seguro (e necessario porque o PWA roda em Next/Node
 * e o native em React Native, sem monorepo compartilhado).
 */

export interface CustodyEventRaw {
  id: string;
  responsible_user_id: string;
  start_date: string;
  end_date: string;
  custody_type: string;
}

export interface BalanceOperationRaw {
  id: string;
  operation_type: string;
  status: string;
  days: number;
  proposed_by: string;
  target_user_id: string;
  responded_at: string | null;
  created_at: string;
}

export interface SwapBalance {
  balanceByUser: Record<string, number>;
  totalSwapDays: number;
}

export interface EffectiveBalance {
  rawBalance: SwapBalance;
  ledgerAdjustments: Record<string, number>;
  effectiveByUser: Record<string, number>;
  totalSwapDays: number;
  pendingOperations: number;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

interface DayInfo {
  userId: string;
}

/**
 * Build a map of date -> owner. Priority: swap > exception > regular.
 * Match PWA `buildCustodyMap` em src/lib/calendar-utils.ts:99.
 *
 * Ordem de processamento garante que `map.set` posterior sobrescreve o
 * anterior — entao processamos regular primeiro, exception no meio, swap
 * por ultimo. Sem isso o saldo nao detecta o swap (regular sobrescreveria).
 */
function buildCustodyMap(events: CustodyEventRaw[], userIds: Set<string>): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  const ordered = [
    ...events.filter((e) => e.custody_type !== 'swap' && e.custody_type !== 'exception'),
    ...events.filter((e) => e.custody_type === 'exception'),
    ...events.filter((e) => e.custody_type === 'swap'),
  ];
  for (const event of ordered) {
    if (!userIds.has(event.responsible_user_id)) continue;
    const start = parseDateKey(event.start_date);
    const end = parseDateKey(event.end_date);
    const cursor = new Date(start);
    while (cursor <= end) {
      map.set(formatDateKey(cursor), { userId: event.responsible_user_id });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

/**
 * Compute raw swap balance comparando regular schedule vs actual (com swaps).
 *
 * Cada dia onde o owner mudou (regular != actual) conta:
 *   actualOwner += 1   (ganhou um dia que nao era seu)
 *   regularOwner -= 1  (cedeu um dia que era seu)
 *
 * Range: passa-se startDate/endDate. Se nao passar, usa o range coberto
 * pelos events (min start_date -> max end_date) — com fallback de hoje
 * se array vazio.
 */
export function computeSwapBalance(
  events: CustodyEventRaw[],
  parentIds: string[],
  startDate?: string,
  endDate?: string,
): SwapBalance {
  const userIdSet = new Set(parentIds);
  const balanceByUser: Record<string, number> = {};
  for (const id of parentIds) balanceByUser[id] = 0;

  if (events.length === 0) {
    return { balanceByUser, totalSwapDays: 0 };
  }

  // Determine range from events if not provided
  let rangeStart = startDate;
  let rangeEnd = endDate;
  if (!rangeStart || !rangeEnd) {
    let minStart = events[0].start_date;
    let maxEnd = events[0].end_date;
    for (const e of events) {
      if (e.start_date < minStart) minStart = e.start_date;
      if (e.end_date > maxEnd) maxEnd = e.end_date;
    }
    rangeStart = rangeStart || minStart;
    rangeEnd = rangeEnd || maxEnd;
  }

  const regularMap = buildCustodyMap(
    events.filter((e) => e.custody_type !== 'swap'),
    userIdSet,
  );
  const allMap = buildCustodyMap(events, userIdSet);

  let totalSwapDays = 0;
  const cursor = parseDateKey(rangeStart);
  const endParsed = parseDateKey(rangeEnd);
  while (cursor <= endParsed) {
    const key = formatDateKey(cursor);
    const regularInfo = regularMap.get(key);
    const actualInfo = allMap.get(key);
    if (
      regularInfo &&
      actualInfo &&
      regularInfo.userId !== actualInfo.userId &&
      userIdSet.has(regularInfo.userId) &&
      userIdSet.has(actualInfo.userId)
    ) {
      balanceByUser[actualInfo.userId] = (balanceByUser[actualInfo.userId] || 0) + 1;
      balanceByUser[regularInfo.userId] = (balanceByUser[regularInfo.userId] || 0) - 1;
      totalSwapDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { balanceByUser, totalSwapDays };
}

/**
 * Apply ledger operations on top of the raw swap balance.
 * - debit/credit/manual_adjustment: ja refletido no raw (custody_events)
 * - waive/gift_day: cancela o +/-1 que o swap causou no raw
 * - forgive_balance: reduz divida do target em N dias
 * - reset_balance: zera tudo
 *
 * Match PWA src/lib/calendar-utils.ts:259 `getEffectiveBalance`.
 */
export function getEffectiveBalance(
  rawBalance: SwapBalance,
  operations: BalanceOperationRaw[],
): EffectiveBalance {
  const adjustments: Record<string, number> = {};
  const effective: Record<string, number> = { ...rawBalance.balanceByUser };

  for (const uid of Object.keys(rawBalance.balanceByUser)) {
    adjustments[uid] = 0;
  }

  let pendingOperations = 0;
  let resetApplied = false;

  const sorted = [...operations].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const op of sorted) {
    if (op.status === 'pending') {
      pendingOperations++;
      continue;
    }
    if (op.status !== 'approved') continue;

    switch (op.operation_type) {
      case 'waive':
      case 'gift_day': {
        const proposer = op.proposed_by;
        const target = op.target_user_id;
        const days = op.days || 1;
        adjustments[proposer] = (adjustments[proposer] || 0) - days;
        adjustments[target] = (adjustments[target] || 0) + days;
        break;
      }
      case 'forgive_balance': {
        const proposer = op.proposed_by;
        const target = op.target_user_id;
        const days = op.days || 1;
        adjustments[target] = (adjustments[target] || 0) + days;
        adjustments[proposer] = (adjustments[proposer] || 0) - days;
        break;
      }
      case 'reset_balance': {
        resetApplied = true;
        for (const uid of Object.keys(adjustments)) {
          adjustments[uid] = -(rawBalance.balanceByUser[uid] || 0);
        }
        break;
      }
      // debit / credit / manual_adjustment / default: no-op
    }
  }

  if (resetApplied) {
    for (const uid of Object.keys(effective)) {
      effective[uid] = 0;
    }
  } else {
    for (const uid of Object.keys(effective)) {
      effective[uid] = (rawBalance.balanceByUser[uid] || 0) + (adjustments[uid] || 0);
    }
  }

  return {
    rawBalance,
    ledgerAdjustments: adjustments,
    effectiveByUser: effective,
    totalSwapDays: rawBalance.totalSwapDays,
    pendingOperations,
  };
}
