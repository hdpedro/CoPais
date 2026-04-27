import { getResend } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

/**
 * Day 5 reminder — trial ends in 2 days. Copy leans into "you saw what
 * the full product does, keep it running" rather than a scarcity push.
 */
export async function sendTrialEndingSoonEmail(email: string, name?: string, daysRemaining = 2) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Faltam ${daysRemaining} dias do seu Premium Jurídico gratuito`,
      html: buildEndingSoonHtml(firstName, daysRemaining),
    });
  } catch (error) {
    console.error("[email] Failed to send trial-ending email:", error);
  }
}

/**
 * Day 8 expiry — trial is over. Gives them three paths: Premium Jurídico,
 * Harmonia, or stay on Free. No dark patterns.
 */
export async function sendTrialExpiredEmail(email: string, name?: string) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Sua degustação do Kindar terminou, ${firstName}`,
      html: buildExpiredHtml(firstName),
    });
  } catch (error) {
    console.error("[email] Failed to send trial-expired email:", error);
  }
}

function buildEndingSoonHtml(firstName: string, days: number): string {
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
    <div style="display:inline-block;background:#E8F4ED;color:#2F7D52;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;margin-bottom:16px">
      Faltam ${days} dias
    </div>
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      Oi, ${firstName} — sua degustação está acabando
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Nos últimos dias você testou tudo que o Kindar tem: IA assistente, leitura de receitas médicas, saúde completa, relatórios exportáveis. Para manter tudo isso depois do teste, escolha um plano.
    </p>

    <div style="background:#F7F2EC;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="font-size:13px;color:#9A8878;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Harmonia Early Bird</p>
      <p style="font-size:22px;font-weight:700;color:#0E0C0A;margin:0">R$ 19,90 <span style="font-size:14px;font-weight:400;color:#6B6560">/mês para sempre</span></p>
      <p style="font-size:13px;color:#6B6560;margin:4px 0 0">Últimas vagas do preço de lançamento — depois sobe para R$24,90.</p>
    </div>

    <a href="${APP_URL}/configuracoes/assinatura" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      Escolher plano →
    </a>

    <p style="font-size:12px;color:#9A8878;text-align:center;margin:16px 0 0">
      Prefere continuar grátis? Seu grupo volta para o plano Grátis automaticamente no fim do teste.
    </p>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}

function buildExpiredHtml(firstName: string): string {
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
      ${firstName}, seu teste terminou 💛
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Você continua no Kindar — agora no plano Grátis, com o básico ativado. Para voltar a usar IA, leitura de receitas e relatórios completos, é só escolher um plano.
    </p>

    <div style="border:1px solid #EDE6DC;border-radius:12px;padding:16px;margin-bottom:12px">
      <p style="font-size:15px;font-weight:700;color:#0E0C0A;margin:0">Harmonia — R$24,90/mês</p>
      <p style="font-size:13px;color:#6B6560;margin:4px 0 0">IA, saúde completa, agenda ilimitada — tudo que você usou nos últimos 7 dias.</p>
    </div>
    <div style="border:1px solid #EDE6DC;border-radius:12px;padding:16px;margin-bottom:12px">
      <p style="font-size:15px;font-weight:700;color:#0E0C0A;margin:0">Premium Jurídico — R$39,90/mês</p>
      <p style="font-size:13px;color:#6B6560;margin:4px 0 0">Tudo do Harmonia + export legal, backup jurídico e audit trail para processos.</p>
    </div>

    <a href="${APP_URL}/configuracoes/assinatura" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:16px">
      Escolher plano →
    </a>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}
