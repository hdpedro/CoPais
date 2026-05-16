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
 *
 * Bug investigation 2026-05-15 (3 users): a versão anterior caía no
 * fallback genérico ("Não foi possível adicionar a criança") quando
 * status era 400 SEM serverMessage. UX perdia informação útil. Esta
 * versão SEMPRE mostra status + algo informativo, e prioriza a mensagem
 * de exception (cause.message) quando ela existe.
 */
export function resolveFetchErrorMessage(
  ctx: FetchErrorContext,
  t: Translate,
): string | null {
  if (isAbortError(ctx.cause)) return null;
  if (isNetworkError(ctx.cause)) return t('onboardingForm.errorNetwork');

  // Server message do JSON tem prioridade — vem da action/route com contexto
  if (ctx.serverMessage) return ctx.serverMessage;

  // Status code conhecido → mensagem específica
  if (typeof ctx.status === 'number') {
    if (ctx.status === 401) return t('common.sessionExpired');
    if (ctx.status === 403) return t('onboardingForm.errorPermission');
    if (ctx.status === 409) return t('onboardingForm.errorConflict');
    if (ctx.status >= 500) return `${t('onboardingForm.errorServer')} (${ctx.status})`;
    // 400 sem serverMessage = body parsing falhou ou rota não-JSON.
    // Em vez de cair no fallback genérico, mostra o status.
    if (ctx.status >= 400) return `${t(ctx.fallbackKey)} (HTTP ${ctx.status})`;
  }

  // Exception genérica — tenta extrair message
  if (ctx.cause instanceof Error && ctx.cause.message) {
    return `${t(ctx.fallbackKey)}: ${ctx.cause.message}`;
  }

  return t(ctx.fallbackKey);
}
