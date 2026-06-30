/* ------------------------------------------------------------------ */
/* outbox-retry.ts — backoff + dead-letter do worker do outbox (PURO)   */
/*                                                                      */
/* Retry com backoff: após a 1ª entrega falhar espera 1 min, depois 5,  */
/* depois 30 (3 retries). Esgotou → dead-letter (status='dead'), não    */
/* some: vira painel de falhas. `attempts` já vem incrementado pelo      */
/* claim (brain_outbox_claim_batch), então conta a tentativa recém-feita.*/
/* ------------------------------------------------------------------ */

/** Backoff em minutos antes de cada retry (após a tentativa N falhar). */
const BACKOFF_MINUTES = [1, 5, 30];

/** Tentativas máximas = 1 inicial + 3 retries (1/5/30 min). */
export const MAX_OUTBOX_ATTEMPTS = 1 + BACKOFF_MINUTES.length;

/** Esgotou os retries? (após a tentativa `attempts` ter falhado). */
export function isDeadLettered(attempts: number): boolean {
  return attempts >= MAX_OUTBOX_ATTEMPTS;
}

/**
 * Delay (ms) antes da próxima tentativa, dado que a tentativa `attempts`
 * acabou de falhar. attempts=1 → 1min, 2 → 5min, 3 → 30min. Clampado.
 */
export function nextRetryDelayMs(attempts: number): number {
  const idx = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[idx] * 60_000;
}
