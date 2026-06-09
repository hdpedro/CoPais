/**
 * Núcleo PURO do briefing noturno "🌅 Amanhã" (IA orquestrando a rotina, Fase 2).
 * Sem I/O — testável isolado. O wrapper server-only (care-routine-briefing.ts)
 * lê o banco, compõe a mensagem por destinatário e dispara o push.
 *
 * Dispara uma vez por noite (janela 20:00–20:14 BRT, batendo um único slot do
 * cron de 15min). Compõe a rotina de amanhã + atividades + um aviso de "furo de
 * cobertura" (tem atividade com horário mas ninguém marcado pra buscar).
 */

const BRIEFING_HOUR_BRT = 20; // 20h BRT — depois do jantar, planejando amanhã
const BRAZIL_OFFSET_MIN = -180; // BR sem DST desde 2019
const BRIEFING_WINDOW_MIN = 15; // casa com o slot de 15min do cron

/** `now` (UTC) cai na janela noturna do briefing (20:00–20:14 BRT)? */
export function isBriefingEveningSlot(now: Date): boolean {
  const brtMinuteOfDay = (now.getUTCHours() * 60 + now.getUTCMinutes() + BRAZIL_OFFSET_MIN + 1440) % 1440;
  const start = BRIEFING_HOUR_BRT * 60;
  return brtMinuteOfDay >= start && brtMinuteOfDay < start + BRIEFING_WINDOW_MIN;
}

/** Data de amanhã (YYYY-MM-DD) em BRT, a partir de `now` (UTC). */
export function tomorrowKeyBrazil(now: Date): string {
  const brtNow = new Date(now.getTime() + BRAZIL_OFFSET_MIN * 60_000);
  const t = new Date(brtNow.getTime() + 86_400_000);
  return t.toISOString().slice(0, 10);
}

export interface BriefingActivity {
  name: string;
  time: string | null; // "HH:MM[:SS]"
}

/**
 * Furo de cobertura: amanhã tem atividade COM HORÁRIO mas ninguém está marcado
 * pra BUSCAR. Conservador (só com horário) pra não falsar com evento o dia todo.
 */
export function hasCoverageGap(pickupResponsibleName: string | null, activities: readonly BriefingActivity[]): boolean {
  return !pickupResponsibleName && activities.some((a) => !!a.time);
}

/** Ordena atividades por horário (sem horário vão pro fim), pra exibição. */
export function sortBriefingActivities(activities: readonly BriefingActivity[]): BriefingActivity[] {
  return [...activities].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}
