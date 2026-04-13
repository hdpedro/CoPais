// Feriados nacionais brasileiros (fixos + moveis)

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

// Calcula a Pascoa pelo algoritmo de Meeus/Jones/Butcher
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
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Feriados fixos nacionais
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "Ano Novo" },
  { month: 4, day: 21, name: "Tiradentes" },
  { month: 5, day: 1, name: "Dia do Trabalho" },
  { month: 9, day: 7, name: "Independência" },
  { month: 10, day: 12, name: "N. Sra. Aparecida" },
  { month: 11, day: 2, name: "Finados" },
  { month: 11, day: 15, name: "Proclamação da República" },
  { month: 11, day: 20, name: "Consciência Negra" },
  { month: 12, day: 25, name: "Natal" },
];

export function getHolidaysForYear(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Feriados fixos
  for (const h of FIXED_HOLIDAYS) {
    const m = String(h.month).padStart(2, "0");
    const d = String(h.day).padStart(2, "0");
    holidays.push({ date: `${year}-${m}-${d}`, name: h.name });
  }

  // Feriados moveis baseados na Pascoa
  const easter = getEasterDate(year);
  holidays.push({ date: formatDate(addDays(easter, -47)), name: "Carnaval" });
  holidays.push({ date: formatDate(addDays(easter, -46)), name: "Carnaval" });
  holidays.push({ date: formatDate(addDays(easter, -2)), name: "Sexta-feira Santa" });
  holidays.push({ date: formatDate(easter), name: "Páscoa" });
  holidays.push({ date: formatDate(addDays(easter, 60)), name: "Corpus Christi" });

  return holidays;
}

// Retorna mapa dateKey -> nome do feriado para um range de meses
export function getHolidayMap(year: number): Record<string, string> {
  const map: Record<string, string> = {};

  // Gera feriados para o ano atual e adjacentes (para navegacao de meses)
  const years = [year - 1, year, year + 1];
  for (const y of years) {
    for (const h of getHolidaysForYear(y)) {
      map[h.date] = h.name;
    }
  }

  return map;
}
