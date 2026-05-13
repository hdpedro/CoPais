/**
 * Mapeamento de erros de fetch → mensagem i18n contextual (nativo).
 *
 * Espelha `src/app/(app)/onboarding/_lib/errors.ts` (PWA). Mantém paridade
 * no comportamento de classificação de erros — qualquer mudança aqui deve
 * ser refletida no PWA.
 */

import type { Translate } from './types';

export interface FetchErrorContext {
  status?: number;
  serverMessage?: string;
  cause?: unknown;
  fallbackKey: string;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  return /fetch|network|connection/i.test(err.message);
}

/**
 * Resolve mensagem i18n contextual. Retorna `null` quando o erro deve ser
 * silenciado (AbortError de cleanup).
 */
export function resolveFetchErrorMessage(
  ctx: FetchErrorContext,
  t: Translate,
): string | null {
  if (isAbortError(ctx.cause)) return null;
  if (isNetworkError(ctx.cause)) return t('onboardingForm.errorNetwork');

  if (typeof ctx.status === 'number') {
    if (ctx.status === 401) return t('common.sessionExpired');
    if (ctx.status === 403) return t('onboardingForm.errorPermission');
    if (ctx.status === 409) return t('onboardingForm.errorConflict');
    if (ctx.status >= 500) return t('onboardingForm.errorServer');
    if (ctx.status >= 400 && ctx.serverMessage) return ctx.serverMessage;
  }

  if (ctx.serverMessage) return ctx.serverMessage;
  return t(ctx.fallbackKey);
}
