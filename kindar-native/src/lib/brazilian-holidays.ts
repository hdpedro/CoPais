/**
 * Feriados nacionais brasileiros (fixos + móveis baseados na Páscoa).
 * Copiado de src/lib/brazilian-holidays.ts do PWA — mesma logica exata.
 */

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Ano Novo' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência' },
  { month: 10, day: 12, name: 'N. Sra. Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Consciência Negra' },
  { month: 12, day: 25, name: 'Natal' },
];

export function getHolidaysForYear(year: number): Holiday[] {
  const out: Holiday[] = [];
  for (const h of FIXED) {
    out.push({
      date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
      name: h.name,
    });
  }
  const easter = getEasterDate(year);
  out.push({ date: formatDate(addDays(easter, -47)), name: 'Carnaval' });
  out.push({ date: formatDate(addDays(easter, -46)), name: 'Carnaval' });
  out.push({ date: formatDate(addDays(easter, -2)), name: 'Sexta-feira Santa' });
  out.push({ date: formatDate(easter), name: 'Páscoa' });
  out.push({ date: formatDate(addDays(easter, 60)), name: 'Corpus Christi' });
  return out;
}

/** Mapa dateKey (YYYY-MM-DD) → nome do feriado, para o ano + adjacentes. */
export function getHolidayMap(year: number): Record<string, string> {
  const map: Record<string, string> = {};
  for (const y of [year - 1, year, year + 1]) {
    for (const h of getHolidaysForYear(y)) map[h.date] = h.name;
  }
  return map;
}
