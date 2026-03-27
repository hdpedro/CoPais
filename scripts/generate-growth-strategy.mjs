import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, HeadingLevel, AlignmentType, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} from "docx";
import fs from "fs";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FONT = "Arial";
const BLUE_SHADING = "D5E8F0";
const PURPLE_SHADING = "E8D5F0";

const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
};

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: "1B4F72" })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: "2E86C1" })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: "34495E" })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: opts.alignment || AlignmentType.LEFT,
    children: [new TextRun({ text, font: FONT, size: 24, ...opts })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 24 })],
  });
}

function bulletBold(boldPart, rest, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: boldPart, font: FONT, size: 24, bold: true }),
      new TextRun({ text: rest, font: FONT, size: 24 }),
    ],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function makeCell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    margins: cellMargins,
    shading: opts.shading ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shading } : undefined,
    children: [
      new Paragraph({
        alignment: opts.alignment || AlignmentType.LEFT,
        children: [new TextRun({ text: String(text), font: FONT, size: 22, bold: !!opts.bold, color: opts.color || "000000" })],
      }),
    ],
  });
}

function makeTable(headers, rows, shadingColor = BLUE_SHADING) {
  const colCount = headers.length;
  const colWidth = Math.floor(9000 / colCount);

  const headerRow = new TableRow({
    children: headers.map(h => makeCell(h, { bold: true, shading: shadingColor, width: colWidth })),
  });

  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map(cell => makeCell(cell, { width: colWidth })),
    })
  );

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: tableBorders,
    rows: [headerRow, ...dataRows],
  });
}

// ── Sections ─────────────────────────────────────────────────────────────────

function coverPage() {
  return [
    new Paragraph({ spacing: { before: 3000 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "KINDAR", font: FONT, size: 72, bold: true, color: "1B4F72" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: "Estratégia de Growth & Monetização", font: FONT, size: 40, color: "2E86C1" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "Plataforma Inteligente de Coparentalidade", font: FONT, size: 28, color: "555555", italics: true })],
    }),
    new Paragraph({ spacing: { before: 1500 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "v1.0 — Março 2026", font: FONT, size: 24, color: "777777" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "Documento Estratégico — Confidencial", font: FONT, size: 24, bold: true, color: "C0392B" })],
    }),
    pageBreak(),
  ];
}

function section1() {
  return [
    heading1("1. SUMÁRIO EXECUTIVO"),
    para("O Kindar é uma plataforma de coparentalidade com product-led growth natural: o produto PRECISA de 2 pais para funcionar completamente. O diferencial é que o convite do 2º pai não é marketing — é funcionalidade essencial do produto."),
    bullet("Modelo: Freemium com premium a R$29/mês"),
    bullet("Meta: 50 famílias ativas em 60 dias, 500 em 6 meses"),
    bullet("Canais: WhatsApp (orgânico) + Influenciadores (psicólogos, advogados)"),
    bullet("O convite do segundo responsável é uma funcionalidade, não uma campanha de aquisição"),
    para("O app resolve dores reais de famílias com guarda compartilhada: calendário, comunicação, saúde, finanças e decisões conjuntas — tudo num único lugar."),
    pageBreak(),
  ];
}

function section2() {
  return [
    heading1("2. ANÁLISE DO PRODUTO"),
    heading2("2.1 Funcionalidades com 1 pai (70%)"),
    bullet("Calendário de guarda e compromissos"),
    bullet("Registro de saúde (vacinas, medicamentos, alergias, crescimento)"),
    bullet("Documentos e notas privadas"),
    bullet("Check-in diário"),
    bullet("Atividades e escola"),
    heading2("2.2 Funcionalidades com 2 pais (30%)"),
    bullet("Chat entre responsáveis"),
    bullet("Decisões conjuntas (aprovar/rejeitar)"),
    bullet("Aprovação de despesas"),
    bullet("Trocas de dias no calendário"),
    bullet("Temas sensíveis"),
    heading2("2.3 Pontos naturais de convite"),
    bullet("Criação de evento compartilhado"),
    bullet("Solicitação de troca de dias"),
    bullet("Registro de episódio de saúde"),
    bullet("Criação de decisão que requer aprovação"),
    heading2("2.4 Fricções atuais"),
    bullet("Convite via email (deveria ser WhatsApp como canal principal)"),
    bullet("Onboarding do 2º pai poderia ser mais simples e guiado"),
    para(""),
    para("RECOMENDAÇÃO: Reposicionar como \"seu painel de controle parental\" — funciona com 1 pai, fica MELHOR com 2.", { bold: true, color: "C0392B" }),
    pageBreak(),
  ];
}

