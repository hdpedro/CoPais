/**
 * size-validation — validação de tamanho de calçado.
 *
 * Regressão do bug (tester, 2026-06-09): a aba Tamanhos aceitava sapato 90 e 1.
 * Agora calçado exige número BR plausível (14–50); roupas seguem livres.
 */
import { describe, expect, test } from 'vitest';
import { validateSizeValue } from '../../../app/_src/lib/size-validation';

describe('validateSizeValue', () => {
  test('BUG: sapato 90 e 1 → shoe_invalid', () => {
    expect(validateSizeValue('shoe', '90')).toBe('shoe_invalid');
    expect(validateSizeValue('shoe', '1')).toBe('shoe_invalid');
  });

  test('sapato BR plausível → null', () => {
    expect(validateSizeValue('shoe', '34')).toBeNull();
    expect(validateSizeValue('shoe', '16')).toBeNull();
    expect(validateSizeValue('shoe', '46')).toBeNull();
    expect(validateSizeValue('shoe', '33,5')).toBeNull(); // meia-numeração com vírgula
  });

  test('sapato não-numérico ou vazio → shoe_invalid', () => {
    expect(validateSizeValue('shoe', 'G')).toBe('shoe_invalid');
    expect(validateSizeValue('shoe', '')).toBe('shoe_invalid');
  });

  test('limites 14 e 50 inclusivos', () => {
    expect(validateSizeValue('shoe', '14')).toBeNull();
    expect(validateSizeValue('shoe', '50')).toBeNull();
    expect(validateSizeValue('shoe', '13')).toBe('shoe_invalid');
    expect(validateSizeValue('shoe', '51')).toBe('shoe_invalid');
  });

  test('roupas aceitam letra ou número (sem range)', () => {
    expect(validateSizeValue('pants', 'G')).toBeNull();
    expect(validateSizeValue('shirt', 'M')).toBeNull();
    expect(validateSizeValue('coat', 'GG')).toBeNull();
    expect(validateSizeValue('pants', '12')).toBeNull();
    expect(validateSizeValue('other', '90')).toBeNull(); // tipo custom não tem range
  });
});
