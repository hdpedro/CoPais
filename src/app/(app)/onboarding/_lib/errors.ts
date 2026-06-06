/**
 * Mapeamento de erros de fetch → mensagem i18n contextual.
 *
 * Antes, qualquer falha caía no mesmo "Não foi possível adicionar" — o
 * usuário não sabia se era rede, permissão, sessão expirada ou bug do
 * servidor. Agora cada classe de erro tem copy específica.
 *
 * Layer de codes estáveis (2026-05-15): rotas `/api/children/*` agora
 * retornam `code` no body (vindo de `services/children.ts:ChildErrorCode`).
 * Quando o body inclui `code`, o resolver mapeia direto pra i18n key
 * específica — usuário em qualquer dos 5 idiomas vê copy correta sem
 * depender de mensagem PT-BR do servidor. `serverMessage` fica como
 * fallback quando o code é desconhecido (rotas antigas).
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
  /**
   * `code` estável do body (services/children.ts retorna como
   * `errorCode`; a rota copia pra `code` no JSON). Quando presente +
   * conhecido, prioriza i18n key sobre `serverMessage` pra suportar 5
   * idiomas sem depender de copy PT-BR cravada no servidor.
   */
  errorCode?: string;
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
 * Mapeia `errorCode` estável do service pra i18n key.
 * Retorna `null` quando o code é desconhecido (rotas antigas / outros
 * domínios) — caller cai pro fluxo de `serverMessage` / status.
 *
 * IMPORTANTE: tabela espelhada em
 * `kindar-native/app/onboarding/_lib/errors.ts` — qualquer key nova
 * precisa estar nos 5 locales (PT/EN/ES/FR/DE) e em ambos os errors.ts.
 */
export function errorCodeToI18nKey(code: string): string | null {
  switch (code) {
    case "fk_blocked":
      return "onboardingForm.errorFkBlocked";
    case "check_violation":
      return "onboardingForm.errorCheckViolation";
    case "permission_denied":
      return "onboardingForm.errorPermission";
    case "not_found":
      return "onboardingForm.errorNotFound";
    case "wrong_group":
      return "onboardingForm.errorWrongGroup";
    case "unique_violation":
      return "onboardingForm.errorConflict";
    case "future_birthdate":
      return "onboardingForm.errorFutureBirthdate";
    case "invalid_date":
      return "onboardingForm.errorInvalidDate";
    case "missing_fields":
      return "onboardingForm.errorMissingFields";
    case "no_changes":
      return "onboardingForm.errorNoChanges";
    default:
      return null;
  }
}

/**
 * Resolve mensagem i18n contextual a partir de errorCode/status/cause.
 * Retorna `null` quando o erro deve ser silenciado (AbortError de cleanup).
 *
 * Bug investigation 2026-05-15 (3 users): a versão anterior caía no
 * fallback genérico ("Não foi possível adicionar a criança") quando
 * status era 400 SEM serverMessage. UX perdia informação útil. Esta
 * versão SEMPRE mostra status + algo informativo, e prioriza a
 * exception (cause.message) quando ela existe.
 *
 * Ordem de prioridade (2026-05-15 ecosistema fix):
 *   1. AbortError → null (silencia cleanup)
 *   2. Network error → errorNetwork (offline detectado)
 *   3. errorCode conhecido → i18n key dedicada (i18n em 5 línguas)
 *   4. serverMessage → mensagem do servidor (fallback PT-BR)
 *   5. status code (401/403/409/5xx/4xx) → i18n key por faixa
 *   6. cause.message → mensagem genérica + exception
 *   7. fallbackKey → último recurso
 */
export function resolveFetchErrorMessage(
  ctx: FetchErrorContext,
  t: Translate,
): string | null {
  if (isAbortError(ctx.cause)) return null;
  if (isNetworkError(ctx.cause)) return t("onboardingForm.errorNetwork");

  // errorCode estável tem PRIORIDADE sobre serverMessage — i18n local
  // sempre vence copy PT-BR do servidor.
  if (ctx.errorCode) {
    const key = errorCodeToI18nKey(ctx.errorCode);
    if (key) return t(key);
  }

  // Server message do JSON — fallback quando errorCode é unknown/absent.
  // Coerção defensiva: o body pode trazer `error` como OBJETO (erro Postgrest/
  // Supabase serializado {code, id, message}); renderizar objeto em JSX crasha
  // ("Objects are not valid as a React child"). Força string (lendo .message).
  const sm = ctx.serverMessage as unknown;
  if (sm != null) {
    const serverText =
      typeof sm === "string"
        ? sm
        : typeof (sm as { message?: unknown }).message === "string"
          ? (sm as { message: string }).message
          : "";
    if (serverText) return serverText;
  }

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
