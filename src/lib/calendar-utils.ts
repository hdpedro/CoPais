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

/** Build a map of date -> custody info from events array */
export function buildCustodyMap(
  events: CustodyEvent[],
  parentColors: ParentColorMap
): Map<string, CustodyDayInfo> {
  const map = new Map<string, CustodyDayInfo>();

  for (const event of events) {
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
  const today = new Date();
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
