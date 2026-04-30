import { getResend } from "@/lib/email";

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
 * Sent after a real subscription kicks in (Stripe checkout.session.completed
 * OR RevenueCat INITIAL_PURCHASE). Distinct from welcome.ts (signup only)
 * because the user already knows the app — this celebrates the commitment
 * and reminds them of key features they now have access to.
 */
export async function sendSubscriptionWelcomeEmail(
  email: string,
  name: string | null,
  planId: string
) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";
    const planName = PLAN_NAMES[planId] ?? "Kindar Premium";

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Bem-vindo ao ${planName}!`,
      html: buildHtml(firstName, planName, planId),
    });
  } catch (error) {
    // Non-fatal — we never want email delivery to break the subscription
    // flow. The user got their sub activated; missing an email is cosmetic.
    console.error("[email] Failed to send subscription-welcome email:", error);
  }
}

function buildHtml(firstName: string, planName: string, planId: string): string {
  const isJuridico = planId.startsWith("premium_juridico");
  const isEarlyBird = planId.includes("earlybird");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    ${
      isEarlyBird
        ? `<div style="display:inline-block;background:#E8F4ED;color:#2F7D52;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;margin-bottom:16px">
            Early Bird · R$14,90/mês para sempre
          </div>`
        : ""
    }
    <h2 style="font-size:22px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      ${firstName}, obrigado por assinar o ${planName} 💛
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Sua assinatura está ativa e toda a família — co-responsável, avós, babás, mediador, advogado — acessa o Kindar sem pagar nada a mais.
    </p>

    <h3 style="font-size:15px;font-weight:700;color:#0E0C0A;margin:24px 0 12px">
      O que você tem agora:
    </h3>
    <ul style="padding-left:20px;margin:0 0 24px;color:#6B6560;font-size:14px;line-height:1.8">
      <li>Calendário e agenda de guarda ilimitados</li>
      <li>Chat com análise de tom e mediação por IA</li>
      <li>Saúde completa (consultas, vacinas, alergias, medicamentos)</li>
      <li>OCR de receita médica + inferência clínica</li>
      <li>Crianças e convidados ilimitados</li>
      ${isJuridico ? "<li><strong>Export legal com audit trail (PDF)</strong></li><li><strong>Backup jurídico automático</strong></li><li><strong>Suporte VIP</strong></li>" : ""}
    </ul>

    ${
      !isJuridico
        ? `<div style="background:#FFF9F0;border-radius:12px;padding:16px;margin-bottom:16px">
            <p style="font-size:13px;color:#9A6830;margin:0 0 4px;font-weight:600">💡 Dica</p>
            <p style="font-size:13px;color:#6B6560;margin:0;line-height:1.5">
              Em uma separação com processo ativo? O <strong>Premium Jurídico</strong> adiciona export legal (PDF com audit trail) e backup jurídico — ideal para anexar em processos.
            </p>
          </div>`
        : ""
    }

    <a href="${APP_URL}/dashboard" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      Abrir o Kindar →
    </a>

    <p style="font-size:12px;color:#9A8878;text-align:center;margin:16px 0 0">
      Você pode dividir o custo com seu co-responsável em <a href="${APP_URL}/assinatura" style="color:#C07055;text-decoration:none">/assinatura</a>.
    </p>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}
