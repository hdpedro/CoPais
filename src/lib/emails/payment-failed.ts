import { getResend } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

/**
 * Sent when Stripe reports `invoice.payment_failed` — the customer's
 * card was declined or the bank refused the charge. Stripe will retry
 * automatically (Smart Retries), but we want the user to know and have
 * the option to update their payment method before access is suspended.
 *
 * Distinct from cancellation emails — this is recoverable.
 */
export async function sendPaymentFailedEmail(
  email: string,
  name: string | null,
  planName: string,
  retryDate: string | null
) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Não conseguimos processar a cobrança da sua assinatura`,
      html: buildHtml(firstName, planName, retryDate),
    });
  } catch (error) {
    // Non-fatal — webhook handler does its own try/catch.
    console.error("[email] Failed to send payment-failed email:", error);
  }
}

function buildHtml(firstName: string, planName: string, retryDate: string | null): string {
  const retryCopy = retryDate
    ? `Vamos tentar novamente em ${new Date(retryDate).toLocaleDateString("pt-BR")}.`
    : "Vamos tentar novamente nos próximos dias.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <div style="display:inline-block;background:#FFF4E5;color:#A55C00;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;margin-bottom:16px">
      Atenção · Pagamento recusado
    </div>
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      ${firstName}, sua cobrança não foi aprovada
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 20px">
      A última cobrança da sua assinatura ${planName} foi recusada pela operadora.
      Pode ter sido falta de saldo, cartão expirado ou bloqueio do banco.
    </p>
    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0 0 20px">
      ${retryCopy} Para evitar interrupção de acesso, atualize seu método de pagamento agora.
    </p>

    <a href="${APP_URL}/assinatura" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      Atualizar pagamento →
    </a>

    <p style="font-size:12px;color:#9A8878;text-align:center;margin:16px 0 0">
      Sua assinatura permanece ativa enquanto tentamos cobrar novamente — você não perde acesso imediatamente.
    </p>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}
