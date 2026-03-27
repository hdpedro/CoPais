const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, ExternalHyperlink,
} = require("docx");

// Colors
const PRIMARY = "0EA5A0";
const DARK = "1A3B3A";
const ACCENT = "E8734A";
const LIGHT_BG = "F0F9F8";
const HEADER_BG = "0EA5A0";
const HEADER_TEXT = "FFFFFF";
const GRAY = "666666";
const LIGHT_GRAY = "F5F5F5";
const GREEN = "27AE60";
const RED = "E74C3C";

const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const TABLE_WIDTH = 9360;

function headerCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: { fill: HEADER_BG, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, bold: true, color: HEADER_TEXT, font: "Arial", size: 20 })]
    })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: thinBorders,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({
        text,
        bold: opts.bold || false,
        color: opts.color || DARK,
        font: "Arial",
        size: opts.size || 20,
        italics: opts.italics || false,
      })]
    })]
  });
}

function accentCell(text, width, opts = {}) {
  return cell(text, width, { ...opts, bold: true, color: ACCENT });
}

function sectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, color: DARK, font: "Arial", size: 32 })]
  });
}

function sectionSubtitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, color: PRIMARY, font: "Arial", size: 26 })]
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text,
      font: "Arial",
      size: 22,
      color: opts.color || DARK,
      bold: opts.bold || false,
      italics: opts.italics || false,
    })]
  });
}

function spacer(size = 200) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [] });
}

// ============ COVER PAGE ============
const coverSection = {
  properties: {
    page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    },
  },
  children: [
    spacer(2000),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "Kindar", font: "Arial", size: 72, bold: true, color: PRIMARY })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: "Coparentalidade inteligente", font: "Arial", size: 28, color: GRAY, italics: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PRIMARY, space: 1 } },
      children: []
    }),
    spacer(400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "RELATORIO DE DESENVOLVIMENTO", font: "Arial", size: 40, bold: true, color: DARK })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "Estimativa de Equipe, Tempo e Custos de Mercado", font: "Arial", size: 24, color: GRAY })]
    }),
    spacer(800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "Periodo: 17/03/2026 a 21/03/2026", font: "Arial", size: 22, color: DARK })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "Producao: https://kindar.vercel.app", font: "Arial", size: 22, color: PRIMARY })]
    }),
    spacer(1200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Documento gerado em 21/03/2026", font: "Arial", size: 18, color: GRAY, italics: true })]
    }),
  ]
};

// ============ MAIN CONTENT ============
const contentChildren = [];

// --- RESUMO GERAL ---
contentChildren.push(sectionTitle("1. Resumo Geral do Projeto"));
contentChildren.push(bodyText("O Kindar e um aplicativo de coparentalidade para familias com guarda compartilhada. Abaixo o resumo do desenvolvimento realizado em 5 dias."));
contentChildren.push(spacer(100));

const colW1 = [4680, 4680];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colW1,
  rows: [
    new TableRow({ children: [headerCell("Metrica", colW1[0]), headerCell("Valor", colW1[1])] }),
    new TableRow({ children: [cell("Periodo", colW1[0]), cell("17/03 a 21/03/2026 (5 dias)", colW1[1], { bold: true })] }),
    new TableRow({ children: [cell("Horas estimadas", colW1[0], { shading: LIGHT_GRAY }), cell("~53 horas", colW1[1], { bold: true, shading: LIGHT_GRAY })] }),
    new TableRow({ children: [cell("Commits", colW1[0]), cell("70", colW1[1], { bold: true })] }),
    new TableRow({ children: [cell("Arquivos", colW1[0], { shading: LIGHT_GRAY }), cell("182", colW1[1], { bold: true, shading: LIGHT_GRAY })] }),
    new TableRow({ children: [cell("Linhas de codigo", colW1[0]), cell("~19.000 (TS/TSX/JS)", colW1[1], { bold: true })] }),
    new TableRow({ children: [cell("Migracoes SQL", colW1[0], { shading: LIGHT_GRAY }), cell("12", colW1[1], { bold: true, shading: LIGHT_GRAY })] }),
    new TableRow({ children: [cell("Tabelas no banco", colW1[0]), cell("17+", colW1[1], { bold: true })] }),
  ]
}));