function section3() {
  return [
    heading1("3. SISTEMA DE CONVITE ORGÂNICO"),
    para("NÃO é programa de indicação — é funcionalidade do produto.", { bold: true }),
    heading2("3.1 Momentos ideais para convite"),
    bulletBold("Após cadastrar criança: ", "\"Convide o outro responsável para organizar juntos\""),
    bulletBold("Ao criar evento: ", "\"Quer notificar o outro responsável?\""),
    bulletBold("Ao registrar saúde: ", "\"O outro pai precisa saber disso\""),
    bulletBold("Ao solicitar troca: ", "\"O outro pai precisa aprovar\""),
    heading2("3.2 Implementação técnica"),
    bullet("Referral code por usuário (UUID, não código alfanumérico)"),
    bullet("Link: kindar.com.br/convite/[token]"),
    bullet("Tracking: quem convidou, quando, se aceitou, tempo até ativação"),
    bullet("Atribuição automática ao grupo familiar ao aceitar convite"),
    pageBreak(),
  ];
}

function section4() {
  return [
    heading1("4. WHATSAPP — CANAL PRINCIPAL"),
    para("99% dos pais brasileiros usam WhatsApp. Este é o canal #1 de distribuição."),
    heading2("4.1 Mensagens contextuais"),
    heading3("Convite inicial"),
    para("\"Oi! Estou usando o Kindar para organizar a rotina do [nome do filho]. Acho importante a gente centralizar tudo aqui. Entra pelo link [link]\"", { italics: true, color: "555555" }),
    heading3("Evento criado"),
    para("\"[nome] tem consulta dia 15. Veja os detalhes no Kindar [link]\"", { italics: true, color: "555555" }),
    heading3("Saúde"),
    para("\"[nome] está com febre. Registrei no Kindar para você acompanhar [link]\"", { italics: true, color: "555555" }),
    heading2("4.2 Implementação"),
    bullet("Web Share API + fallback para link direto WhatsApp"),
    bullet("Personalização: nome do filho, tipo de evento, urgência"),
    bullet("Deep link que direciona ao contexto correto (evento, saúde, etc.)"),
    bullet("Preview card (Open Graph) para exibição rica no WhatsApp"),
    pageBreak(),
  ];
}

function section5() {
  return [
    heading1("5. MODELO FREEMIUM"),
    heading2("5.1 Plano Free (para sempre)"),
    bullet("Calendário de guarda"),
    bullet("Chat entre responsáveis"),
    bullet("Check-in diário"),
    bullet("1 criança"),
    bullet("Documentos (até 5)"),
    bullet("Decisões (até 3 ativas)"),
    heading2("5.2 Plano Premium — R$ 29/mês ou R$ 249/ano"),
    bullet("Crianças ilimitadas"),
    bullet("Documentos ilimitados"),
    bullet("Decisões ilimitadas"),
    bullet("Assistente IA por voz"),
    bullet("Relatórios de saúde (PDF)"),
    bullet("Exportação de calendário (iCal)"),
    bullet("Módulo financeiro completo (saldo, liquidação)"),
    bullet("Histórico completo"),
    bullet("Suporte prioritário"),
    heading2("5.3 Plano Família — R$ 49/mês"),
    bullet("Tudo do Premium"),
    bullet("Avós e cuidadores como membros"),
    bullet("Multi-grupo (ex: 2 filhos de pais diferentes)"),
    bullet("Acesso para mediador/advogado (read-only)"),
    pageBreak(),
  ];
}

