import { getResend } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

// Rótulo humano do papel (mesmos valores do form de convite). Mantém o tom
// acolhedor — copy de onboarding é humano-only (Regra Canônica 10).
const ROLE_LABEL: Record<string, string> = {
  parent: "co-responsável",
  grandparent: "avó/avô",
  caregiver: "cuidador(a)",
  mediator: "mediador(a)",
  lawyer: "advogado(a)",
};

/**
 * E-mail de convite — enviado quando alguém é convidado para um grupo
 * (rota /api/invitations chamada pelo Native + action createInvitation do PWA).
 * Antes o app só gerava um link compartilhável e o convidado não recebia nada;
 * bug reportado pelo tester Murilo (2026-06-15). Best-effort: nunca quebra o
 * fluxo de convite (o convite já foi criado quando isto roda).
 */
export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string | null;
  groupName: string | null;
  role: string;
  token: string;
}) {
  try {
    const resend = getResend();
    const inviter = params.inviterName?.split(" ")[0] || "Alguém";
    const group = params.groupName?.trim() || "uma família";
    const roleLabel = ROLE_LABEL[params.role] || "membro";
    const link = `${APP_URL}/convite/${params.token}`;

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: params.to,
      subject: `${inviter} convidou você para o Kindar`,
      html: buildHtml(inviter, group, roleLabel, link),
    });
  } catch (error) {
    // Non-fatal — o convite já existe e o link continua compartilhável na UI.
    // Faltar o e-mail é cosmético, nunca pode quebrar a criação do convite.
    console.error("[email] Failed to send invitation email:", error);
  }
}

function buildHtml(inviter: string, group: string, roleLabel: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina organizada para toda a família</p>
  </div>

  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:22px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      ${inviter} convidou você 💛
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      Você foi convidado(a) para participar de <strong>${group}</strong> no Kindar como <strong>${roleLabel}</strong> — o app que organiza a rotina, a saúde e a agenda das crianças com todo mundo na mesma página.
    </p>

    <a href="${link}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      Aceitar convite →
    </a>

    <p style="font-size:12px;color:#9A8878;text-align:center;margin:16px 0 0">
      Se o botão não funcionar, abra este link:<br>
      <a href="${link}" style="color:#C07055;text-decoration:none;word-break:break-all">${link}</a>
    </p>
  </div>

  <div style="text-align:center;margin-top:32px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">Se você não esperava este convite, pode ignorar este e-mail.</p>
    <p style="font-size:11px;color:#C4BEB6;margin:8px 0 0">Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}
