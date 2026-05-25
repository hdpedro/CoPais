"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureServerEvent } from "@/lib/posthog-server";
import { sendWelcomeEmail } from "@/lib/emails/welcome";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { recordLoginDevice } from "@/lib/auth-login-device";
import { ipFromHeaders, geoFromHeaders } from "@/lib/auth-fingerprint";
import { APP_TERMS_VERSION, APP_PRIVACY_VERSION } from "@/lib/auth-versions";
import {
  mapSupabaseAuthError,
  type AuthErrorCode,
} from "@/lib/auth-error-codes";

/**
 * Shape comum de retorno de erro pras auth actions. O client renderiza via
 * `t('error.auth.{errorCode}', errorParams)` e usa `errorCode` pra branch
 * de UI (ex: mostrar CTA "Reenviar e-mail" quando `email_not_confirmed`).
 * `error` (texto pt-BR) fica como fallback pra clients sem i18n.
 */
export interface AuthActionError {
  error: string;
  errorCode: AuthErrorCode;
  errorParams?: Record<string, string | number>;
}

function authErrorReturn(
  error: { message?: string | null; code?: string | null } | null | undefined,
): AuthActionError {
  const mapped = mapSupabaseAuthError(error);
  return {
    error: mapped.fallbackMessage,
    errorCode: mapped.code,
    ...(mapped.params ? { errorParams: mapped.params } : {}),
  };
}

