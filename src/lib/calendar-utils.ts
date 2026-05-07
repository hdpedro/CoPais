export interface CustodyEvent {
  id: string;
  group_id: string;
  child_id: string;
  responsible_user_id: string;
  start_date: string;
  end_date: string;
  custody_type: string;
  notes: string | null;
  created_by: string;
  children?: { full_name: string } | null;
  profiles?: { full_name: string } | null;
}

export interface CustodyDayInfo {
  userId: string;
  userName: string;
  color: string;
}

export interface WeekendInfo {
  satDate: string;
  sunDate: string;
  satInfo: CustodyDayInfo | null;
  sunInfo: CustodyDayInfo | null;
  status: "livre" | "parcial" | "ocupado" | "sem_info";
}

export interface ParentColorMap {
  [userId: string]: { name: string; color: string };
}

/** Get today's date in YYYY-MM-DD format using Brazil timezone (America/Sao_Paulo) */
export function getBrazilToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Get a Date object representing the current time in Brazil (America/Sao_Paulo) */
export function getBrazilNow(): Date {
  const now = new Date();
  const brazilStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(brazilStr);
}

/** Format date as YYYY-MM-DD */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD to Date (local timezone) */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Get number of days in a month */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Build a 6×7 grid of date strings for display, including padding from prev/next months */
export function getMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = getDaysInMonth(year, month);
  const grid: (string | null)[][] = [];
  let day = 1 - firstDayOfWeek;

  for (let week = 0; week < 6; week++) {
    const row: (string | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (day >= 1 && day <= daysInMonth) {
        row.push(formatDateKey(new Date(year, month, day)));
      } else {
        row.push(null);
      }
      day++;
    }
    // Skip empty trailing weeks
    if (row.every((d) => d === null)) break;
    grid.push(row);
  }
  return grid;
}

/** Build a map of date -> custody info from events array.
 *
 * Tie-break: when two events cover the same date (e.g., a multi-day
 * `regular` range and a single-day `swap` row for one day inside it,
 * or two single-day rows with the same start_date), `custody_type='swap'`
 * MUST override `regular`. Without this guarantee `respondToSwapRequest`
 * inserts the new swap row but the calendar can still render the old
 * owner depending on row insertion order, leaving the day visually
 * unchanged after approval. Fix is order-independent: process regular
 * rows first, then swap rows so the latter's `map.set` wins.
 */
export function buildCustodyMap(
  events: CustodyEvent[],
  parentColors: ParentColorMap
): Map<string, CustodyDayInfo> {
  const map = new Map<string, CustodyDayInfo>();

  // Stable partition — regular first, swap last. Other custody_type values
  // (e.g. future "exception") sit between the two so they neither override
  // swaps nor are overridden by regulars.
  const ordered = [
    ...events.filter((e) => e.custody_type !== "swap" && e.custody_type !== "exception"),
    ...events.filter((e) => e.custody_type === "exception"),
    ...events.filter((e) => e.custody_type === "swap"),
  ];

  for (const event of ordered) {
    const start = parseDateKey(event.start_date);
    const end = parseDateKey(event.end_date);
    const parentInfo = parentColors[event.responsible_user_id];
    if (!parentInfo) continue;

    const current = new Date(start);
    while (current <= end) {
      map.set(formatDateKey(current), {
        userId: event.responsible_user_id,
        userName: parentInfo.name,
        color: parentInfo.color,
      });
      current.setDate(current.getDate() + 1);
    }
  }
  return map;
}

/** Get the next N weekends with custody info */
export function getNextWeekends(
  count: number,
  custodyMap: Map<string, CustodyDayInfo>,
  currentUserId: string
): WeekendInfo[] {
  const weekends: WeekendInfo[] = [];
  const today = getBrazilNow();
  // Find next Saturday
  const current = new Date(today);
  const dayOfWeek = current.getDay();
  const daysUntilSat = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  current.setDate(current.getDate() + daysUntilSat);

  for (let i = 0; i < count; i++) {
    const satKey = formatDateKey(current);
    const sun = new Date(current);
    sun.setDate(sun.getDate() + 1);
    const sunKey = formatDateKey(sun);

    const satInfo = custodyMap.get(satKey) || null;
    const sunInfo = custodyMap.get(sunKey) || null;

    let status: WeekendInfo["status"] = "sem_info";
    if (satInfo && sunInfo) {
      const satIsOther = satInfo.userId !== currentUserId;
      const sunIsOther = sunInfo.userId !== currentUserId;
      if (satIsOther && sunIsOther) status = "livre";
      else if (!satIsOther && !sunIsOther) status = "ocupado";
      else status = "parcial";
    } else if (satInfo || sunInfo) {
      status = "parcial";
    }

    weekends.push({ satDate: satKey, sunDate: sunKey, satInfo, sunInfo, status });
    current.setDate(current.getDate() + 7);
  }
  return weekends;
}

export interface SwapBalance {
  balanceByUser: Record<string, number>;
  totalSwapDays: number;
}

