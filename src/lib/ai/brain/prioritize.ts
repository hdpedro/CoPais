/* ------------------------------------------------------------------ */
/* prioritize.ts — prioridade objetiva (estágio 4, PURO)                */
/*                                                                      */
/* Prioridade NÃO sai do humor do LLM — sai da distância temporal até a */
/* ação mais próxima do plano, medida contra `today` (passado como      */
/* dado, nunca Date.now). Regra do A0:                                  */
/*                                                                      */
/*   distante  (> 3 dias)   → info,      digest                         */
/*   próximo   (1–3 dias)   → important, digest                         */
/*   iminente  (< 24h/hoje) → important, immediate                      */
/*                                                                      */
/* `urgent`/`immediate_both` ficam pro A1. Sem atividade futura no      */
/* plano → info/digest. Mapeia no enum collab_priority. Determinístico. */
/* ------------------------------------------------------------------ */

import type { MaterializationPlan, Priority } from "./types";
import { isParseableIsoDate } from "./confidence";

/** Limite (em dias) abaixo do qual a ação é considerada "próxima". */
export const NEAR_HORIZON_DAYS = 3;

function dayDiff(today: string, target: string): number {
  const t = Date.parse(today + "T12:00:00Z");
  const d = Date.parse(target + "T12:00:00Z");
  return Math.round((d - t) / 86_400_000);
}

/**
 * Calcula a prioridade do plano a partir da menor distância (em dias) de
 * `today` até uma atividade FUTURA (ou de hoje). Datas passadas são
 * ignoradas (não pautam urgência). Puro.
 */
export function prioritize(plan: MaterializationPlan, today: string): Priority {
  const futureDiffs = (plan.activities ?? [])
    .map((a) => a.startDate)
    .filter(isParseableIsoDate)
    .map((d) => dayDiff(today, d))
    .filter((diff) => diff >= 0); // hoje ou futuro

  if (futureDiffs.length === 0) {
    return { level: "info", delivery: "digest" };
  }

  const nearest = Math.min(...futureDiffs);

  if (nearest < 1) {
    // < 24h (hoje) — empurra agora.
    return { level: "important", delivery: "immediate" };
  }
  if (nearest <= NEAR_HORIZON_DAYS) {
    // 1–3 dias — importante, mas no resumo.
    return { level: "important", delivery: "digest" };
  }
  // Distante — informativo.
  return { level: "info", delivery: "digest" };
}
