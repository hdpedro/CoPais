/**
 * birthday-utils — aniversários derivados de children.birth_date (calendário).
 * Cópia native do PWA. Cobre 29/02 em ano não-bissexto, idade e ocorrências
 * num range que cruza a virada de ano.
 */
import { describe, it, expect } from 'vitest';
import { birthdayInYear, computeAgeOnDate, getBirthdayOccurrences } from '../../../app/_src/lib/birthday-utils';

describe('birthdayInYear', () => {
  it('data normal', () => {
    expect(birthdayInYear('2017-06-15', 2026)).toBe('2026-06-15');
  });
  it('29/02 em ano bissexto se mantém', () => {
    expect(birthdayInYear('2016-02-29', 2024)).toBe('2024-02-29');
  });
  it('29/02 em ano não-bissexto → 28/02', () => {
    expect(birthdayInYear('2016-02-29', 2025)).toBe('2025-02-28');
  });
});

describe('computeAgeOnDate', () => {
  it('no próprio aniversário conta o ano', () => {
    expect(computeAgeOnDate('2017-06-15', '2026-06-15')).toBe(9);
  });
  it('um dia antes ainda não conta', () => {
    expect(computeAgeOnDate('2017-06-15', '2026-06-14')).toBe(8);
  });
  it('depois do aniversário no ano', () => {
    expect(computeAgeOnDate('2020-03-10', '2026-12-01')).toBe(6);
  });
});

describe('getBirthdayOccurrences', () => {
  it('uma ocorrência por ano no range', () => {
    expect(getBirthdayOccurrences('2017-06-15', '2026-05-01', '2026-08-01')).toEqual(['2026-06-15']);
  });
  it('range que cruza 2 viradas → 2 ocorrências', () => {
    expect(getBirthdayOccurrences('2020-01-20', '2025-12-01', '2027-02-01')).toEqual(['2026-01-20', '2027-01-20']);
  });
  it('fora do range → vazio', () => {
    expect(getBirthdayOccurrences('2017-06-15', '2026-07-01', '2026-08-01')).toEqual([]);
  });
});
