import { getResend } from "@/lib/email";
import { resolveEmailLocale } from "@/lib/emails/_locale";
import type { Locale } from "@/i18n";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.kindar.com.br";

export interface LoginAlertContext {
  /** Recipient — required */
  email: string;
  /** Used in greeting; pode ser null se signup só com email */
  firstName?: string | null;
  /** ProfileId pra resolver locale */
  userId: string;
  /** Resumo do device: ex. "iPhone · Safari" */
  deviceLabel: string;
  /** "São Paulo, BR" ou "BR" se city desconhecida */
  locationLabel: string;
  /** ISO timestamp UTC */
  whenIso: string;
}

/**
 * Email "novo dispositivo" disparado pelo `recordLoginDevice()` da primeira
 * vez que um (user_id, device_hash) aparece em `auth_login_devices`.
 *
 * Disparo único — `alert_sent_at` é setado após primeiro envio bem-sucedido.
 * Re-logins do mesmo device só atualizam `last_seen`.
 *
 * Tom premium: factual, não alarmista. Padrão de Stripe / Github / Apple ID.
 */
export async function sendLoginAlertEmail(
  ctx: LoginAlertContext,
  options?: { locale?: Locale },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resend = getResend();
    const { t, locale, bcp47 } = await resolveEmailLocale({
      userId: ctx.userId,
      locale: options?.locale ?? null,
    });
    const firstName = ctx.firstName?.trim().split(" ")[0] || t("emails.loginAlert.fallbackName");
    const whenHuman = formatWhen(ctx.whenIso, bcp47);

    await resend.emails.send({
      from: "Kindar <suporte@kindar.com.br>",
      replyTo: "suporte@kindar.com.br",
      to: ctx.email,
      subject: t("emails.loginAlert.subject"),
      html: buildHtml({
        firstName,
        deviceLabel: ctx.deviceLabel,
        locationLabel: ctx.locationLabel,
        whenHuman,
        t,
        locale,
      }),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] login-alert failed:", message);
    return { ok: false, error: message };
  }
}

function formatWhen(iso: string, bcp47: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(bcp47, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(d);
  } catch {
    return iso;
  }
}

function buildHtml(args: {
  firstName: string;
  deviceLabel: string;
  locationLabel: string;
  whenHuman: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
}): string {
  const { firstName, deviceLabel, locationLabel, whenHuman, t, locale } = args;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${t("emails.loginAlert.subject")}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">${t("auth.tagline")}</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      ${t("emails.loginAlert.greeting", { name: firstName })}
    </h2>
    <p style="font-size:15px;color:#3E3933;line-height:1.6;margin:0 0 24px">
      ${t("emails.loginAlert.intro")}
    </p>

    <div style="background:#F7F4EE;border-radius:12px;padding:16px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
        <span style="font-size:13px;color:#9A8878">${t("emails.loginAlert.deviceLabel")}</span>
        <span style="font-size:14px;color:#0E0C0A;font-weight:500;text-align:right">${deviceLabel}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
        <span style="font-size:13px;color:#9A8878">${t("emails.loginAlert.locationLabel")}</span>
        <span style="font-size:14px;color:#0E0C0A;font-weight:500;text-align:right">${locationLabel}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
        <span style="font-size:13px;color:#9A8878">${t("emails.loginAlert.whenLabel")}</span>
        <span style="font-size:14px;color:#0E0C0A;font-weight:500;text-align:right">${whenHuman}</span>
      </div>
    </div>

    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0 0 16px">
      <strong style="color:#0E0C0A">${t("emails.loginAlert.youLabel")}</strong> ${t("emails.loginAlert.youBody")}
    </p>
    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      <strong style="color:#A82B2B">${t("emails.loginAlert.notYouLabel")}</strong> ${t("emails.loginAlert.notYouBody")}
    </p>

    <a href="${APP_URL}/forgot-password"
       style="display:block;text-align:center;background:#A82B2B;color:white;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none">
      ${t("emails.loginAlert.cta")}
    </a>
  </div>

  <div style="text-align:center;margin-top:24px">
    <p style="font-size:12px;color:#9A8878;margin:0">${t("emails.loginAlert.footer")}</p>
    <p style="font-size:11px;color:#C4BEB6;margin:8px 0 0">© 2024-2026 Kindar</p>
  </div>

</div>
</body>
</html>`;
}
