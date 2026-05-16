/**
 * Mapeamento de erros de fetch → mensagem i18n contextual.
 *
 * Antes, qualquer falha caía no mesmo "Não foi possível adicionar" — o
 * usuário não sabia se era rede, permissão, sessão expirada ou bug do
 * servidor. Agora cada classe de erro tem copy específica.
 */

import type { Translate } from "./types";

/**
 * Discrimina o tipo do erro pra escolher a mensagem certa.
 *
 * `cause` é o erro do `catch` do fetch — pode ser:
 *   - `AbortError` (cleanup ao desmontar — não mostrar nada)
 *   - `TypeError` (rede caiu, CORS, DNS) → mensagem de offline
 *   - server respondeu com status code → mapear por faixa
 */
export interface FetchErrorContext {
  status?: number;
  serverMessage?: string;
  cause?: unknown;
  /** Fallback quando nada acima identificar o erro. */
  fallbackKey: string;
}

/** `true` quando o erro veio de um abort intencional (cleanup). */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** `true` quando o erro veio de rede inacessível (fetch failed). */
export function isNetworkError(err: unknown): boolean {
  // O fetch nativo dispara `TypeError: Failed to fetch` quando offline.
  // O Reanimated/Hermes pode dar mensagens ligeiramente diferentes —
  // checa por nome E mensagem pra robustez.
  if (!(err instanceof TypeError)) return false;
  return /fetch|network|connection/i.test(err.message);
}

/**
 * Resolve mensagem i18n contextual a partir de status code + cause.
 * Retorna `null` quando o erro deve ser silenciado (AbortError de cleanup).
 *
 * Bug investigation 2026-05-15 (3 users): a versão anterior caía no
 * fallback genérico ("Não foi possível adicionar a criança") quando
 * status era 400 SEM serverMessage. UX perdia informação útil. Esta
 * versão SEMPRE mostra status + algo informativo, e prioriza a
 * exception (cause.message) quando ela existe.
 */
export function resolveFetchErrorMessage(
  ctx: FetchErrorContext,
  t: Translate,
): string | null {
  if (isAbortError(ctx.cause)) return null;
  if (isNetworkError(ctx.cause)) return t("onboardingForm.errorNetwork");

  // Server message do JSON tem prioridade — vem da action/route com contexto
  if (ctx.serverMessage) return ctx.serverMessage;

  if (typeof ctx.status === "number") {
    if (ctx.status === 401) return t("common.sessionExpired");
    if (ctx.status === 403) return t("onboardingForm.errorPermission");
    if (ctx.status === 409) return t("onboardingForm.errorConflict");
    if (ctx.status >= 500) return `${t("onboardingForm.errorServer")} (${ctx.status})`;
    if (ctx.status >= 400) return `${t(ctx.fallbackKey)} (HTTP ${ctx.status})`;
  }

  if (ctx.cause instanceof Error && ctx.cause.message) {
    return `${t(ctx.fallbackKey)}: ${ctx.cause.message}`;
  }

  return t(ctx.fallbackKey);
}
