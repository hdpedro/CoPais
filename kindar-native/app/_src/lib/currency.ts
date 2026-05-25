/**
 * Helpers de formatação monetária pro app Nativo. Espelha
 * `src/lib/format/currency.ts` do PWA — mesma SOT, paridade visual.
 *
 * Anti-pattern que isso bloqueia: `R$ ${v.toFixed(2)}` (renderiza
 * "R$ 0.00" com ponto US em vez de "R$ 0,00" com vírgula BR — bug F#58
 * do E2E PRD 2026-05-25). React Native em Hermes inclui `Intl` por
 * default desde RN 0.74 + Expo SDK 51, então é seguro usar.
 *
 * Foca em BRL/pt-BR. Quando for adicionar suporte a outras moedas,
 * evolui pra `formatCurrency(value, currency, locale)` usando
 * `Intl.NumberFormat`.
 */

/**
 * Formata um número como BRL no padrão pt-BR ("R$ 1.234,56"). Usa
 * Intl.NumberFormat pra grouping correto + casas decimais sempre 2.
 *
 * Caller responsável por NaN/null — passar 0 explicitamente se a fonte
 * for unsafe (ex: `formatBRL(amount ?? 0)`).
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Versão "amount only" (sem símbolo R$) — pra contextos onde o R$ já
 * aparece em label adjacente. Ex: input prefixado com "R$" + valor sem
 * o símbolo duplicado.
 */
export function formatBRLAmount(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
