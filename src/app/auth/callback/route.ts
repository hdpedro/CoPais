import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/emails/welcome";
import { captureServerEvent } from "@/lib/posthog-server";
import { getAttribution, attributionEventProps } from "@/lib/attribution";
import {
  mapOAuthCallbackError,
  type AuthErrorCode,
} from "@/lib/auth-error-codes";

/**
 * Redireciona pra /login passando o errorCode pela query — o client
 * resolve via `t('error.auth.{code}', errorParams)`. Substitui o padrão
 * antigo `?error=<mensagem crua em inglês>` que vazava strings EN pra UI
 * (bug Bruna 2026-05-22).
 */
function redirectToLoginWithErrorCode(
  origin: string,
  errorCode: AuthErrorCode,
  errorParams?: Record<string, string | number>,
) {
  const params = new URLSearchParams();
  params.set("errorCode", errorCode);
  if (errorParams) {
    params.set("errorParams", JSON.stringify(errorParams));
  }
  return NextResponse.redirect(`${origin}/login?${params.toString()}`);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  // OAuth provider returned an error — map upstream message to a stable code.
  if (error) {
    const mapped = mapOAuthCallbackError(error, error_description);
    return redirectToLoginWithErrorCode(origin, mapped.code, mapped.params);
  }

  // OAuth logins always persist session (equivalent to "Lembrar-me" checked)
  const cookieStore = await cookies();
  cookieStore.set("remember_me", "true", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });

  // Set long-lived flag for Safari ITP session recovery
  cookieStore.set("kindar-has-session", "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  const supabase = await createClient();

  // Handle PKCE code exchange (used for email confirmation, OAuth, password reset)
  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // For recovery flow, always go to reset-password page
      if (type === "recovery" || next === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      // Check if this is a new user (first OAuth login) and send welcome email
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const createdAt = new Date(user.created_at);
          const isNewUser = (Date.now() - createdAt.getTime()) < 60000; // Created less than 60s ago
          if (isNewUser) {
            // Resolução em camadas: metadata do provider (cobre Google `name`,
            // `given_name`+`family_name`, `full_name`); fallback final pro
            // prefixo do email já capitalizado pelo split-replace, NUNCA o
            // user.id. Espelha a lógica do trigger SQL handle_new_user
            // (migration 00081). O `display_name` da row recém-criada só
            // estaria disponível depois do trigger rodar — pra welcome email
            // não esperamos, montamos aqui mesmo a partir da metadata.
            const meta = user.user_metadata ?? {};
            const givenFamily = [meta.given_name, meta.family_name].filter(Boolean).join(" ").trim();
            const emailLocal = user.email?.split("@")[0] ?? "";
            const fullName =
              meta.full_name?.trim() ||
              meta.name?.trim() ||
              givenFamily ||
              emailLocal.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
              "";
            // Marketing attribution (first-touch) — mesmo padrão da signUp
            // action: persiste no perfil pro webhook do Stripe carimbar a
            // conversão paga, e carimba o user_signup deste login OAuth.
            const attribution = await getAttribution();
            if (attribution) {
              try {
                const admin = createAdminClient();
                await admin
                  .from("profiles")
                  .update({ first_touch_utm: attribution })
                  .eq("id", user.id);
              } catch (err) {
                console.error(
                  "[auth/callback] first_touch_utm persist failed (non-blocking):",
                  err,
                );
              }
            }
            captureServerEvent(user.id, "user_signup", {
              provider: "oauth",
              ...attributionEventProps(attribution),
            });
            void sendWelcomeEmail(user.email!, fullName);
          }
        }
      } catch {
        // Never block auth callback for email failure
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    // If code exchange fails, the magic-link / OAuth code is stale.
    console.error("Auth callback code exchange error:", exchangeError.message);
    return redirectToLoginWithErrorCode(origin, "otp_expired");
  }

  // Handle token_hash verification (used by some Supabase email templates)
  if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "email",
      token_hash,
    });

    if (!verifyError) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Auth callback token verify error:", verifyError.message);
    return redirectToLoginWithErrorCode(origin, "otp_expired");
  }

  // No auth params found — the user landed here without a code/token.
  return redirectToLoginWithErrorCode(origin, "oauth_failed");
}
