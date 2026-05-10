/**
 * Recurrence utils — porta direta de src/lib/recurrence-utils.ts (PWA).
 *
 * Por que existe: ate hoje (2026-05-07) o native NAO gerava
 * calendar_occurrences ao criar atividade. Inseria so em child_activities
 * e os occurrences ficavam vazios — atividade nao aparecia no calendario.
 * Bug reportado pela Hailla: criou Jiu-Jitsu 4x e nenhum apareceu.
 *
 * Paridade obrigatoria pelo CLAUDE.md. Logica e PURE COMPUTATION sobre
 * input simples — duplicar e seguro (e necessario porque o native nao
 * compartilha node_modules com o PWA).
 *
 * IMPORTANTE: manter este arquivo sincronizado com o do PWA. Quaisquer
 * mudancas em logica de recorrencia precisam ir nos dois lados +
 * tests/unit/native-activities.test.ts.
 */

export interface ActivityRecurrence {
  recurrence_type: 'never' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';
  start_date: string;
  end_date: string | null;
  days_of_week: number[] | null;
  day_of_month: number | null;
  custom_interval: number;
  custom_unit: 'day' | 'week' | 'month';
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Map de strings PT-BR de dia da semana pro indice JS (0=Dom). */
const DOW_NAME_TO_INDEX: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  domingo: 0, segunda: 1, 'terca': 2, 'terça': 2, quarta: 3,
  quinta: 4, sexta: 5, sabado: 6, 'sábado': 6,
};

function normalizeDow(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= 6) {
    return input;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim().toLowerCase();
    if (trimmed in DOW_NAME_TO_INDEX) return DOW_NAME_TO_INDEX[trimmed];
    // Algumas versoes antigas guardavam "1","3" como string
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
  }
  return null;
}

/**
 * Parse days_of_week from DB. Aceita:
 *  - Array de numeros: [1,3]
 *  - Array de strings PT-BR: ["seg","qua"]
 *  - JSON string de array: '[1,3]' ou '["seg","qua"]'
 *  - Mix: ["seg",3]
 *
 * Retorna sempre array de numeros 0-6 ou null. Bug Hailla 2026-05-07
 * descobriu que clients antigos salvavam strings PT-BR — generator
 * esperava numeros e gerava 0 occurrences silenciosamente.
 */
export function parseDaysOfWeek(raw: unknown): number[] | null {
  if (!raw) return null;
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      // nao e JSON valido
    }
  }
  if (!arr) return null;
  const normalized: number[] = [];
  for (const v of arr) {
    const n = normalizeDow(v);
    if (n != null) normalized.push(n);
  }
  return normalized.length > 0 ? normalized : null;
}

/**
 * Compute all occurrence dates of an activity within a given date range.
 * Supports multiple days_of_week (e.g. [1,2,5] for Mon/Tue/Fri).
 */
export function getOccurrences(
  activity: ActivityRecurrence,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const dates: string[] = [];
  const start = parseDateKey(activity.start_date);
  const rStart = parseDateKey(rangeStart);
  const rEnd = parseDateKey(rangeEnd);
  const end = activity.end_date ? parseDateKey(activity.end_date) : null;

  if (activity.recurrence_type === 'never') {
    if (start >= rStart && start <= rEnd && (!end || start <= end)) {
      dates.push(formatDateKey(start));
    }
    return dates;
  }

  // Weekly / biweekly com multiplos dias da semana — iterar cada DoW separado.
  if (
    (activity.recurrence_type === 'weekly' || activity.recurrence_type === 'biweekly') &&
    activity.days_of_week &&
    activity.days_of_week.length > 0
  ) {
    const allDates = new Set<string>();
    for (const dow of activity.days_of_week) {
      const iterStart = start > rStart ? new Date(start) : new Date(rStart);
      while (iterStart.getDay() !== dow) {
        iterStart.setDate(iterStart.getDate() + 1);
      }
      if (activity.recurrence_type === 'biweekly') {
        const weeksDiff = Math.floor(
          (iterStart.getTime() - start.getTime()) / (7 * 86400000),
        );
        if (weeksDiff % 2 !== 0) {
          iterStart.setDate(iterStart.getDate() + 7);
        }
      }
      const step = activity.recurrence_type === 'biweekly' ? 14 : 7;
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

  // Outros tipos: daily/monthly/yearly/custom — iterar passo a passo.
  const iterStart = start > rStart ? new Date(start) : new Date(rStart);
  const current = new Date(iterStart);
  let safetyLimit = 500;

  while (current <= rEnd && safetyLimit-- > 0) {
    if (end && current > end) break;
    if (current >= start) {
      dates.push(formatDateKey(current));
    }

    switch (activity.recurrence_type) {
      case 'daily':
        current.setDate(current.getDate() + 1);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        if (activity.day_of_month) {
          const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
          current.setDate(Math.min(activity.day_of_month, maxDay));
        }
        break;
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1);
        break;
      case 'custom': {
        const interval = activity.custom_interval || 1;
        switch (activity.custom_unit) {
          case 'day':
            current.setDate(current.getDate() + interval);
            break;
          case 'week':
            current.setDate(current.getDate() + interval * 7);
            break;
          case 'month':
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
