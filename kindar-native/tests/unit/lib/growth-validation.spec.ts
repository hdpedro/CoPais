/**
 * growth-validation — validação de peso/altura por idade (WHO).
 *
 * Regressão do bug Nathy (2026-06-08): bebê de 10 meses aceitava 200 kg e 2 m
 * (passavam os limites absolutos frouxos de 250 kg / 230 cm). Agora rejeita o
 * impossível para a idade (> 2× o P97 do WHO).
 */
import { describe, expect, test } from 'vitest';
import { checkGrowthMeasurement } from '../../../app/_src/lib/growth-validation';

describe('checkGrowthMeasurement', () => {
  test('BUG NATHY: 10 meses com 200 kg → weight_impossible_for_age', () => {
    expect(checkGrowthMeasurement(10, 'M', 200, null)).toBe('weight_impossible_for_age');
  });

  test('BUG NATHY: 10 meses com 2 m (200 cm) → height_impossible_for_age', () => {
    expect(checkGrowthMeasurement(10, 'M', null, 200)).toBe('height_impossible_for_age');
  });

  test('medidas plausíveis pra 10 meses → null', () => {
    expect(checkGrowthMeasurement(10, 'M', 9.2, 73)).toBeNull();
    expect(checkGrowthMeasurement(10, 'F', 8.8, 71)).toBeNull();
  });

  test('recém-nascido plausível → null; valores de bebê grande continuam OK', () => {
    expect(checkGrowthMeasurement(0, 'F', 3.3, 50)).toBeNull();
    expect(checkGrowthMeasurement(24, 'M', 14, 90)).toBeNull();
  });

  test('limites absolutos (qualquer idade): peso/altura grotescos', () => {
    expect(checkGrowthMeasurement(120, 'M', 300, null)).toBe('weight_out_of_range');
    expect(checkGrowthMeasurement(60, 'F', 0.2, null)).toBe('weight_out_of_range');
    expect(checkGrowthMeasurement(36, 'M', null, 5)).toBe('height_out_of_range');
    expect(checkGrowthMeasurement(36, 'M', null, 240)).toBe('height_out_of_range');
  });

  test('peso checado antes de altura (ordem determinística)', () => {
    expect(checkGrowthMeasurement(10, 'M', 200, 200)).toBe('weight_impossible_for_age');
  });

  test('sem idade ou sexo → cai só nos limites absolutos (não dá pra checar por idade)', () => {
    expect(checkGrowthMeasurement(null, 'M', 30, null)).toBeNull();
    expect(checkGrowthMeasurement(10, null, 30, null)).toBeNull();
  });

  test('valores não informados (null) são ignorados', () => {
    expect(checkGrowthMeasurement(10, 'M', null, null)).toBeNull();
  });
});
