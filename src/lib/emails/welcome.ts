import { getResend } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

export async function sendWelcomeEmail(email: string, name?: string) {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: `Bem-vindo ao Kindar, ${firstName}!`,
      html: buildWelcomeHtml(firstName),
    });
  } catch (error) {
    console.error("[email] Failed to send welcome email:", error);
    // Never block signup for email failure
  }
}

function buildWelcomeHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a familia</p>
  </div>

  <!-- Card -->
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      Oi, ${firstName}! 👋
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Sua conta no Kindar esta pronta. Agora voce pode organizar a rotina das criancas em um so lugar.
    </p>

    <!-- Steps -->
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:flex-start;margin-bottom:16px">
        <div style="width:28px;height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px">1</div>
        <div>
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">Crie seu grupo familiar</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">De um nome e cadastre sua primeira crianca.</p>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;margin-bottom:16px">
        <div style="width:28px;height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px">2</div>
        <div>
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">Convide o outro responsavel</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">Envie o link por WhatsApp. Leva segundos.</p>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start">
        <div style="width:28px;height:28px;border-radius:50%;background:#C07055;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px">3</div>
        <div>
          <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">Organize a rotina</p>
          <p style="font-size:13px;color:#9A8878;margin:2px 0 0">Calendario, saude, atividades — tudo centralizado.</p>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <a href="${APP_URL}/dashboard" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      Acessar o Kindar →
    </a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:32px">
    <p style="font-size:12px;color:#9A8878;margin:0">
      Voce recebeu este e-mail porque criou uma conta no Kindar.
    </p>
    <p style="font-size:11px;color:#C4BEB6;margin:8px 0 0">
      © 2024-2026 Kindar. Todos os direitos reservados.
    </p>
  </div>

</div>
</body>
</html>`;
}
