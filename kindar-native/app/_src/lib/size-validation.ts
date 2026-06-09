/**
 * Validação de tamanhos de roupa/calçado — pura, testável.
 *
 * Bug (tester, 2026-06-09): a aba Tamanhos aceitava QUALQUER valor de sapato
 * (ex.: 90, 1) — fisicamente impossível. A entrada de calçado é numérica, então
 * exigimos um número de calçado BR plausível. Roupas (calça/camiseta/casaco/
 * outro) aceitam letra (P/M/G/GG) OU número, então NÃO aplicamos range — só o
 * calçado é validado por faixa.
 */
export const SHOE_MIN = 14; // BR — menor calçado infantil plausível
export const SHOE_MAX = 50; // BR — maior adulto plausível

export type SizeValidationError = 'shoe_invalid';

/**
 * Retorna 'shoe_invalid' se o valor de calçado não for um número BR plausível,
 * ou null se estiver ok (ou se o tipo não for calçado).
 */
export function validateSizeValue(kind: string, raw: string): SizeValidationError | null {
  if (kind !== 'shoe') return null;
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < SHOE_MIN || n > SHOE_MAX) return 'shoe_invalid';
  return null;
}
