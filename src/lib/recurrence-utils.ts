import { formatDateKey, parseDateKey } from "./calendar-utils";

export interface ActivityRecurrence {
  recurrence_type: "never" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";
  start_date: string;
  end_date: string | null;
  days_of_week: number[] | null;
  day_of_month: number | null;
  custom_interval: number;
  custom_unit: "day" | "week" | "month";
}

/** Parse days_of_week from DB (JSON string or array) */
export function parseDaysOfWeek(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as number[];
  } catch {}
  return null;
}

/**
 * Compute all occurrence dates of an activity within a given date range.
 * Supports multiple days_of_week (e.g. [1,2,5] for Mon/Tue/Fri).
 */
export function getOccurrences(
  activity: ActivityRecurrence,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const dates: string[] = [];
  const start = parseDateKey(activity.start_date);
  const rStart = parseDateKey(rangeStart);
  const rEnd = parseDateKey(rangeEnd);
  const end = activity.end_date ? parseDateKey(activity.end_date) : null;

  if (activity.recurrence_type === "never") {
    if (start >= rStart && start <= rEnd && (!end || start <= end)) {
      dates.push(formatDateKey(start));
    }
    return dates;
  }

  // For weekly/biweekly with multiple days, iterate each day separately then merge
  if (
    (activity.recurrence_type === "weekly" || activity.recurrence_type === "biweekly") &&
    activity.days_of_week &&
    activity.days_of_week.length > 0
  ) {
    const allDates = new Set<string>();
    for (const dow of activity.days_of_week) {
      const iterStart = start > rStart ? new Date(start) : new Date(rStart);
      // Align to correct day of week
      while (iterStart.getDay() !== dow) {
        iterStart.setDate(iterStart.getDate() + 1);
      }
      // For biweekly, align to the correct week from start_date
      if (activity.recurrence_type === "biweekly") {
        const weeksDiff = Math.floor(
          (iterStart.getTime() - start.getTime()) / (7 * 86400000)
        );
        if (weeksDiff % 2 !== 0) {
          iterStart.setDate(iterStart.getDate() + 7);
        }
      }
      const step = activity.recurrence_type === "biweekly" ? 14 : 7;
      const current = new Date(iterStart);
      let safety = 200;
      while (current <= rEnd && safety-- > 0) {
        if (end && current > end) break;
        if (current >= start) {
          allDates.add(formatDateKey(current));
        }
        current.setDate(current.getDate() + step);
      }
    }
    return Array.from(allDates).sort();
  }

  // For other recurrence types, iterate day by day or by step
  const iterStart = start > rStart ? new Date(start) : new Date(rStart);
  const current = new Date(iterStart);
  let safetyLimit = 500;

  while (current <= rEnd && safetyLimit-- > 0) {
    if (end && current > end) break;
    if (current >= start) {
      dates.push(formatDateKey(current));
    }

    switch (activity.recurrence_type) {
      case "daily":
        current.setDate(current.getDate() + 1);
        break;
      case "monthly":
        current.setMonth(current.getMonth() + 1);
        if (activity.day_of_month) {
          const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
          current.setDate(Math.min(activity.day_of_month, maxDay));
        }
        break;
      case "yearly":
        current.setFullYear(current.getFullYear() + 1);
        break;
      case "custom": {
        const interval = activity.custom_interval || 1;
        switch (activity.custom_unit) {
          case "day":
            current.setDate(current.getDate() + interval);
            break;
          case "week":
            current.setDate(current.getDate() + interval * 7);
            break;
          case "month":
            current.setMonth(current.getMonth() + interval);
            break;
        }
        break;
      }
      default:
        current.setDate(current.getDate() + 1);
        break;
    }
  }

  return dates;
}

/**
 * Check if an activity occurs on a specific date.
 */
export function occursOnDate(activity: ActivityRecurrence, dateKey: string): boolean {
  return getOccurrences(activity, dateKey, dateKey).length > 0;
}

/**
 * Get next occurrence of an activity from a given date.
 */
export function getNextOccurrence(activity: ActivityRecurrence, fromDate: string): string | null {
  const thirtyDaysLater = new Date(parseDateKey(fromDate));
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 365);
  const occurrences = getOccurrences(activity, fromDate, formatDateKey(thirtyDaysLater));
  return occurrences.length > 0 ? occurrences[0] : null;
}

export const RECURRENCE_OPTIONS = [
  { value: "never", label: "Nunca (evento unico)" },
  { value: "daily", label: "Todos os dias" },
  { value: "weekly", label: "Todas as semanas" },
  { value: "biweekly", label: "A cada 2 semanas" },
  { value: "monthly", label: "Todos os meses" },
  { value: "yearly", label: "Todos os anos" },
  { value: "custom", label: "Personalizar..." },
] as const;
