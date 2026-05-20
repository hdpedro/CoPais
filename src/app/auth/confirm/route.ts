import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Token-hash confirmation handler — substitui o PKCE `?code=` flow do
 * /auth/callback pra fluxos baseados em email (signup, magic link, password
 * recovery, email change).
 *
 * **Por que existe (causa raiz):**
 *   PKCE armazena o `code_verifier` num cookie httpOnly do browser onde o
 *   `signUp` foi executado. Quando o usuário clica o link de confirmação
 *   no app Gmail/Outlook do celular, o WebView interno **não compartilha
 *   cookies** com o Safari/Chrome onde fez o signup. `exchangeCodeForSession`
 *   falha por ausência do verifier → redirect "Link expirado" → user trava.
 *
 *   `verifyOtp({type, token_hash})` não exige cookies — funciona em qualquer
 *   browser/WebView/device. É o padrão "Tier A" pra fluxos cross-device.
 *
 * **Template Supabase precisa apontar pra cá** com `?token_hash={{ .TokenHash }}&type=...`.
 * Veja `SUPABASE-EMAIL-TEMPLATES.md` na raiz do projeto.
 *
 * Em falha:
 *   - Mensagens humanas em `/auth/confirm/error?reason=...`
 *   - Telemetria PostHog (`signup_confirm_failed`) com `reason`
 *   - Captura em `app_errors` quando `reason='unknown'`
 *
 * Em sucesso:
 *   - Estabelece sessão (cookies SSR via createClient)
 *   - Seta long-lived flag pra Safari ITP recovery
 *   - Welcome email se for primeira confirmação (createdAt < 60s)
 *   - Telemetria `signup_confirmed`
 *   - Redirect pro `next` (default `/dashboard`)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams, origin } = url;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "signup") as "signup" | "recovery" | "magiclink" | "email" | "email_change" | "invite";
  const next = searchParams.get("next") || "/dashboard";

  // Defensive: nada nos params → /confirm/error?reason=invalid
  if (!token_hash) {
    return redirectToError(origin, "invalid");
  }

  const supabase = await createClient();
  const cookieStore = await cookies();

  // Long-lived "session existed" flag — used by middleware to recover after Safari ITP
  cookieStore.set("kindar-has-session", "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // OAuth/Magic-link sessions persist (equivalente a "Remember me" marcado)
  cookieStore.set("remember_me", "true", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: mapType(type),
    token_hash,
  });

  if (verifyError) {
    const reason = classifyVerifyError(verifyError.message);
    captureServerEvent("anonymous", "signup_confirm_failed", {
      type,
      reason,
      raw_message: verifyError.message.slice(0, 200),
    });
    if (reason === "unknown") {
      reportServerError(verifyError, {
        filePath: "src/app/auth/confirm/route.ts",
        severity: "warning",
        metadata: { type, message: verifyError.message },
      });
    }
    return redirectToError(origin, reason);
  }

  // Sessão estabelecida. Coleta o user pra eventos.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const createdAt = new Date(user.created_at);
      const isFirstConfirmation = (Date.now() - createdAt.getTime()) < 5 * 60_000;
      captureServerEvent(user.id, "signup_confirmed", {
        type,
        is_first_confirmation: isFirstConfirmation,
      });
      if (isFirstConfirmation && type === "signup") {
        const meta = user.user_metadata ?? {};
        const givenFamily = [meta.given_name, meta.family_name].filter(Boolean).join(" ").trim();
        const emailLocal = user.email?.split("@")[0] ?? "";
        const fullName =
          meta.full_name?.trim() ||
          meta.name?.trim() ||
          givenFamily ||
          emailLocal.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
          "";
        // Welcome email já foi disparado por signUp() server action — não duplicar.
        // Se for OAuth via /auth/callback que não passou por signUp(), aí sim.
        // Pra signup via email/senha + token_hash flow, o welcome já saiu.
        // Mantém apenas evento de telemetria.
        void fullName; // unused — placeholder pra futuro
      }
    }
  } catch {
    // Telemetria nunca quebra fluxo
  }

  // Recovery → reset-password
  if (type === "recovery" || next === "/reset-password") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function mapType(t: string): "recovery" | "signup" | "email" | "invite" | "magiclink" | "email_change" {
  switch (t) {
    case "signup":
    case "recovery":
    case "magiclink":
    case "email":
    case "email_change":
    case "invite":
      return t;
    default:
      return "signup";
  }
}

function classifyVerifyError(msg: string): "expired" | "already_used" | "invalid" | "network" | "unknown" {
  const lower = msg.toLowerCase();
  if (lower.includes("expired") || lower.includes("otp expired")) return "expired";
  if (lower.includes("invalid") && (lower.includes("used") || lower.includes("consumed"))) return "already_used";
  if (lower.includes("invalid") || lower.includes("not found") || lower.includes("not valid")) return "invalid";
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("fetch")) return "network";
  return "unknown";
}

function redirectToError(origin: string, reason: string) {
  const url = new URL("/auth/confirm/error", origin);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString());
}

// Sustenta envio via POST (alguns clientes de email fazem POST em vez de GET)
export const POST = GET;