/** Compute swap balance between parents by comparing regular schedule vs actual (with swaps) */
export function computeSwapBalance(
  events: CustodyEvent[],
  parentColors: ParentColorMap,
  startDate: string,
  endDate: string
): SwapBalance {
  const parentIds = new Set(Object.keys(parentColors));

  // Build regular-only map (original schedule without swaps)
  const regularEvents = events.filter((e) => e.custody_type !== "swap");
  const regularMap = buildCustodyMap(regularEvents, parentColors);

  // Build all-events map (actual schedule including swaps)
  const allMap = buildCustodyMap(events, parentColors);

  const balanceByUser: Record<string, number> = {};
  for (const id of parentIds) {
    balanceByUser[id] = 0;
  }

  let totalSwapDays = 0;

  // Iterate through each date in the range
  const current = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  while (current <= end) {
    const key = formatDateKey(current);
    const regularInfo = regularMap.get(key);
    const actualInfo = allMap.get(key);

    // Only count when the responsible parent changed due to a swap
    if (regularInfo && actualInfo && regularInfo.userId !== actualInfo.userId) {
      // Only track balance between actual parents
      if (parentIds.has(regularInfo.userId) && parentIds.has(actualInfo.userId)) {
        balanceByUser[actualInfo.userId] = (balanceByUser[actualInfo.userId] || 0) + 1;
        balanceByUser[regularInfo.userId] = (balanceByUser[regularInfo.userId] || 0) - 1;
        totalSwapDays++;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return { balanceByUser, totalSwapDays };
}

export interface BalanceOperation {
  id: string;
  operation_type: "debit" | "credit" | "waive" | "gift_day" | "forgive_balance" | "reset_balance" | "manual_adjustment";
  proposed_by: string;
  target_user_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  days: number;
  direction: "proposer_gains" | "target_gains" | "neutral" | "both_zero";
  related_date: string | null;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface EffectiveBalance {
  rawBalance: SwapBalance;
  ledgerAdjustments: Record<string, number>;
  effectiveByUser: Record<string, number>;
  totalSwapDays: number;
  friendlyConcessions: number;
  lastAgreementDate: string | null;
  pendingOperations: number;
}

/**
 * Apply ledger operations on top of the raw swap balance.
 * - debit/credit: already reflected in raw balance (via custody_events), so no adjustment
 * - waive: neutralize a previous debit (proposer cedes +1, target -1 cancelled out)
 * - gift_day: same as waive (intentional cession)
 * - forgive_balance: reduce proposer's debt by N days
 * - reset_balance: set all to zero
 * - manual_adjustment: neutral (notes only)
 */
export function getEffectiveBalance(
  rawBalance: SwapBalance,
  operations: BalanceOperation[]
): EffectiveBalance {
  const adjustments: Record<string, number> = {};
  const effective: Record<string, number> = { ...rawBalance.balanceByUser };

  // Initialize adjustments to zero for every known parent
  for (const uid of Object.keys(rawBalance.balanceByUser)) {
    adjustments[uid] = 0;
  }

  let friendlyConcessions = 0;
  let lastAgreementDate: string | null = null;
  let pendingOperations = 0;
  let resetApplied = false;

  // Get start of current month for concession counting
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Sort by created_at asc so reset applies in order
  const sorted = [...operations].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const op of sorted) {
    if (op.status === "pending") {
      pendingOperations++;
      continue;
    }
    if (op.status !== "approved") continue;

    // Track latest agreement date
    if (op.responded_at && (!lastAgreementDate || op.responded_at > lastAgreementDate)) {
      lastAgreementDate = op.responded_at;
    }

    // Count friendly concessions this month
    if (op.responded_at && new Date(op.responded_at) >= monthStart) {
      if (op.operation_type === "waive" || op.operation_type === "gift_day") {
        friendlyConcessions++;
      }
    }

    // Apply effect
    switch (op.operation_type) {
      case "waive":
      case "gift_day": {
        // Cancel the +/-1 from the raw balance for this single concession.
        // UI convention: proposer is the debtor who ceded the day (raw shows
        // proposer = -days, target = +days from the original swap). To cancel
        // we ADD +days to proposer (offset their -days) and subtract from
        // target. Sign-flip fix 2026-05-07 — the original implementation
        // doubled the swap effect instead of cancelling. Caught by
        // tests/unit/native-balance.test.ts.
        const proposer = op.proposed_by;
        const target = op.target_user_id;
        const days = op.days || 1;
        adjustments[proposer] = (adjustments[proposer] || 0) + days;
        adjustments[target] = (adjustments[target] || 0) - days;
        break;
      }
      case "forgive_balance": {
        // Proposer forgives the target: target's debt reduced by N days
        // Effect: target += days (less negative), proposer -= days (less positive)
        const proposer = op.proposed_by;
        const target = op.target_user_id;
        const days = op.days || 1;
        adjustments[target] = (adjustments[target] || 0) + days;
        adjustments[proposer] = (adjustments[proposer] || 0) - days;
        break;
      }
      case "reset_balance": {
        resetApplied = true;
        for (const uid of Object.keys(adjustments)) {
          // Full reset: adjustment = -current_effective so final = 0
          adjustments[uid] = -(rawBalance.balanceByUser[uid] || 0);
        }
        break;
      }
      case "debit":
      case "credit":
      case "manual_adjustment":
      default:
        // No adjustment (debit/credit already in raw balance; manual is informational)
        break;
    }
  }

  // Compute effective balance
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
    friendlyConcessions,
    lastAgreementDate,
    pendingOperations,
  };
}

/** Check if a date string is today */
export function isToday(dateKey: string): boolean {
  return dateKey === formatDateKey(new Date());
}

/** Check if a date is a weekend (Sat=0 col, Sun=6 col in grid, but day 0=Sun, 6=Sat) */
export function isWeekend(dateKey: string): boolean {
  const d = parseDateKey(dateKey);
  const day = d.getDay();
  return day === 0 || day === 6;
}
