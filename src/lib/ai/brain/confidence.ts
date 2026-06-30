/* ------------------------------------------------------------------ */
/* confidence.ts — confiança COMPOSTA (não o autorrelato do LLM)        */
/*                                                                      */
/* `date_confidence: 0.85` do modelo NÃO significa 85% correto — é      */
/* autorrelato. A confiança real combina a estimativa do LLM com        */
/* validações DETERMINÍSTICAS (data parseável, ano coerente, horizonte  */
/* plausível, sem conflito entre campos…). Um sinal "hard" que falha    */
/* derruba a confiança independente do que o modelo disse.              */
/*                                                                      */
/* Puro. Thresholds calibrados pelas fixtures (brain-confidence.test).  */
/* ------------------------------------------------------------------ */

import type { ConfidenceLevel, FieldConfidence } from "./types";

/** Alinhado ao LOW_CONFIDENCE_THRESHOLD=0.6 já usado na carteirinha. */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.6;
/** Teto de confiança quando um sinal determinístico "hard" falha. */
export const HARD_FAIL_CEILING = 0.3;

/** Faixa de política a partir de um score JÁ composto. */
export function getConfidencePolicy(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH) return "high";
  if (score >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

/** Um sinal verificável. `hard` = falhar invalida o campo (teto baixo);
 *  soft = reduz proporcional ao `weight` (0..1). */
export interface ConfidenceSignal {
  id: string;
  pass: boolean;
  weight: number; // 0..1 (quanto a falha de um soft signal reduz)
  hard?: boolean;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Combina o autorrelato do LLM com validações determinísticas.
 *  - Qualquer sinal `hard` falho → teto HARD_FAIL_CEILING (força "low").
 *  - Cada sinal `soft` falho → multiplica o score por (1 - weight).
 */
export function composeConfidence(llmEstimate: number, signals: ConfidenceSignal[]): number {
  const base = clamp01(llmEstimate);
  const hardFail = signals.some((s) => s.hard && !s.pass);
  if (hardFail) return Math.min(base, HARD_FAIL_CEILING);

  let score = base;
  for (const s of signals) {
    if (!s.hard && !s.pass) score *= 1 - clamp01(s.weight);
  }
  return clamp01(score);
}

/** Conveniência: score composto → { score, level }. */
export function assessFieldConfidence(
  llmEstimate: number,
  signals: ConfidenceSignal[],
): FieldConfidence {
  const score = composeConfidence(llmEstimate, signals);
  return { score, level: getConfidencePolicy(score) };
}

/* ---- Validadores determinísticos reutilizáveis (puros) ---- */

/** Data ISO YYYY-MM-DD parseável e real (rejeita 2026-02-31). */
export function isParseableIsoDate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Ano coerente com o ano letivo (mesmo ano ou o próximo). */
export function isYearCoherent(isoDate: string, schoolYearAnchor: number): boolean {
  if (!isParseableIsoDate(isoDate)) return false;
  const year = Number(isoDate.slice(0, 4));
  return year === schoolYearAnchor || year === schoolYearAnchor + 1;
}

/**
 * Data dentro de um horizonte plausível a partir de `today` (default:
 * de 7 dias atrás até 18 meses à frente — calendário escolar do período).
 */
export function isWithinHorizon(
  isoDate: string,
  today: string,
  opts: { pastDays?: number; futureDays?: number } = {},
): boolean {
  if (!isParseableIsoDate(isoDate) || !isParseableIsoDate(today)) return false;
  const pastDays = opts.pastDays ?? 7;
  const futureDays = opts.futureDays ?? 548; // ~18 meses
  const t = Date.parse(today + "T12:00:00Z");
  const d = Date.parse(isoDate + "T12:00:00Z");
  const diffDays = (d - t) / 86_400_000;
  return diffDays >= -pastDays && diffDays <= futureDays;
}

export const __internals = { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, HARD_FAIL_CEILING };
