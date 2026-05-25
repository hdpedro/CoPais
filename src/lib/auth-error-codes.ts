/**
 * Source-of-truth pra mapear erros do Supabase auth pra códigos estáveis.
 *
 * Códigos são strings consistentes que:
 *   - sobrevivem a mudanças em mensagens upstream (Supabase muda copy às vezes),
 *   - funcionam como chave i18n (`error.auth.{code}`) nos 5 locales,
 *   - permitem branching de UI (ex: mostrar CTA "Reenviar e-mail" quando
 *     `code === 'email_not_confirmed'`) sem depender de string-match frágil.
 *
 * Paridade PWA ↔ Native: quando expandir, sincronizar com
 * `kindar-native/app/_src/lib/auth-errors.ts`. O teste unitário garante
 * que ambos resolvem o mesmo código pros mesmos inputs.
 */

import type { AuthError } from "@supabase/supabase-js";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "email_address_invalid"
  | "weak_password"
  | "same_password"
  | "session_missing"
  | "user_not_found"
  | "over_email_send_rate_limit"
  | "rate_limit_with_seconds"
  | "otp_expired"
  | "otp_disabled"
  | "signup_disabled"
  | "user_banned"
  | "captcha_failed"
  | "provider_disabled"
  | "oauth_failed"
  | "validation_failed"
  | "unknown";

export interface MappedAuthError {
  code: AuthErrorCode;
  /**
   * PT-BR fallback usado quando o client não consegue resolver via i18n
   * (ex: caller server-side sem request context, telemetria de log).
   * Espelha a chave `error.auth.{code}` em `src/i18n/locales/pt.json`.
   */
  fallbackMessage: string;
  /**
   * Variáveis pra interpolação ICU na chave i18n. Hoje usado por
   * `rate_limit_with_seconds` (`{{ seconds }}`).
   */
  params?: Record<string, string | number>;
}

type Resolver = (rawMessage: string) => MappedAuthError;

/**
 * Resolvers por `error.code` do Supabase (auth-js v2.27+).
 * Lista oficial: `@supabase/auth-js/dist/main/lib/error-codes.d.ts`.
 * Inclui aliases (`email_exists` → `user_already_exists`) pra normalizar.
 */
const BY_CODE: Record<string, Resolver> = {
  invalid_credentials: () => ({
    code: "invalid_credentials",
    fallbackMessage: "E-mail ou senha incorretos.",
  }),
  email_not_confirmed: () => ({
    code: "email_not_confirmed",
    fallbackMessage:
      "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
  }),
  user_already_exists: () => ({
    code: "user_already_exists",
    fallbackMessage: "Este e-mail já está cadastrado.",
  }),
  email_exists: () => ({
    code: "user_already_exists",
    fallbackMessage: "Este e-mail já está cadastrado.",
  }),
  email_address_invalid: () => ({
    code: "email_address_invalid",
    fallbackMessage: "E-mail inválido.",
  }),
  weak_password: () => ({
    code: "weak_password",
    fallbackMessage: "A senha deve ter pelo menos 8 caracteres.",
  }),
  same_password: () => ({
    code: "same_password",
    fallbackMessage: "A nova senha deve ser diferente da senha atual.",
  }),
  session_not_found: () => ({
    code: "session_missing",
    fallbackMessage: "Sessão expirada. Faça login novamente.",
  }),
  session_expired: () => ({
    code: "session_missing",
    fallbackMessage: "Sessão expirada. Faça login novamente.",
  }),
  user_not_found: () => ({
    code: "user_not_found",
    fallbackMessage: "Usuário não encontrado.",
  }),
  over_email_send_rate_limit: () => ({
    code: "over_email_send_rate_limit",
    fallbackMessage: "Muitas tentativas. Aguarde alguns minutos.",
  }),
  over_request_rate_limit: () => ({
    code: "over_email_send_rate_limit",
    fallbackMessage: "Muitas tentativas. Aguarde alguns minutos.",
  }),
  otp_expired: () => ({
    code: "otp_expired",
    fallbackMessage: "Link expirado ou inválido. Solicite um novo.",
  }),
  otp_disabled: () => ({
    code: "otp_disabled",
    fallbackMessage: "Cadastro por OTP não permitido.",
  }),
  signup_disabled: () => ({
    code: "signup_disabled",
    fallbackMessage: "Cadastro temporariamente desabilitado.",
  }),
  user_banned: () => ({
    code: "user_banned",
    fallbackMessage: "Conta suspensa. Fale com o suporte.",
  }),
  captcha_failed: () => ({
    code: "captcha_failed",
    fallbackMessage:
      "Não conseguimos validar que você é humano. Tente novamente.",
  }),
  provider_disabled: () => ({
    code: "provider_disabled",
    fallbackMessage: "Provedor de login indisponível.",
  }),
  validation_failed: () => ({
    code: "validation_failed",
    fallbackMessage: "Dados inválidos. Confira e tente novamente.",
  }),
};

