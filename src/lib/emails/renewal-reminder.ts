import { getResend } from "@/lib/email";
import { getPlanAmountBrl } from "@/lib/billing/split";
import { formatBRL } from "@/lib/format/currency";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

const PLAN_NAMES: Record<string, string> = {
  harmonia_earlybird_monthly: "Harmonia — Early Bird",
  harmonia_earlybird_annual: "Harmonia — Early Bird Anual",
  harmonia_monthly: "Harmonia",
  harmonia_annual: "Harmonia Anual",
  premium_juridico_monthly: "Premium Jurídico",
  premium_juridico_annual: "Premium Jurídico Anual",
};

/**
 * Sent 3 days before the current_period_end. Transparency reduces
 * churn-by-surprise — users who don't want to renew have 3 days to
 * cancel without the "I didn't realize it was automatic" backlash.
 *
 * Apple and Google both already send their own renewal notices, so
 * this email is extra (Stripe subs don't get a renewal notice from
 * Stripe by default).
 */
export async function sendRenewalReminderEmail(
  email: string,
  name: string | null,
  planId: string,
  renewalDate: string
) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "você";
    const planName = PLAN_NAMES[planId] ?? "Kindar Premium";
    const amount = getPlanAmountBrl(planId) ?? 0;
    const renewalDateLocal = new Date(renewalDate).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Sua assinatura Kindar renova em 3 dias`,
      html: buildHtml(firstName, planName, amount, renewalDateLocal),
    });
  } catch (error) {
    console.error("[email] Failed to send renewal-reminder email:", error);
  }
}

function buildHtml(
  firstName: string,
  planName: string,
  amount: number,
  renewalDateLocal: string
): string {
  const amountFmt = formatBRL(amount);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      Oi ${firstName}, só um aviso
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 20px">
      Sua assinatura <strong>${planName}</strong> renova automaticamente em <strong>${renewalDateLocal}</strong>.
    </p>

    <div style="background:#F7F2EC;border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="font-size:13px;color:#9A8878;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">
        Próxima cobrança
      </p>
      <p style="font-size:28px;font-weight:700;color:#0E0C0A;margin:0">${amountFmt}</p>
      <p style="font-size:13px;color:#6B6560;margin:6px 0 0">em ${renewalDateLocal}</p>
    </div>

    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0 0 16px">
      Se quiser continuar com o Kindar, você não precisa fazer nada — a cobrança vai acontecer automaticamente.
    </p>
    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Se preferir cancelar, é rápido e sem burocracia:
    </p>

    <a href="${APP_URL}/assinatura" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-bottom:12px">
      Gerenciar assinatura →
    </a>

    <p style="font-size:12px;color:#9A8878;text-align:center;margin:12px 0 0">
      Usuários iOS: cancele em Ajustes &gt; Apple ID &gt; Assinaturas. Android: Google Play &gt; Assinaturas.
    </p>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}