function section6() {
  return [
    heading1("6. GATILHOS DE CONVERSÃO (Paywall Natural)"),
    para("NÃO bloquear funcionalidades básicas. Usar gatilhos naturais e tom informativo.", { bold: true }),
    heading2("6.1 Exemplos de gatilhos"),
    bullet("\"Você atingiu o limite de 5 documentos. Faça upgrade para armazenar todos.\""),
    bullet("\"O assistente por voz está disponível no plano Premium.\""),
    bullet("\"Para exportar o relatório de saúde, ative o Premium.\""),
    bullet("\"Adicione mais crianças com o plano Premium.\""),
    heading2("6.2 Tom de comunicação"),
    para("Informativo, não agressivo. \"Essa função faz parte do Premium\" — não \"ASSINE AGORA\". O objetivo é que o usuário sinta que está desbloqueando valor, não sendo bloqueado."),
    bullet("Mostrar preview do que terá acesso"),
    bullet("Trial de 14 dias sem cartão"),
    bullet("Upgrade com 1 clique dentro do app"),
    pageBreak(),
  ];
}

function section7() {
  return [
    heading1("7. SISTEMA DE INFLUENCIADORES"),
    heading2("7.1 Perfil ideal"),
    bullet("Psicólogos familiares (Instagram, YouTube)"),
    bullet("Advogados de família (Instagram, TikTok)"),
    bullet("Coaches parentais"),
    bullet("Bloggers de maternidade/paternidade"),
    bullet("Mediadores familiares"),
    heading2("7.2 Modelo de comissão"),
    bullet("20% recorrente por assinatura ativa"),
    bullet("Código único por influenciador"),
    bullet("Dashboard de acompanhamento (futuro)"),
    bullet("Pagamento mensal via Pix"),
    heading2("7.3 Implementação — Tabelas"),
    heading3("influencers"),
    bullet("id, name, email, referral_code, commission_rate, pix_key, status"),
    heading3("influencer_referrals"),
    bullet("id, influencer_id, user_id, converted_at, subscription_id"),
    heading3("influencer_commissions"),
    bullet("id, influencer_id, amount, period, status, paid_at"),
    para(""),
    bullet("API route para tracking de conversão"),
    bullet("Cron mensal para calcular comissões"),
    pageBreak(),
  ];
}

function section8() {
  return [
    heading1("8. TRACKING E ANALYTICS"),
    heading2("8.1 Eventos a rastrear (PostHog)"),
    bullet("user_signup (source: organic/referral/influencer)"),
    bullet("invite_sent (method: whatsapp/email/link)"),
    bullet("invite_accepted"),
    bullet("second_parent_activated (key metric!)"),
    bullet("premium_trial_started"),
    bullet("premium_converted"),
    bullet("premium_churned"),
    bullet("feature_used (calendar/health/chat/decisions/ai)"),
    bullet("ai_command (action, source: local/groq, success)"),
    heading2("8.2 Métricas chave"),
    bulletBold("SAC: ", "Semanas Ativas de Coparentalidade — ambos pais ativos"),
    bulletBold("Invite-to-Accept Rate: ", "% de convites que resultam em cadastro"),
    bulletBold("Time to Second Parent: ", "tempo entre signup do 1º e ativação do 2º"),
    bulletBold("Free-to-Premium Rate: ", "% de conversão para plano pago"),
    bulletBold("Monthly Churn Rate: ", "% de cancelamento mensal"),
    bulletBold("LTV: ", "Lifetime Value por assinante"),
    bulletBold("CAC: ", "Customer Acquisition Cost por família"),
    pageBreak(),
  ];
}