// --- HORAS POR DIA ---
contentChildren.push(spacer(200));
contentChildren.push(sectionTitle("2. Horas de Desenvolvimento por Dia"));

const colD = [1200, 1600, 900, 900, 4760];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colD,
  rows: [
    new TableRow({ children: [
      headerCell("Dia", colD[0]), headerCell("Horario", colD[1]), headerCell("Horas", colD[2]),
      headerCell("Commits", colD[3]), headerCell("Foco Principal", colD[4]),
    ]}),
    new TableRow({ children: [
      cell("17/03", colD[0], { bold: true }), cell("12:16-23:43", colD[1]), cell("~11h", colD[2], { bold: true }),
      cell("16", colD[3]), cell("Setup, features base, dashboard, onboarding, IA mediadora", colD[4]),
    ]}),
    new TableRow({ children: [
      cell("18/03", colD[0], { bold: true, shading: LIGHT_GRAY }), cell("00:07-23:02", colD[1], { shading: LIGHT_GRAY }),
      cell("~14h", colD[2], { bold: true, shading: LIGHT_GRAY }), cell("17", colD[3], { shading: LIGHT_GRAY }),
      cell("Calendario, guarda, saude, PWA, feriados, seguranca", colD[4], { shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("19/03", colD[0], { bold: true }), cell("11:42-23:04", colD[1]), cell("~11h", colD[2], { bold: true }),
      cell("14", colD[3]), cell("Escala de guarda, troca de dia, push, performance", colD[4]),
    ]}),
    new TableRow({ children: [
      cell("20/03", colD[0], { bold: true, shading: LIGHT_GRAY }), cell("07:28-17:41", colD[1], { shading: LIGHT_GRAY }),
      cell("~10h", colD[2], { bold: true, shading: LIGHT_GRAY }), cell("23", colD[3], { shading: LIGHT_GRAY }),
      cell("Seguranca, social login, landing page, financeiro v2", colD[4], { shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("21/03", colD[0], { bold: true }), cell("sessao", colD[1]), cell("~7h+", colD[2], { bold: true }),
      cell("-", colD[3]), cell("Agenda unificada, atividades, checklist, docs, convites", colD[4]),
    ]}),
    new TableRow({ children: [
      cell("TOTAL", colD[0], { bold: true, shading: LIGHT_BG }),
      cell("", colD[1], { shading: LIGHT_BG }),
      accentCell("~53h", colD[2], { shading: LIGHT_BG }),
      cell("70", colD[3], { bold: true, shading: LIGHT_BG }),
      cell("", colD[4], { shading: LIGHT_BG }),
    ]}),
  ]
}));

// --- PROFISSIONAIS ---
contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
contentChildren.push(sectionTitle("3. Profissionais Necessarios (Modelo Software House)"));
contentChildren.push(bodyText("Se o Kindar fosse desenvolvido por uma software house tradicional, seria necessaria a seguinte equipe:"));
contentChildren.push(spacer(100));

const colP = [400, 2460, 1400, 1500, 1700, 1900];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colP,
  rows: [
    new TableRow({ children: [
      headerCell("#", colP[0]), headerCell("Profissional", colP[1]), headerCell("Senioridade", colP[2]),
      headerCell("Valor/hora", colP[3]), headerCell("Valor/mes", colP[4]), headerCell("Dedicacao", colP[5]),
    ]}),
    ...[
      ["1", "Product Manager", "Pleno", "R$ 120/h", "R$ 14.400", "Parcial (50%)"],
      ["2", "UX/UI Designer", "Pleno", "R$ 100/h", "R$ 12.000", "Integral mes 1"],
      ["3", "Dev Frontend", "Senior", "R$ 150/h", "R$ 18.000", "Integral"],
      ["4", "Dev Backend", "Senior", "R$ 150/h", "R$ 18.000", "Integral"],
      ["5", "DBA / Arquiteto", "Senior", "R$ 170/h", "R$ 6.800", "Parcial (25%)"],
      ["6", "QA / Tester", "Pleno", "R$ 80/h", "R$ 9.600", "Integral (mes 2+)"],
      ["7", "DevOps / Infra", "Pleno", "R$ 130/h", "R$ 5.200", "Parcial (25%)"],
      ["8", "Copywriter", "Junior", "R$ 60/h", "R$ 2.400", "Pontual (25%)"],
    ].map((row, i) => new TableRow({
      children: row.map((text, j) => cell(text, colP[j], { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }))
    })),
  ]
}));