/**
 * Fallback por match de `error.message` em inglês.
 * Mantém compat com versões antigas do Supabase auth-js (pre-v2.27, sem
 * `error.code`) e providers que retornam só mensagem.
 */
const BY_MESSAGE: Record<string, () => MappedAuthError> = {
  "Invalid login credentials": () => BY_CODE.invalid_credentials!(""),
  "Email not confirmed": () => BY_CODE.email_not_confirmed!(""),
  "User already registered": () => BY_CODE.user_already_exists!(""),
  "Password should be at least 6 characters": () => ({
    code: "weak_password",
    fallbackMessage: "A senha deve ter pelo menos 6 caracteres.",
  }),
  "New password should be different from the old password.": () =>
    BY_CODE.same_password!(""),
  "Auth session missing!": () => BY_CODE.session_not_found!(""),
  "User not found": () => BY_CODE.user_not_found!(""),
  "Email rate limit exceeded": () => BY_CODE.over_email_send_rate_limit!(""),
  "For security purposes, you can only request this once every 60 seconds":
    () => ({
      code: "rate_limit_with_seconds",
      fallbackMessage: "Por segurança, aguarde 60 segundos entre tentativas.",
      params: { seconds: 60 },
    }),
  "Invalid email": () => BY_CODE.email_address_invalid!(""),
  "Email link is invalid or has expired": () => ({
    code: "otp_expired",
    fallbackMessage: "Link inválido ou expirado. Solicite um novo.",
  }),
  "Token has expired or is invalid": () => ({
    code: "otp_expired",
    fallbackMessage: "Token expirado ou inválido. Solicite um novo link.",
  }),
  "Signups not allowed for otp": () => BY_CODE.otp_disabled!(""),
};

type SupabaseErrorLike =
  | Pick<AuthError, "message" | "code">
  | { message?: string | null; code?: string | null }
  | null
  | undefined;

/**
 * Resolve um erro do Supabase em `{ code, fallbackMessage, params? }`.
 *
 * Ordem de resolução:
 *   1. Por `error.code` (Supabase auth-js v2.27+ envia code estável).
 *   2. Por regex dinâmico — captura "after N seconds" do rate-limit
 *      de signup/recovery e retorna `rate_limit_with_seconds` com
 *      `params.seconds` pra ICU.
 *   3. Por match exato de `error.message` — compat com versões antigas
 *      e providers que não populam code.
 *   4. Default: `unknown` com a mensagem original como fallback.
 */
export function mapSupabaseAuthError(error: SupabaseErrorLike): MappedAuthError {
  if (!error) {
    return { code: "unknown", fallbackMessage: "Erro inesperado." };
  }

  const code = (error as { code?: string | null }).code ?? undefined;
  const message = (error as { message?: string | null }).message ?? "";

  if (code && BY_CODE[code]) {
    return BY_CODE[code]!(message);
  }

  // Bug Henrique 2026-05-20: "after 57 seconds" caía na default e
  // retornava em inglês. O resolver dinâmico vem antes do match exato
  // pq a contagem de segundos é variável.
  const dynamicSecondsMatch = message.match(/after (\d+) seconds?/i);
  if (dynamicSecondsMatch) {
    const seconds = Number(dynamicSecondsMatch[1]);
    return {
      code: "rate_limit_with_seconds",
      fallbackMessage: `Por segurança, aguarde ${seconds} segundos para tentar novamente.`,
      params: { seconds },
    };
  }

  if (BY_MESSAGE[message]) {
    return BY_MESSAGE[message]!();
  }

  return {
    code: "unknown",
    fallbackMessage: message || "Erro inesperado.",
  };
}

/**
 * Mapeia erros vindos do OAuth callback (HTTP redirect com `?error=&error_description=`).
 *
 * Tenta o resolver padrão primeiro — providers às vezes retornam strings
 * reconhecíveis. Senão cai em `oauth_failed` com a mensagem original
 * preservada no fallback (mas escondida atrás de uma chave i18n).
 */
export function mapOAuthCallbackError(
  errorParam: string | null | undefined,
  errorDescription: string | null | undefined,
): MappedAuthError {
  const message = (errorDescription || errorParam || "").trim();

  if (message) {
    const mapped = mapSupabaseAuthError({ message });
    if (mapped.code !== "unknown") return mapped;
  }

  return {
    code: "oauth_failed",
    fallbackMessage: message
      ? `Falha no login social: ${message}`
      : "Falha no login social. Tente novamente.",
  };
}