function validationError(
  errorCode: AuthErrorCode,
  message: string,
): AuthActionError {
  return { error: message, errorCode };
}

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const convite = formData.get("convite") as string | null;

  // ---------- Tier A: Anti-bot via Cloudflare Turnstile ----------
  // O widget envia o token no campo `cf-turnstile-response`. Se a env var
  // `TURNSTILE_SECRET_KEY` não estiver setada (staging/dev), `verifyTurnstileToken`
  // retorna {ok:true} (fail-open). Em prod com env configurada, bloqueia bots.
  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  const reqHeaders = await headers();
  const clientIp = ipFromHeaders(reqHeaders);
  const tsResult = await verifyTurnstileToken(turnstileToken, clientIp);
  if (!tsResult.ok) {
    captureServerEvent(email, "signup_blocked_bot", { reason: tsResult.reason });
    return validationError(
      "captcha_failed",
      "Não conseguimos validar que você é humano. Recarregue a página e tente de novo.",
    );
  }

  // Referral code — either passed via form (`?ref=XXX` on signup URL) or
  // read from the kindar_ref cookie dropped by /r/[code]. The handle_new_user
  // trigger validates the code exists before saving referred_by.
  const refFromForm = (formData.get("ref") as string | null)?.toUpperCase().trim() || null;
  const cookieStore = await cookies();
  const refFromCookie = cookieStore.get("kindar_ref")?.value?.toUpperCase().trim() || null;
  const refCode = refFromForm || refFromCookie;

  // Confirmation link aponta pra /auth/confirm (token_hash flow). O template
  // do Supabase no Dashboard precisa usar {{ .TokenHash }} em vez de
  // {{ .ConfirmationURL }} pra que isso funcione cross-device.
  const callbackUrl = new URL("/auth/confirm", process.env.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("type", "signup");
  if (convite) {
    callbackUrl.searchParams.set("next", `/convite/${convite}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        ...(refCode ? { referred_by: refCode } : {}),
      },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return authErrorReturn(error);
  }

  // ---------- Tier A: LGPD — INSERT versionado em terms_acceptances ----------
  // Append-only (trigger bloqueia UPDATE/DELETE). Fire-and-forget: nunca
  // bloqueia signup mesmo se DB estiver lento.
  if (data.user?.id) {
    void (async () => {
      try {
        const admin = createAdminClient();
        await admin.from("terms_acceptances").insert({
          user_id: data.user!.id,
          terms_version: APP_TERMS_VERSION,
          privacy_version: APP_PRIVACY_VERSION,
          ip_address: clientIp,
          user_agent: reqHeaders.get("user-agent"),
        });
      } catch (err) {
        console.error("[signUp] terms_acceptances insert failed (non-blocking):", err);
      }
    })();
  }

  // Resolve user locale from the cookie middleware set on first visit
  // (Accept-Language detection). Persist into profiles.locale so server-side
  // jobs (push, email, WhatsApp) can localize when the user has no active
  // request context. handle_new_user trigger created the row with default
  // 'pt'; we upsert here using the actual browser preference.
  const signupLocaleRaw = cookieStore.get("kindar-locale")?.value;
  const signupLocale = (["pt", "en", "es", "fr", "de"] as const).includes(
    signupLocaleRaw as never,
  )
    ? (signupLocaleRaw as "pt" | "en" | "es" | "fr" | "de")
    : "pt";
  if (data.user?.id && signupLocale !== "pt") {
    await supabase
      .from("profiles")
      .update({ locale: signupLocale })
      .eq("id", data.user.id);
  }

  captureServerEvent(email, "user_signup", { has_invite: !!convite });
  captureServerEvent(email, "signup_completed", {
    has_invite: !!convite,
    has_referral: !!refCode,
    ref_code: refCode,
    locale: signupLocale,
    terms_version: APP_TERMS_VERSION,
    privacy_version: APP_PRIVACY_VERSION,
  });

  void sendWelcomeEmail(email, fullName, { locale: signupLocale });

  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(formData: FormData) {
  const rememberMe = formData.get("rememberMe") === "on";
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const convite = formData.get("convite") as string | null;

  // Store preference so Supabase cookie handlers can read it
  const cookieStore = await cookies();
  cookieStore.set("remember_me", rememberMe ? "true" : "false", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 0,
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return authErrorReturn(error);
  }

  cookieStore.set("kindar-has-session", "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  captureServerEvent(email, "user_login", { has_invite: !!convite });

  // ---------- Tier A: login device fingerprint + alert ----------
  // Fire-and-forget. Resolve user + envia alert email se for novo device.
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const reqHeaders = await headers();
      const ip = ipFromHeaders(reqHeaders);
      const geo = geoFromHeaders(reqHeaders);
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      await recordLoginDevice({
        userId: user.id,
        email: user.email!,
        firstName: profile?.full_name?.split(" ")[0] ?? null,
        userAgent: reqHeaders.get("user-agent"),
        ip,
        country: geo.country,
        city: geo.city,
      });
    } catch (err) {
      console.error("[signIn] recordLoginDevice failed:", err);
    }
  })();

  if (convite) {
    redirect(`/convite/${convite}`);
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.set("remember_me", "", { maxAge: 0, path: "/" });
  cookieStore.set("kindar-has-session", "", { maxAge: 0, path: "/" });

  redirect("/login?logout=1");
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  // Aponta pra /auth/confirm — token_hash flow (cross-device safe).
  const redirectUrl = new URL("/auth/confirm", process.env.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set("type", "recovery");
  redirectUrl.searchParams.set("next", "/reset-password");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl.toString(),
  });

  if (error) {
    return authErrorReturn(error);
  }

  captureServerEvent(email, "password_reset");
  return { success: "E-mail de recuperação enviado!" };
}

export async function signInWithOAuth(
  provider: "google" | "apple" | "facebook",
  redirectPath?: string,
) {
  const supabase = await createClient();

  // OAuth segue usando /auth/callback (PKCE pra OAuth flow é certo —
  // same-browser sempre). Token_hash é só pra signup/magiclink/recovery.
  const callbackUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL);
  if (redirectPath) {
    callbackUrl.searchParams.set("next", redirectPath);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return authErrorReturn(error);
  }

  if (data.url) {
    redirect(data.url);
  }

  return validationError("oauth_failed", "Erro ao iniciar login social.");
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return authErrorReturn(error);
  }

  redirect("/dashboard");
}

// ============================================================
// TIER A — Resend confirmation + Magic Link
// ============================================================

/**
 * Reenvia o e-mail de confirmação de signup pro email informado.
 *
 * Usado por:
 *   - /verify-email (botão "Reenviar e-mail" com countdown 60s)
 *   - /auth/confirm/error (em caso de link expirado)
 *
 * Rate limit do Supabase: 1 reenvio por 60s. Erro `For security purposes...`
 * é traduzido pra mensagem humana.
 */
export async function resendConfirmation(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email) {
    return validationError("validation_failed", "E-mail obrigatório.");
  }

  const supabase = await createClient();
  const callbackUrl = new URL("/auth/confirm", process.env.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("type", "signup");
  callbackUrl.searchParams.set("next", "/dashboard");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    return authErrorReturn(error);
  }

  captureServerEvent(email, "signup_resend");
  return { success: true };
}

/**
 * Envia um magic link pro email informado. Login passwordless.
 *
 * Usado por:
 *   - /login (bloco "Entrar sem senha")
 *   - /verify-email (botão "Receber link sem senha" — alternativa quando
 *     user travou no signup confirm)
 *
 * Cria conta automaticamente se o e-mail não existir (Supabase default).
 * Pra restringir só pra contas existentes, passar `options.shouldCreateUser: false`.
 * Hoje deixamos criar — funciona como fallback pra users que confundiram
 * email no signup ou nunca completaram.
 */
export async function sendMagicLink(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email) {
    return validationError("validation_failed", "E-mail obrigatório.");
  }

  // Turnstile
  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  const reqHeaders = await headers();
  const clientIp = ipFromHeaders(reqHeaders);
  const tsResult = await verifyTurnstileToken(turnstileToken, clientIp);
  if (!tsResult.ok) {
    return validationError(
      "captcha_failed",
      "Não conseguimos validar que você é humano.",
    );
  }

  const supabase = await createClient();
  const callbackUrl = new URL("/auth/confirm", process.env.NEXT_PUBLIC_APP_URL);
  callbackUrl.searchParams.set("type", "magiclink");
  callbackUrl.searchParams.set("next", "/dashboard");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    return authErrorReturn(error);
  }

  captureServerEvent(email, "magic_link_sent");
  return { success: true };
}
