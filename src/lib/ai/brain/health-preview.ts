/* ------------------------------------------------------------------ */
/* health-preview.ts — copy PURA do preview/coordenação de consulta     */
/*                                                                      */
/* Mensagens curtas e humanas do que o Brain organizou de uma consulta, */
/* compartilhadas pelos canais (assistente/WhatsApp/PWA) e pelo resumo   */
/* de coordenação. Sem I/O. TRANSPORTADOR: só reflete o que foi extraído */
/* (diagnóstico citado, contagem de medicações, data do retorno).       */
/* ------------------------------------------------------------------ */

import type { HealthVisitPlan } from "./types";

/** "DD/MM" a partir de "YYYY-MM-DD" (ou null se malformado). */
function toBrDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}` : null;
}

/** Partes do resumo (diagnóstico citado · N medicações · retorno DD/MM). Puro. */
export function healthSummaryParts(health: HealthVisitPlan): string[] {
  const parts: string[] = [];
  if (health.episode?.diagnosis) parts.push(health.episode.diagnosis.toLowerCase());
  const nMed = health.medications?.length ?? 0;
  if (nMed > 0) parts.push(nMed === 1 ? "1 medicação" : `${nMed} medicações`);
  const ret = toBrDate(health.followUp?.date);
  if (ret) parts.push(`retorno em ${ret}`);
  return parts;
}

/** Mensagem do PREVIEW (pergunta se registra), pro chat do assistente. */
export function buildHealthPreviewMessage(health: HealthVisitPlan, childName: string): string {
  const parts = healthSummaryParts(health);
  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `🩺 Organizei a consulta de ${childName}${detail}. Quer que eu registre no histórico de Saúde?`;
}
