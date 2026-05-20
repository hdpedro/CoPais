import { getResend } from "@/lib/email";
import { resolveEmailLocale } from "@/lib/emails/_locale";
import type { Locale } from "@/i18n";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.kindar.com.br";

/**
 * Email humanizado disparado pra usuário que ficou travado na confirmação
 * de signup. Causa raiz mais comum era o PKCE cross-device do Supabase
 * (link de email aberto em WebView do Gmail/Outlook sem o code_verifier).
 *
 * Quando este email sai:
 *   - Manualmente via `scripts/dispatch-rescue-now.mjs` (one-shot pra testers
 *     que travaram antes do fix).
 *   - Automaticamente via `/api/cron/signup-rescue` (hourly) pra qualquer
 *     usuário que ficar com `email_confirmed_at IS NULL` por mais de 1h.
 *
 * O cron AUTO-CONFIRMA o user no banco antes de enviar — o tom do email
 * reflete isso: a conta já está liberada, basta logar.
 *
 * Tom: acolhedor, founder-style, assume a culpa. NÃO técnico.
 * Falhas no envio NUNCA bloqueiam o caller (cron continua processando
 * outros users mesmo se um falhar).
 */
export async function sendSignupRescueEmail(
  email: string,
  name?: string,
  options?: { userId?: string; locale?: Locale },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resend = getResend();
    const { t, locale } = await resolveEmailLocale({
      userId: options?.userId ?? null,
      locale: options?.locale ?? null,
    });
    const firstName = name?.trim().split(" ")[0] || t("emails.signupRescue.fallbackName");

    await resend.emails.send({
      from: "Kindar <suporte@kindar.com.br>",
      replyTo: "suporte@kindar.com.br",
      to: email,
      subject: t("emails.signupRescue.subject"),
      html: buildHtml(firstName, t, locale),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] signup-rescue failed:", message);
    return { ok: false, error: message };
  }
}

function buildHtml(
  firstName: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: Locale,
): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${t("emails.signupRescue.subject")}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">${t("auth.tagline")}</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 16px">
      ${t("emails.signupRescue.greeting", { name: firstName })}
    </h2>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 16px">
      ${t("emails.signupRescue.intro")}
    </p>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
      <strong>${t("emails.signupRescue.fixedLabel")}</strong> ${t("emails.signupRescue.fixedBody")}
    </p>

    <a href="${APP_URL}/login"
       style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin:8px 0 24px">
      ${t("emails.signupRescue.ctaButton")}
    </a>

    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0">
      ${t("emails.signupRescue.replyHint")}
    </p>
  </div>

  <div style="text-align:center;margin-top:24px">
    <p style="font-size:14px;color:#3E3933;margin:0 0 4px">${t("emails.signupRescue.signature")}</p>
    <p style="font-size:11px;color:#C4BEB6;margin:16px 0 0">© 2024-2026 Kindar</p>
  </div>

</div>
</body>
</html>`;
}
