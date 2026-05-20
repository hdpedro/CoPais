import { getResend } from "@/lib/email";
import { resolveEmailLocale } from "@/lib/emails/_locale";
import type { Locale } from "@/i18n";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

/**
 * Welcome email sent right after signup completes successfully.
 *
 * Locale resolution:
 *   1. Explicit `locale` argument (caller already knows the user's choice).
 *   2. `userId` argument → reads profiles.locale (migration 00083).
 *   3. Falls back to pt-BR.
 *
 * Email failures never block signup — wrapped in try/catch + best-effort.
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string,
  options?: { userId?: string; locale?: Locale },
) {
  try {
    const resend = getResend();
    const { t, locale } = await resolveEmailLocale({
      userId: options?.userId ?? null,
      locale: options?.locale ?? null,
    });
    const firstName = name?.split(" ")[0] || t("auth.tagline").split(" ")[0]; // safe non-pt fallback

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: t("emails.welcome.subject", { name: firstName }),
      html: buildWelcomeHtml(firstName, t, locale),
    });
  } catch (error) {
    console.error("[email] Failed to send welcome email:", error);
    // Never block signup for email failure
  }
}

function buildWelcomeHtml(
  firstName: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: Locale,
): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">${t("emails.welcome.tagline")}</p>
  </div>

  <!-- Card -->
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      ${t("emails.welcome.greeting", { name: firstName })}
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      ${t("emails.welcome.intro")}
    </p>

    <!-- Steps - bug Nessa 2026-05-20 (DM): números invisíveis no Outlook/Apple Mail.
         display:flex em emails é parcialmente suportado (Gmail web OK, mobile não).
         Quando flex não aplica, o número fica left-aligned no canto sem centralização.
         Fix: table layout — padrão de email HTML, suportado 100% dos clients. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
      <tr>
        <td valign="top" style="width:40px;padding-bottom:16px">
          <div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;text-align:center">1</div>
        </td>
        <td valign="top" style="padding-bottom:16px;padding-left:8px">
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">${t("emails.welcome.step1Title")}</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">${t("emails.welcome.step1Body")}</p>
        </td>
      </tr>
      <tr>
        <td valign="top" style="width:40px;padding-bottom:16px">
          <div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;text-align:center">2</div>
        </td>
        <td valign="top" style="padding-bottom:16px;padding-left:8px">
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">${t("emails.welcome.step2Title")}</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">${t("emails.welcome.step2Body")}</p>
        </td>
      </tr>
      <tr>
        <td valign="top" style="width:40px">
          <div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;text-align:center">3</div>
        </td>
        <td valign="top" style="padding-left:8px">
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">${t("emails.welcome.step3Title")}</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">${t("emails.welcome.step3Body")}</p>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <a href="${APP_URL}/dashboard" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      ${t("emails.welcome.ctaButton")} →
    </a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:12px;color:#9A8878;margin:0">
      ${t("emails.welcome.footer")}
    </p>
    <p style="font-size:11px;color:#C4BEB6;margin:8px 0 0">
      © 2024-2026 Kindar. All rights reserved.
    </p>
  </div>

</div>
</body>
</html>`;
}