function section9() {
  return [
    heading1("9. PROJEÇÃO FINANCEIRA (12 meses)"),
    para("Projeção conservadora assumindo 5% de conversão free-to-premium."),
    makeTable(
      ["Mês", "Famílias", "Premium (5%)", "Receita/mês", "Influenciadores", "Comissão"],
      [
        ["M1", "20", "1", "R$ 29", "0", "R$ 0"],
        ["M3", "100", "5", "R$ 145", "3", "R$ 29"],
        ["M6", "500", "25", "R$ 725", "10", "R$ 145"],
        ["M9", "2.000", "100", "R$ 2.900", "25", "R$ 580"],
        ["M12", "5.000", "250", "R$ 7.250", "50", "R$ 1.450"],
      ],
      PURPLE_SHADING
    ),
    para(""),
    para("ARR projetado no M12: ~R$ 87.000", { bold: true, color: "1B4F72" }),
    para("Nota: a projeção não inclui receita de plano Família (R$49/mês) nem upsells futuros, representando um cenário conservador."),
    pageBreak(),
  ];
}

function section10() {
  return [
    heading1("10. SEGURANÇA ANTI-FRAUDE"),
    bullet("Sem auto-referral (email do convidador ≠ email do convidado)"),
    bullet("Sem múltiplas contas (device fingerprint + email unique)"),
    bullet("Comissão só após 30 dias de assinatura ativa"),
    bullet("Verificação de pagamento antes de liberar comissão"),
    bullet("Rate limit em convites (máx 10/dia)"),
    bullet("Monitoramento de padrões anômalos de referral"),
    bullet("Bloqueio automático de influenciadores com taxa de fraude > 10%"),
    pageBreak(),
  ];
}

function section11() {
  return [
    heading1("11. ROADMAP DE IMPLEMENTAÇÃO"),
    makeTable(
      ["Semana", "O que fazer", "Impacto"],
      [
        ["Sem 1", "Melhorar convite WhatsApp + landing page", "Alto"],
        ["Sem 2", "Onboarding 20 famílias piloto", "Alto"],
        ["Sem 3", "Implementar paywall leve + trial 14 dias", "Alto"],
        ["Sem 4", "Integrar Stripe/RevenueCat para pagamentos", "Alto"],
        ["Sem 5-6", "Sistema de influenciadores", "Médio"],
        ["Sem 7-8", "Dashboard de analytics (PostHog)", "Médio"],
        ["Sem 9-12", "Comissão automática + scaling", "Médio"],
      ]
    ),
    pageBreak(),
  ];
}

function section12() {
  return [
    heading1("12. CONCLUSÃO E PRÓXIMOS PASSOS"),
    para("O Kindar tem product-led growth natural — o convite é funcionalidade, não marketing. Isso cria um loop de aquisição orgânico embutido no produto."),
    heading2("Prioridades"),
    bulletBold("Prioridade 1: ", "Primeiros 50 usuários reais (validação de produto)"),
    bulletBold("Prioridade 2: ", "Monetização (plano premium com paywall natural)"),
    bulletBold("Prioridade 3: ", "Escala (influenciadores + SEO + parcerias)"),
    para(""),
    para("O produto está tecnicamente pronto para escalar. O gargalo é distribuição. Com a estratégia certa de WhatsApp como canal principal e influenciadores como multiplicadores, o Kindar pode se tornar a referência em coparentalidade no Brasil.", { bold: true }),
  ];
}

// ── Build Document ───────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25CB", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [
    {
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "Kindar — Estratégia de Growth", font: FONT, size: 18, color: "999999", italics: true })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Página ", font: FONT, size: 18, color: "999999" }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "999999" }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...coverPage(),
        ...section1(),
        ...section2(),
        ...section3(),
        ...section4(),
        ...section5(),
        ...section6(),
        ...section7(),
        ...section8(),
        ...section9(),
        ...section10(),
        ...section11(),
        ...section12(),
      ],
    },
  ],
});

// ── Write file ───────────────────────────────────────────────────────────────

const outDir = "docs";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = "docs/KINDAR_Estrategia_Growth_Monetizacao.docx";
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);

const stats = fs.statSync(outPath);
console.log(`Generated: ${outPath}`);
console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
