// Aniversário de crianças — eventos derivados de children.birth_date.
// Cópia native de `src/lib/birthday-utils.ts` do PWA (mantenha em sincronia).
// Fonte de verdade: tabela children. Não há tabela própria — DERIVE-ON-READ.

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Resolve a data do aniversário em um ano específico.
 * Para nascidos em 29/02, em anos não-bissextos retorna 28/02 (regra adotada).
 */
export function birthdayInYear(birthDate: string, year: number): string {
  const [, mm, dd] = birthDate.split('-');
  if (mm === '02' && dd === '29' && !isLeapYear(year)) {
    return `${year}-02-28`;
  }
  return `${year}-${mm}-${dd}`;
}

/**
 * Idade que a criança completa em um determinado dia.
 * Retorna o número de anos comemorados (0 = primeiro aniversário ainda não chegou).
 */
export function computeAgeOnDate(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = onDate.split('-').map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age;
}

/**
 * Gera todas as ocorrências de aniversário no range [start, end] (inclusivo),
 * YYYY-MM-DD. Itera por ano pra cobrir ranges que cruzam a virada.
 */
export function getBirthdayOccurrences(birthDate: string, rangeStart: string, rangeEnd: string): string[] {
  const startYear = parseInt(rangeStart.slice(0, 4), 10);
  const endYear = parseInt(rangeEnd.slice(0, 4), 10);
  const out: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const key = birthdayInYear(birthDate, y);
    if (key >= rangeStart && key <= rangeEnd) out.push(key);
  }
  return out;
}
