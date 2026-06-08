/**
 * Validação de medidas de crescimento (peso/altura) — pura, testável.
 *
 * Camada 1 — limites absolutos (qualquer idade).
 * Camada 2 — limite POR IDADE via WHO P97 (dados 0-60 meses): rejeita valores
 *            acima de IMPOSSIBLE_MULTIPLE × o P97 da idade. Margem generosa —
 *            nenhuma criança real chega a 2× o percentil 97, então não há falso
 *            positivo, mas pega o claramente impossível.
 *
 * Bug Nathy (2026-06-08): a tela de Crescimento só checava os limites absolutos
 * frouxos (250 kg / 230 cm), então um bebê de 10 meses aceitava 200 kg e 2 m.
 * Acima de 60 meses não há dado WHO aqui → cai só nos limites absolutos.
 */
import { getWeightForAge, getHeightForAge } from './who-growth-data';

export const ABS_WEIGHT = { min: 0.5, max: 250 } as const; // kg
export const ABS_HEIGHT = { min: 20, max: 230 } as const; // cm
const IMPOSSIBLE_MULTIPLE = 2;

export type GrowthValidationError =
  | 'weight_out_of_range'
  | 'height_out_of_range'
  | 'weight_impossible_for_age'
  | 'height_impossible_for_age';

/** P97 do WHO para a idade (meses), ou null se fora da faixa 0-60m. */
function whoP97(months: number, sex: 'M' | 'F', metric: 'weight' | 'height'): number | null {
  const arr = metric === 'weight' ? getWeightForAge(sex) : getHeightForAge(sex);
  if (!arr.length) return null;
  const m = Math.max(0, Math.floor(months));
  const last = arr[arr.length - 1];
  if (m > last.month) return null; // dados WHO cobrem 0-60 meses
  const point = arr.find((p) => p.month === m) ?? last;
  return point.p97;
}

/**
 * Retorna o código do PRIMEIRO erro encontrado, ou null se as medidas forem
 * plausíveis. Valores null (não informados) são ignorados.
 */
export function checkGrowthMeasurement(
  months: number | null,
  sex: 'M' | 'F' | null,
  weightKg: number | null,
  heightCm: number | null,
): GrowthValidationError | null {
  if (weightKg != null) {
    if (weightKg < ABS_WEIGHT.min || weightKg > ABS_WEIGHT.max) return 'weight_out_of_range';
    if (months != null && sex) {
      const p97 = whoP97(months, sex, 'weight');
      if (p97 != null && weightKg > IMPOSSIBLE_MULTIPLE * p97) return 'weight_impossible_for_age';
    }
  }
  if (heightCm != null) {
    if (heightCm < ABS_HEIGHT.min || heightCm > ABS_HEIGHT.max) return 'height_out_of_range';
    if (months != null && sex) {
      const p97 = whoP97(months, sex, 'height');
      if (p97 != null && heightCm > IMPOSSIBLE_MULTIPLE * p97) return 'height_impossible_for_age';
    }
  }
  return null;
}
