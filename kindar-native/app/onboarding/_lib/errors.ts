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
  /**
   * `code` estável do body (services/children.ts retorna como
   * `errorCode`; a rota copia pra `code` no JSON). Quando presente +
   * conhecido, prioriza i18n key sobre `serverMessage`.
   */
  errorCode?: string;
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
 * Mapeia `errorCode` do service backend → i18n key.
 * Tabela espelhada em `src/app/(app)/onboarding/_lib/errors.ts` (PWA).
 */
export function errorCodeToI18nKey(code: string): string | null {
  switch (code) {
    case 'fk_blocked':
      return 'onboardingForm.errorFkBlocked';
    case 'check_violation':
      return 'onboardingForm.errorCheckViolation';
    case 'permission_denied':
      return 'onboardingForm.errorPermission';
    case 'not_found':
      return 'onboardingForm.errorNotFound';
    case 'wrong_group':
      return 'onboardingForm.errorWrongGroup';
    case 'unique_violation':
      return 'onboardingForm.errorConflict';
    case 'future_birthdate':
      return 'onboardingForm.errorFutureBirthdate';
    case 'invalid_date':
      return 'onboardingForm.errorInvalidDate';
    case 'missing_fields':
      return 'onboardingForm.errorMissingFields';
    case 'no_changes':
      return 'onboardingForm.errorNoChanges';
    default:
      return null;
  }
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
 *
 * Ordem (2026-05-15 ecosistema fix):
 *   1. AbortError → null (silencia)
 *   2. Network error → errorNetwork
 *   3. errorCode conhecido → i18n key dedicada (5 idiomas)
 *   4. serverMessage → fallback PT-BR servidor
 *   5. status → i18n por faixa
 *   6. cause.message → genérico + exception
 *   7. fallbackKey → último recurso
 */
export function resolveFetchErrorMessage(
  ctx: FetchErrorContext,
  t: Translate,
): string | null {
  if (isAbortError(ctx.cause)) return null;
  if (isNetworkError(ctx.cause)) return t('onboardingForm.errorNetwork');

  // errorCode estável tem PRIORIDADE — i18n local vence PT-BR do servidor
  if (ctx.errorCode) {
    const key = errorCodeToI18nKey(ctx.errorCode);
    if (key) return t(key);
  }

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
