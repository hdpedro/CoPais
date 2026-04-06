import { getResend } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

export async function sendNurtureEmail(email: string, name: string, type: "d3" | "d7" | "d14") {
  try {
    const resend = getResend();
    const firstName = name?.split(" ")[0] || "voce";
    const config = NURTURE_CONFIG[type];

    await resend.emails.send({
      from: "Kindar <noreply@kindar.com.br>",
      to: email,
      subject: config.subject(firstName),
      html: buildNurtureHtml(firstName, config),
    });
  } catch (error) {
    console.error(`[email] Failed to send nurture ${type} email:`, error);
  }
}

interface NurtureConfig {
  subject: (name: string) => string;
  title: string;
  tips: Array<{ icon: string; title: string; desc: string }>;
  cta: string;
  ctaLink: string;
}

const NURTURE_CONFIG: Record<string, NurtureConfig> = {
  d3: {
    subject: (name) => `${name}, 3 dicas para organizar a rotina no Kindar`,
    title: "3 formas de aproveitar o Kindar",
    tips: [
      { icon: "📅", title: "Cadastre as atividades", desc: "Futebol, escola, terapia — tudo com horarios e lembretes automaticos." },
      { icon: "🏥", title: "Registre a saude", desc: "Alergias, medicamentos, vacinas — tudo acessivel quando precisar." },
      { icon: "💬", title: "Use o chat", desc: "Comunicacao focada na crianca, com historico. Sem ruido." },
    ],
    cta: "Abrir o Kindar",
    ctaLink: "/dashboard",
  },
  d7: {
    subject: (name) => `${name}, como esta a rotina da familia?`,
    title: "Sua semana no Kindar",
    tips: [
      { icon: "✅", title: "Faca um check-in", desc: "Registre como foi o dia: humor, alimentacao, sono. Em 30 segundos." },
      { icon: "📲", title: "Convide o outro responsavel", desc: "O Kindar funciona melhor quando os dois lados participam." },
      { icon: "🔄", title: "Configure a guarda", desc: "Defina a escala e receba lembretes nos dias de troca." },
    ],
    cta: "Fazer check-in",
    ctaLink: "/checkin",
  },
  d14: {
    subject: (name) => `${name}, voce sabia que pode controlar medicamentos no Kindar?`,
    title: "Funcionalidades que voce pode nao ter visto",
    tips: [
      { icon: "💊", title: "Controle de medicamentos", desc: "Doses, horarios, historico. Nunca mais esquecer." },
      { icon: "📄", title: "Documentos", desc: "Guarde certidoes, laudos, receitas. Sempre acessiveis." },
      { icon: "🗳️", title: "Decisoes compartilhadas", desc: "Registre e vote em decisoes importantes sobre a crianca." },
    ],
    cta: "Explorar funcionalidades",
    ctaLink: "/mais",
  },
};

function buildNurtureHtml(firstName: string, config: NurtureConfig): string {
  const tipsHtml = config.tips.map(t => `
    <div style="display:flex;align-items:flex-start;margin-bottom:16px">
      <div style="font-size:20px;margin-right:12px;flex-shrink:0">${t.icon}</div>
      <div>
        <p style="font-size:14px;font-weight:600;color:#0E0C0A;margin:0">${t.title}</p>
        <p style="font-size:13px;color:#9A8878;margin:2px 0 0">${t.desc}</p>
      </div>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:18px;font-weight:700;color:#0E0C0A;margin:0 0 8px">
      Oi, ${firstName}! 👋
    </h2>
    <p style="font-size:15px;color:#6B6560;line-height:1.6;margin:0 0 24px">
      ${config.title}:
    </p>
    ${tipsHtml}
    <a href="${APP_URL}${config.ctaLink}" style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin-top:8px">
      ${config.cta} →
    </a>
  </div>
  <div style="text-align:center;margin-top:24px">
    <p style="font-size:11px;color:#C4BEB6;margin:0">© 2024-2026 Kindar</p>
  </div>
</div>
</body>
</html>`;
}