contentChildren.push(spacer(150));
contentChildren.push(bodyText("Custo mensal total da equipe: R$ 62.000 a R$ 86.000/mes", { bold: true, color: ACCENT }));

// --- CRONOGRAMA POR FASE ---
contentChildren.push(spacer(200));
contentChildren.push(sectionTitle("4. Cronograma Detalhado por Fase"));

const phases = [
  {
    name: "FASE 1 - Discovery & Design",
    items: [
      ["Pesquisa de mercado e benchmarking", "PM", "20h", "1 sem", "R$ 2.400"],
      ["Definicao de personas e jornadas", "PM + UX", "24h", "1 sem", "R$ 2.640"],
      ["Wireframes (~25 telas)", "UX/UI", "60h", "2 sem", "R$ 6.000"],
      ["Design System (cores, tipografia)", "UX/UI", "40h", "1 sem", "R$ 4.000"],
      ["Prototipo interativo (Figma)", "UX/UI", "40h", "1 sem", "R$ 4.000"],
      ["Validacao com usuarios", "PM + UX", "16h", "0,5 sem", "R$ 1.760"],
    ],
    total: ["200h", "3-4 sem", "R$ 20.800"],
  },
  {
    name: "FASE 2 - Infraestrutura & Autenticacao",
    items: [
      ["Setup Next.js + Tailwind + TypeScript", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Configuracao Supabase (schema, RLS)", "Backend + DBA", "24h", "2 dias", "R$ 3.840"],
      ["Schema do banco (17 tabelas + policies)", "DBA", "40h", "1 sem", "R$ 6.800"],
      ["Auth email + confirmacao + reset senha", "Backend", "24h", "2 dias", "R$ 3.600"],
      ["Social Login (Google, Apple, Facebook)", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Middleware de sessao + refresh token", "Backend", "12h", "1 dia", "R$ 1.800"],
      ["Traducao erros PT-BR", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Deploy Vercel + variaveis", "DevOps", "8h", "0,5 dia", "R$ 1.040"],
    ],
    total: ["140h", "2-3 sem", "R$ 21.880"],
  },
  {
    name: "FASE 3 - Onboarding & Gestao Familiar",
    items: [
      ["Fluxo de onboarding (criar/entrar grupo)", "Front + Back", "32h", "2 dias", "R$ 4.800"],
      ["Cadastro de criancas", "Front + Back", "24h", "2 dias", "R$ 3.600"],
      ["Convites por email (token unico)", "Backend", "20h", "1,5 dia", "R$ 3.000"],
      ["Gestao de roles (Pai, Mae, Avo...)", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Tela de familia (membros + status)", "Frontend", "16h", "1 dia", "R$ 2.400"],
      ["Compartilhamento via WhatsApp", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Sair do grupo / remover membro", "Backend", "12h", "1 dia", "R$ 1.800"],
    ],
    total: ["128h", "2 sem", "R$ 19.200"],
  },
  {
    name: "FASE 4 - Calendario de Guarda (Feature Principal)",
    items: [
      ["Calendario visual com cores", "Frontend", "40h", "3 dias", "R$ 6.000"],
      ["Construtor de escala (7 padroes)", "Front + Back", "48h", "4 dias", "R$ 7.200"],
      ["Tipos de evento (Regular, Troca...)", "Backend", "24h", "2 dias", "R$ 3.600"],
      ["Feriados brasileiros automaticos", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Troca entre pais (aprovacao)", "Front + Back", "32h", "2 dias", "R$ 4.800"],
      ["Saldo de trocas (debito/credito)", "Front + Back", "20h", "1,5 dia", "R$ 3.000"],
      ["Visitas de avos/cuidadores", "Front + Back", "20h", "1,5 dia", "R$ 3.000"],
      ["Planejador de fins de semana", "Frontend", "12h", "1 dia", "R$ 1.800"],
      ["Exportacao iCal (.ics)", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Vista de dia (detalhes)", "Frontend", "12h", "1 dia", "R$ 1.800"],
    ],
    total: ["240h", "3-4 sem", "R$ 36.000"],
  },
  {
    name: "FASE 5 - Agenda Unificada + Checklist",
    items: [
      ["Motor de recorrencia (7 tipos)", "Backend", "32h", "2 dias", "R$ 4.800"],
      ["CRUD de atividades recorrentes", "Backend", "20h", "1,5 dia", "R$ 3.000"],
      ["Formulario unificado (9 categorias)", "Frontend", "40h", "3 dias", "R$ 6.000"],
      ["Disclosure progressivo (UX)", "Frontend", "16h", "1 dia", "R$ 2.400"],
      ["Checklist inteligente por categoria", "Front + Back", "24h", "2 dias", "R$ 3.600"],
      ["Checklist interativo", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Integracao atividades no calendario", "Frontend", "16h", "1 dia", "R$ 2.400"],
      ["Suporte multiplos filhos", "Backend", "8h", "0,5 dia", "R$ 1.200"],
    ],
    total: ["172h", "2-3 sem", "R$ 25.800"],
  },
  {
    name: "FASE 6 - Chat com IA Mediadora",
    items: [
      ["Chat tempo real (Supabase Realtime)", "Front + Back", "40h", "3 dias", "R$ 6.000"],
      ["Atualizacao otimista (UX)", "Frontend", "12h", "1 dia", "R$ 1.800"],
      ["Deteccao de tom agressivo (NLP PT-BR)", "Backend", "32h", "2 dias", "R$ 4.800"],
      ["Dicionario de palavroes PT-BR", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Sugestao de reformulacao IA", "Backend", "20h", "1,5 dia", "R$ 3.000"],
      ["UX de mediacao (3 opcoes)", "Frontend", "16h", "1 dia", "R$ 2.400"],
    ],
    total: ["136h", "2-3 sem", "R$ 20.400"],
  },
  {
    name: "FASE 7 - Financeiro / Despesas",
    items: [
      ["CRUD despesas (8 categorias)", "Front + Back", "24h", "2 dias", "R$ 3.600"],
      ["Divisao flexivel (50/50, custom)", "Backend", "16h", "1 dia", "R$ 2.400"],
      ["Aprovacao / rejeicao de despesas", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Dashboard financeiro", "Frontend", "20h", "1,5 dia", "R$ 3.000"],
      ["Sistema de settlements", "Front + Back", "20h", "1,5 dia", "R$ 3.000"],
      ["Push para despesas pendentes", "Backend", "8h", "0,5 dia", "R$ 1.200"],
    ],
    total: ["104h", "2 sem", "R$ 15.600"],
  },
  {
    name: "FASE 8 - Modulo Saude",
    items: [
      ["Info gerais (alergias, tipo sanguineo)", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Registro de vacinas", "Front + Back", "12h", "1 dia", "R$ 1.800"],
      ["Registro de medicamentos", "Front + Back", "12h", "1 dia", "R$ 1.800"],
      ["Consultas e exames", "Front + Back", "12h", "1 dia", "R$ 1.800"],
      ["Plano de saude e emergencia", "Front + Back", "8h", "0,5 dia", "R$ 1.200"],
      ["Hub unificado de saude (6 fases)", "Frontend", "16h", "1 dia", "R$ 2.400"],
    ],
    total: ["76h", "1-2 sem", "R$ 11.400"],
  },
  {
    name: "FASE 9 - Modulos Secundarios",
    items: [
      ["Check-in diario", "Front + Back", "20h", "1,5 dia", "R$ 3.000"],
      ["Documentos (upload)", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Informacoes escolares", "Front + Back", "12h", "1 dia", "R$ 1.800"],
      ["Acordos entre pais", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Temas sensiveis", "Front + Back", "12h", "1 dia", "R$ 1.800"],
      ["Perfil do usuario", "Front + Back", "12h", "1 dia", "R$ 1.800"],
    ],
    total: ["88h", "2 sem", "R$ 13.200"],
  },
  {
    name: "FASE 10 - Push Notifications + PWA",
    items: [
      ["Service Worker + manifest (PWA)", "Front + DevOps", "16h", "1 dia", "R$ 2.240"],
      ["Web Push VAPID (setup + envio)", "Backend", "24h", "2 dias", "R$ 3.600"],
      ["Cron lembretes automaticos", "Back + DevOps", "16h", "1 dia", "R$ 2.240"],
      ["Notificacoes in-app + push", "Backend", "12h", "1 dia", "R$ 1.800"],
      ["Permissao + subscription", "Frontend", "12h", "1 dia", "R$ 1.800"],
    ],
    total: ["80h", "1-2 sem", "R$ 11.680"],
  },
  {
    name: "FASE 11 - Dashboard Inteligente",
    items: [
      ["Card Guarda ativa", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Card Agenda (hoje, amanha, 7 dias)", "Frontend", "12h", "1 dia", "R$ 1.800"],
      ["Card Proximos fins de semana", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Card Saude (alertas)", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Card Financeiro (saldo)", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
      ["Card Acoes rapidas", "Frontend", "8h", "0,5 dia", "R$ 1.200"],
    ],
    total: ["52h", "1 sem", "R$ 7.800"],
  },
  {
    name: "FASE 12 - Seguranca, Performance & QA",
    items: [
      ["RLS policies (todas tabelas)", "DBA", "24h", "2 dias", "R$ 4.080"],
      ["Validacao cross-group", "Backend", "20h", "1,5 dia", "R$ 3.000"],
      ["Input sanitization", "Backend", "12h", "1 dia", "R$ 1.800"],
      ["Roles readonly em todas paginas", "Front + Back", "16h", "1 dia", "R$ 2.400"],
      ["Otimizacao getSession() (35 pgs)", "Backend", "8h", "0,5 dia", "R$ 1.200"],
      ["Loading skeletons (todas telas)", "Frontend", "20h", "1,5 dia", "R$ 3.000"],
      ["Error boundaries", "Frontend", "12h", "1 dia", "R$ 1.800"],
      ["Sentry (monitoramento)", "DevOps", "8h", "0,5 dia", "R$ 1.040"],
      ["PostHog (analytics)", "DevOps", "8h", "0,5 dia", "R$ 1.040"],
      ["Testes manuais (16 modulos)", "QA", "60h", "1,5 sem", "R$ 4.800"],
    ],
    total: ["188h", "2-3 sem", "R$ 24.160"],
  },
  {
    name: "FASE 13 - Landing Page + Preparacao Beta",
    items: [
      ["Landing page (hero, features, CTA)", "Front + UX", "20h", "1,5 dia", "R$ 2.500"],
      ["Pagina 404 customizada", "Frontend", "4h", "0,5 dia", "R$ 600"],
      ["Textos e copy (convites, onboarding)", "Copywriter", "16h", "1 dia", "R$ 960"],
      ["Convites beta testers (6 versoes)", "Copy + PM", "12h", "1 dia", "R$ 1.080"],
    ],
    total: ["52h", "1 sem", "R$ 5.140"],
  },
];

const colF = [3660, 1500, 900, 1100, 2200];

for (const phase of phases) {
  contentChildren.push(spacer(200));
  contentChildren.push(sectionSubtitle(phase.name));

  const rows = [
    new TableRow({ children: [
      headerCell("Entrega", colF[0]), headerCell("Profissionais", colF[1]),
      headerCell("Horas", colF[2]), headerCell("Tempo", colF[3]), headerCell("Custo", colF[4]),
    ]}),
  ];

  phase.items.forEach((item, i) => {
    rows.push(new TableRow({
      children: item.map((text, j) => cell(text, colF[j], {
        shading: i % 2 === 1 ? LIGHT_GRAY : undefined,
        align: j >= 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
      }))
    }));
  });

  // Total row
  rows.push(new TableRow({
    children: [
      cell("SUBTOTAL", colF[0], { bold: true, shading: LIGHT_BG }),
      cell("", colF[1], { shading: LIGHT_BG }),
      accentCell(phase.total[0], colF[2], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
      cell(phase.total[1], colF[3], { bold: true, shading: LIGHT_BG, align: AlignmentType.CENTER }),
      accentCell(phase.total[2], colF[4], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
    ]
  }));

  contentChildren.push(new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: colF,
    rows,
  }));
}

// --- RESUMO CONSOLIDADO ---
contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
contentChildren.push(sectionTitle("5. Resumo Consolidado"));

const colR = [3960, 1200, 1000, 3200];
const summaryData = [
  ["1. Discovery & Design", "3-4 sem", "200h", "R$ 20.800"],
  ["2. Infraestrutura & Auth", "2-3 sem", "140h", "R$ 21.880"],
  ["3. Onboarding & Familia", "2 sem", "128h", "R$ 19.200"],
  ["4. Calendario de Guarda", "3-4 sem", "240h", "R$ 36.000"],
  ["5. Agenda Unificada + Checklist", "2-3 sem", "172h", "R$ 25.800"],
  ["6. Chat + IA Mediadora", "2-3 sem", "136h", "R$ 20.400"],
  ["7. Financeiro / Despesas", "2 sem", "104h", "R$ 15.600"],
  ["8. Modulo Saude", "1-2 sem", "76h", "R$ 11.400"],
  ["9. Modulos Secundarios", "2 sem", "88h", "R$ 13.200"],
  ["10. Push + PWA", "1-2 sem", "80h", "R$ 11.680"],
  ["11. Dashboard Inteligente", "1 sem", "52h", "R$ 7.800"],
  ["12. Seguranca, Perf & QA", "2-3 sem", "188h", "R$ 24.160"],
  ["13. Landing + Beta", "1 sem", "52h", "R$ 5.140"],
];

const summaryRows = [
  new TableRow({ children: [
    headerCell("Fase", colR[0]), headerCell("Semanas", colR[1]),
    headerCell("Horas", colR[2]), headerCell("Custo", colR[3]),
  ]}),
];
summaryData.forEach((row, i) => {
  summaryRows.push(new TableRow({
    children: row.map((text, j) => cell(text, colR[j], {
      shading: i % 2 === 1 ? LIGHT_GRAY : undefined,
      align: j >= 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    }))
  }));
});
summaryRows.push(new TableRow({
  children: [
    cell("TOTAL", colR[0], { bold: true, shading: LIGHT_BG }),
    cell("", colR[1], { shading: LIGHT_BG }),
    accentCell("1.656h", colR[2], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
    accentCell("R$ 233.060", colR[3], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
  ]
}));

contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colR,
  rows: summaryRows,
}));

// --- CENARIOS DE EQUIPE ---
contentChildren.push(spacer(300));
contentChildren.push(sectionTitle("6. Cenarios de Equipe x Tempo x Custo"));

const colC = [2800, 1200, 1560, 1800, 2000];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colC,
  rows: [
    new TableRow({ children: [
      headerCell("Cenario", colC[0]), headerCell("Equipe", colC[1]),
      headerCell("Prazo", colC[2]), headerCell("Custo/mes", colC[3]), headerCell("Custo Total", colC[4]),
    ]}),
    new TableRow({ children: [
      cell("Software House premium", colC[0]), cell("8 profissionais", colC[1]),
      cell("4-5 meses", colC[2], { align: AlignmentType.CENTER }),
      cell("~R$ 72.000", colC[3], { align: AlignmentType.CENTER }),
      cell("R$ 290.000-360.000", colC[4], { bold: true, align: AlignmentType.CENTER }),
    ]}),
    new TableRow({ children: [
      cell("Software House media", colC[0], { shading: LIGHT_GRAY }),
      cell("5 profissionais", colC[1], { shading: LIGHT_GRAY }),
      cell("5-6 meses", colC[2], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("~R$ 48.000", colC[3], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("R$ 240.000-290.000", colC[4], { bold: true, align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("Equipe enxuta (startup)", colC[0]), cell("3 profissionais", colC[1]),
      cell("6-8 meses", colC[2], { align: AlignmentType.CENTER }),
      cell("~R$ 35.000", colC[3], { align: AlignmentType.CENTER }),
      cell("R$ 210.000-280.000", colC[4], { bold: true, align: AlignmentType.CENTER }),
    ]}),
    new TableRow({ children: [
      cell("Dev solo senior (sem IA)", colC[0], { shading: LIGHT_GRAY }),
      cell("1 profissional", colC[1], { shading: LIGHT_GRAY }),
      cell("10-12 meses", colC[2], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("~R$ 18.000", colC[3], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("R$ 180.000-216.000", colC[4], { bold: true, align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("Dev + Claude Code (IA)", colC[0], { bold: true, shading: LIGHT_BG }),
      cell("1 profissional", colC[1], { bold: true, shading: LIGHT_BG }),
      accentCell("5 dias", colC[2], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
      cell("-", colC[3], { align: AlignmentType.CENTER, shading: LIGHT_BG }),
      accentCell("~R$ 18", colC[4], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
    ]}),
  ]
}));

// --- FERRAMENTAS ---
contentChildren.push(spacer(300));
contentChildren.push(sectionTitle("7. Ferramentas e Custos de Infraestrutura"));
contentChildren.push(sectionSubtitle("Stack de Desenvolvimento"));

const colT = [2800, 3760, 2800];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colT,
  rows: [
    new TableRow({ children: [headerCell("Ferramenta", colT[0]), headerCell("Funcao", colT[1]), headerCell("Custo", colT[2])] }),
    ...[
      ["Next.js 16", "Framework React full-stack", "Gratuito"],
      ["React 19", "UI library", "Gratuito"],
      ["TypeScript 5", "Linguagem tipada", "Gratuito"],
      ["Tailwind CSS 4", "Estilizacao", "Gratuito"],
      ["Git", "Versionamento (70 commits)", "Gratuito"],
      ["Claude Code", "Assistente IA de desenvolvimento", "~R$ 106/mes"],
      ["VS Code", "Editor de codigo", "Gratuito"],
    ].map((row, i) => new TableRow({
      children: row.map((text, j) => cell(text, colT[j], { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }))
    })),
  ]
}));

contentChildren.push(spacer(200));
contentChildren.push(sectionSubtitle("Infraestrutura de Producao"));

const colI = [1800, 1200, 1200, 1560, 1800, 1800];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colI,
  rows: [
    new TableRow({ children: [
      headerCell("Servico", colI[0]), headerCell("Plano Atual", colI[1]),
      headerCell("Custo/mes", colI[2]), headerCell("Plano Prod", colI[3]),
      headerCell("Custo Prod", colI[4]),
    ]}),
    ...[
      ["Supabase", "Free", "R$ 0", "Pro", "R$ 133"],
      ["Vercel", "Hobby", "R$ 0", "Pro", "R$ 106"],
      ["Sentry", "Free", "R$ 0", "Free", "R$ 0"],
      ["PostHog", "Free", "R$ 0", "Free", "R$ 0"],
      ["Dominio", "-", "-", ".com.br", "R$ 4"],
      ["TOTAL", "", "R$ 0", "", "~R$ 243/mes"],
    ].map((row, i) => new TableRow({
      children: row.map((text, j) => cell(text, colI[j], {
        shading: i % 2 === 1 ? LIGHT_GRAY : undefined,
        bold: i === 5,
        align: j >= 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
        color: i === 5 ? ACCENT : DARK,
      }))
    })),
  ]
}));

// --- ECONOMIA COM IA ---
contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
contentChildren.push(sectionTitle("8. Economia com IA (Claude Code)"));

const colE = [3000, 2200, 2200, 1960];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colE,
  rows: [
    new TableRow({ children: [
      headerCell("Metrica", colE[0]), headerCell("Tradicional", colE[1]),
      headerCell("Com Claude Code", colE[2]), headerCell("Economia", colE[3]),
    ]}),
    new TableRow({ children: [
      cell("Tempo de dev", colE[0], { bold: true }),
      cell("2-4 meses", colE[1], { align: AlignmentType.CENTER }),
      cell("5 dias", colE[2], { align: AlignmentType.CENTER, bold: true, color: GREEN }),
      cell("~95%", colE[3], { align: AlignmentType.CENTER, bold: true, color: GREEN }),
    ]}),
    new TableRow({ children: [
      cell("Custo dev (freelancer)", colE[0], { bold: true, shading: LIGHT_GRAY }),
      cell("R$ 80.000+", colE[1], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("R$ 18", colE[2], { align: AlignmentType.CENTER, bold: true, color: GREEN, shading: LIGHT_GRAY }),
      cell("~99,9%", colE[3], { align: AlignmentType.CENTER, bold: true, color: GREEN, shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("Custo software house", colE[0], { bold: true }),
      cell("R$ 120.000-300.000", colE[1], { align: AlignmentType.CENTER }),
      cell("R$ 18", colE[2], { align: AlignmentType.CENTER, bold: true, color: GREEN }),
      cell("~99,9%", colE[3], { align: AlignmentType.CENTER, bold: true, color: GREEN }),
    ]}),
    new TableRow({ children: [
      cell("Infra mensal", colE[0], { bold: true, shading: LIGHT_GRAY }),
      cell("R$ 500-2.000", colE[1], { align: AlignmentType.CENTER, shading: LIGHT_GRAY }),
      cell("R$ 0-243", colE[2], { align: AlignmentType.CENTER, bold: true, color: GREEN, shading: LIGHT_GRAY }),
      cell("~50-85%", colE[3], { align: AlignmentType.CENTER, bold: true, color: GREEN, shading: LIGHT_GRAY }),
    ]}),
  ]
}));

// --- VALOR TOTAL ---
contentChildren.push(spacer(400));
contentChildren.push(sectionTitle("9. Valor Total do Projeto"));
contentChildren.push(spacer(100));

const colV = [5680, 3680];
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: colV,
  rows: [
    new TableRow({ children: [
      headerCell("", colV[0]), headerCell("Valor", colV[1]),
    ]}),
    new TableRow({ children: [
      cell("Valor de mercado (funcionalidades)", colV[0], { bold: true }),
      cell("~R$ 233.060", colV[1], { bold: true, align: AlignmentType.CENTER }),
    ]}),
    new TableRow({ children: [
      cell("Custo real gasto", colV[0], { bold: true, shading: LIGHT_GRAY }),
      cell("~R$ 18", colV[1], { bold: true, align: AlignmentType.CENTER, color: GREEN, shading: LIGHT_GRAY }),
    ]}),
    new TableRow({ children: [
      cell("Infraestrutura anual (producao)", colV[0], { bold: true }),
      cell("~R$ 2.916/ano", colV[1], { bold: true, align: AlignmentType.CENTER }),
    ]}),
    new TableRow({ children: [
      cell("ROI do uso de IA", colV[0], { bold: true, shading: LIGHT_BG }),
      accentCell("12.948x", colV[1], { shading: LIGHT_BG, align: AlignmentType.CENTER }),
    ]}),
  ]
}));

contentChildren.push(spacer(400));

// Conclusion box
contentChildren.push(new Table({
  width: { size: TABLE_WIDTH, type: WidthType.DXA },
  columnWidths: [TABLE_WIDTH],
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      borders: thinBorders,
      shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
      margins: { top: 200, bottom: 200, left: 300, right: 300 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 },
          children: [new TextRun({ text: "CONCLUSAO", font: "Arial", size: 28, bold: true, color: DARK })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({
            text: "Em 5 dias e com R$ 18 de custo direto, foi entregue um produto completo que custaria R$ 233.060 em uma software house e levaria de 4 a 5 meses com uma equipe de 8 profissionais.",
            font: "Arial", size: 22, color: DARK,
          })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "1.656 horas de trabalho tradicional comprimidas em 53 horas - aceleracao de 31x.",
            font: "Arial", size: 22, bold: true, color: PRIMARY,
          })]
        }),
      ]
    })]
  })]
}));

const contentSection = {
  properties: {
    page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
    },
  },
  headers: {
    default: new Header({
      children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 4 } },
        spacing: { after: 0 },
        children: [
          new TextRun({ text: "Kindar", font: "Arial", size: 18, bold: true, color: PRIMARY }),
          new TextRun({ text: "  |  Relatorio de Desenvolvimento  |  Marco 2026", font: "Arial", size: 16, color: GRAY }),
        ]
      })]
    })
  },
  footers: {
    default: new Footer({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD", space: 4 } },
        children: [
          new TextRun({ text: "Pagina ", font: "Arial", size: 16, color: GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: GRAY }),
        ]
      })]
    })
  },
  children: contentChildren,
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: DARK },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: PRIMARY },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
    ]
  },
  sections: [coverSection, contentSection],
});

const OUTPUT = "C:\\Users\\henri\\OneDrive\\Área de Trabalho\\APP CoPais\\DEV\\RELATORIO-DESENVOLVIMENTO-2LARES.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log("Documento gerado:", OUTPUT);
});
