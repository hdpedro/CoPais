#!/usr/bin/env node
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, PageOrientation, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageBreak, Footer, PageNumber,
} from 'docx';
import { writeFileSync } from 'node:fs';

const TITLE = 'Kindar — iOS Brasil';
const SUBTITLE = 'Aquisição × conversão · últimos 30 dias';
const PERIOD = 'Período coberto: 28/04/2026 a 27/05/2026 (dados Apple Sales Reports + Supabase + PostHog)';

const ARIAL = 'Arial';
const NAVY = '0F2C4D';
const ORANGE = 'C75300';
const GREEN = '1E7B3A';
const MUTED = '5B6B7B';
const LINE = 'D5DAE0';
const ACCENT_BG = 'F4F7FA';

const border = (color = LINE) => ({ style: BorderStyle.SINGLE, size: 4, color });
const cellBorders = { top: border(), bottom: border(), left: border(), right: border() };
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

const t = (text, opts = {}) => new TextRun({ text, font: ARIAL, ...opts });
const p = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
const spacer = (sz = 120) => p([t('')], { spacing: { before: sz, after: sz } });

// Tabela dia-a-dia (consolidado)
const daily = [
  ['28/04', 0, 0, '', ''],
  ['29/04', 0, 0, '', ''],
  ['30/04', 0, 0, '', ''],
  ['01/05', 0, 0, '', ''],
  ['02/05', 0, 0, '', ''],
  ['03/05', 0, 0, '', ''],
  ['04/05', 1, 0, '', ''],
  ['05/05', 4, 0, '', ''],
  ['06/05', 1, 0, '', ''],
  ['07/05', 1, 0, '', ''],
  ['08/05', 1, 0, '', ''],
  ['09/05', 0, 6, '', ''],
  ['10/05', 0, 2, '', ''],
  ['11/05', 2, 1, '', ''],
  ['12/05', 3, 6, '', ''],
  ['13/05', 0, 4, '', ''],
  ['14/05', 1, 0, 'fabiotuller', ''],
  ['15/05', 10, 0, '', 'fabiotuller (+22h)'],
  ['16/05', 2, 0, '', ''],
  ['17/05', 1, 0, '', ''],
  ['18/05', 3, 9, 'cisfer', 'cisfer (+3min)'],
  ['19/05', 5, 25, '', ''],
  ['20/05', 4, 26, '', ''],
  ['21/05', 2, 27, '', ''],
  ['22/05', 2, 23, 'edyenis', 'edyenis (+1min)'],
  ['23/05', 0, 21, '', ''],
  ['24/05', 0, 8, '', ''],
  ['25/05', 0, 1, '', ''],
  ['26/05', 0, 14, '', ''],
  ['27/05', 0, 20, '', ''],
];

// ---------- helpers de UI ----------
function bigNumberBox({ value, label, sublabel, color }) {
  // Card 3-row table simulating a KPI box
  return new TableCell({
    borders: cellBorders,
    width: { size: 3120, type: WidthType.DXA },
    margins: { top: 200, bottom: 200, left: 200, right: 200 },
    shading: { fill: ACCENT_BG, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      p([t(value, { bold: true, size: 56, color })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
      p([t(label, { bold: true, size: 22, color: NAVY })], { alignment: AlignmentType.CENTER, spacing: { after: 30 } }),
      p([t(sublabel, { size: 18, color: MUTED })], { alignment: AlignmentType.CENTER }),
    ],
  });
}

function headerCell(text, width) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    children: [p([t(text, { bold: true, color: 'FFFFFF', size: 20 })])],
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    children: [p([t(String(text ?? ''), { size: 20, color: opts.color || '000000', bold: !!opts.bold })], { alignment: opts.align })],
  });
}

// ---------- bloco: KPIs ----------
const kpis = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [3120, 3120, 3120],
  rows: [
    new TableRow({
      children: [
        bigNumberBox({ value: '43', label: 'Downloads BR', sublabel: 'primeiras instalações iOS', color: NAVY }),
        bigNumberBox({ value: '3', label: 'Signups iOS', sublabel: 'cadastros identificados', color: ORANGE }),
        bigNumberBox({ value: '7,0%', label: 'Conversão', sublabel: 'download → cadastro', color: GREEN }),
      ],
    }),
  ],
});

// ---------- bloco: funil ----------
const funnelRows = [
  ['Download (Apple Sales Reports BR)', '43', 'base'],
  ['Abriu o app (PostHog $os=iOS)', '45', '+5% vs Apple — bate dentro da margem'],
  ['Completou signup (identify com email)', '3', '7,0% do download'],
  ['Ativou (criou 1ª criança em ≤7d)', '3', '100% do signup · mediana ~3 min'],
];

const funnelTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4500, 1500, 3360],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Etapa', 4500),
        headerCell('Usuários', 1500),
        headerCell('Leitura', 3360),
      ],
    }),
    ...funnelRows.map(([etapa, n, leitura], idx) => new TableRow({
      children: [
        dataCell(etapa, 4500, { bold: true }),
        dataCell(n, 1500, { align: AlignmentType.CENTER, bold: true, color: idx === 2 ? ORANGE : idx === 3 ? GREEN : NAVY }),
        dataCell(leitura, 3360, { color: MUTED }),
      ],
    })),
  ],
});

// ---------- bloco: tabela diária ----------
const sumDl = daily.reduce((s, r) => s + r[1], 0);
const sumUp = daily.reduce((s, r) => s + r[2], 0);
const sumSign = daily.filter(r => r[3]).length;
const sumAct = daily.filter(r => r[4]).length;

const dailyTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [1100, 1500, 1300, 2530, 2930],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Dia', 1100),
        headerCell('Downloads', 1500),
        headerCell('Updates', 1300),
        headerCell('Signup iOS', 2530),
        headerCell('Ativação 1ª criança', 2930),
      ],
    }),
    ...daily.map(([dia, dl, up, sign, act]) => new TableRow({
      children: [
        dataCell(dia, 1100, { bold: true, color: NAVY }),
        dataCell(dl || '–', 1500, { align: AlignmentType.CENTER, bold: dl > 0, color: dl >= 5 ? ORANGE : dl > 0 ? NAVY : MUTED }),
        dataCell(up || '–', 1300, { align: AlignmentType.CENTER, color: up > 0 ? NAVY : MUTED }),
        dataCell(sign || '', 2530, { color: sign ? ORANGE : MUTED, bold: !!sign }),
        dataCell(act || '', 2930, { color: act ? GREEN : MUTED, bold: !!act }),
      ],
    })),
    new TableRow({
      children: [
        dataCell('Total', 1100, { bold: true, color: NAVY, shade: ACCENT_BG }),
        dataCell(sumDl, 1500, { align: AlignmentType.CENTER, bold: true, color: NAVY, shade: ACCENT_BG }),
        dataCell(sumUp, 1300, { align: AlignmentType.CENTER, bold: true, color: NAVY, shade: ACCENT_BG }),
        dataCell(`${sumSign} cadastros`, 2530, { bold: true, color: ORANGE, shade: ACCENT_BG }),
        dataCell(`${sumAct} ativações`, 2930, { bold: true, color: GREEN, shade: ACCENT_BG }),
      ],
    }),
  ],
});

// ---------- DOC ----------
const doc = new Document({
  creator: 'Henrique de Pedro',
  title: 'Kindar iOS - Aquisição e Conversão 30d',
  styles: {
    default: { document: { run: { font: ARIAL, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: ARIAL, color: NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: ARIAL, color: NAVY },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 280 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 280 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1200, right: 1200, bottom: 1100, left: 1200 },
      },
    },
    footers: {
      default: new Footer({
        children: [p([
          t('Kindar · iOS Brasil · 30 dias · gerado em 28/05/2026  ·  ', { size: 16, color: MUTED }),
          t('Página ', { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: ARIAL }),
          t(' de ', { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED, font: ARIAL }),
        ], { alignment: AlignmentType.CENTER })],
      }),
    },
    children: [
      // ====== CAPA / TÍTULO ======
      p([t(TITLE, { bold: true, size: 56, color: NAVY })], { spacing: { before: 240, after: 100 } }),
      p([t(SUBTITLE, { size: 30, color: ORANGE })], { spacing: { after: 100 } }),
      p([t(PERIOD, { size: 20, color: MUTED, italics: true })], { spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } } }),
      spacer(60),

      // ====== KPIs ======
      kpis,
      spacer(120),

      // ====== RESUMO EXECUTIVO ======
      p([t('Resumo', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      p([t('Nos últimos 30 dias o Kindar teve ', { size: 22 }),
         t('43 primeiras instalações iOS no Brasil', { bold: true, size: 22, color: NAVY }),
         t(' e ', { size: 22 }),
         t('193 atualizações', { size: 22 }),
         t(' (curva alta de updates a partir de 18/05 confirma adoção do fix do Face ID na 1.0.7). Dessas 43 instalações, ', { size: 22 }),
         t('apenas 3 viraram cadastro', { bold: true, size: 22, color: ORANGE }),
         t(' — uma taxa de ', { size: 22 }),
         t('7,0% de download → signup', { bold: true, size: 22, color: ORANGE }),
         t('. Em compensação, ', { size: 22 }),
         t('100% dos signups iOS completaram a ativação', { bold: true, size: 22, color: GREEN }),
         t(' (criaram a primeira criança), com mediana de ~3 minutos entre o cadastro e o setup completo.', { size: 22 })],
         { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),
      p([t('Em uma frase: o produto entrega o "Aha!" praticamente na hora — quem cadastra, ativa. O gargalo está acima, no topo do funil, entre instalar e criar conta.', { italics: true, size: 22, color: MUTED })],
         { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),

      // ====== FUNIL ======
      p([t('Funil iOS Brasil', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      funnelTable,
      spacer(120),

      // Quebra de página antes da tabela longa
      p([new PageBreak()]),

      // ====== TABELA DIÁRIA ======
      p([t('Dia a dia', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      p([t('Downloads e updates: Apple Sales Reports (somente Brasil, Apple Identifier 6762701916). Signups e ativações: Supabase, identificados via PostHog (sinal $os = iOS).', { size: 18, color: MUTED, italics: true })], { spacing: { after: 200 } }),
      dailyTable,
      spacer(200),

      // ====== LEITURAS ======
      p([t('O que isso quer dizer', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      p([
        t('1. O furo está antes do signup, não depois. ', { bold: true, color: NAVY }),
        t('9 de cada 10 instalações iOS BR são perdidas antes do cadastro. Esse é o lugar mais barato pra mexer: telas de welcome, fricção no signup, fluxo de OAuth no iOS. Como a ativação pós-signup é 100% e quase instantânea, qualquer ponto de conversão a mais aqui em cima vira receita potencial direta.'),
      ], { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),
      p([
        t('2. O pico de 15/05 (10 downloads em um dia) destoa. ', { bold: true, color: NAVY }),
        t('Vale entender o que aconteceu: indicação orgânica, post em rede, anúncio, alguém da imprensa? Se reproduzível, é um modelo de aquisição barato pra escalar.'),
      ], { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),
      p([
        t('3. A curva de updates valida o ciclo de delivery. ', { bold: true, color: NAVY }),
        t('A partir de 19/05 os updates aceleram (25, 26, 27, 23 por dia) — coincide exatamente com o fix do loop de Face ID que saiu na 1.0.7. A base ativa adota OTAs e binários novos rápido, o que dá segurança pra continuar iterando.'),
      ], { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),
      p([
        t('4. Pré-orders existem e ainda não foram exploradas. ', { bold: true, color: NAVY }),
        t('Em 4 dias do período (08, 18, 19, 26/05) apareceram pré-orders na Apple — usuários que clicaram em algum link de pré-compra. Vale rastrear a origem desses links e entender o que está convertendo (provavelmente compartilhamento orgânico).'),
      ], { spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }),

      // ====== PRÓXIMOS PASSOS ======
      p([t('Sugestões de próximos passos', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      p([t('Atacar o gargalo download → signup. ', { bold: true, color: NAVY }), t('Instrumentar com PostHog cada tela entre abrir o app e completar o cadastro, identificar onde está o drop-off real (welcome, OAuth, formulário, confirmação de email). Hipótese inicial: a tela de criar conta exige email/senha sem opção de "Continuar com Apple" — em iOS isso é fricção significativa.')], { numbering: { reference: 'numbers', level: 0 }, spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED }),
      p([t('Investigar o pico de 15/05. ', { bold: true, color: NAVY }), t('Cruzar com posts em redes, indicações no app, ou qualquer ação de mídia daquela semana. Se identificarmos a fonte, virar canal recorrente.')], { numbering: { reference: 'numbers', level: 0 }, spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED }),
      p([t('Pedir indicação pós-ativação. ', { bold: true, color: NAVY }), t('A janela entre signup e ativação é de minutos e 100% de retenção. É o melhor momento pra pedir indicação de coparente ou de outro casal — fricção emocional zero.')], { numbering: { reference: 'numbers', level: 0 }, spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED }),
      p([t('Acompanhar este painel toda segunda. ', { bold: true, color: NAVY }), t('O script que gerou estes números é reusável (scripts/asc/downloads-30d.mjs). Roda em <1 minuto. Vale virar leitura semanal pra capturar tendências cedo.')], { numbering: { reference: 'numbers', level: 0 }, spacing: { after: 280 }, alignment: AlignmentType.JUSTIFIED }),

      // ====== METODOLOGIA ======
      p([t('Fontes e metodologia', { bold: true })], { heading: HeadingLevel.HEADING_2 }),
      p([t('Downloads e updates: ', { bold: true, size: 20 }), t('Apple App Store Connect, endpoint /v1/salesReports (DAILY, vendor 94182024, Apple Identifier 6762701916, Country Code = BR). Downloads = Product Type Identifier 1 (primeira instalação iPhone). Updates = PTI iniciando em 7.', { size: 20, color: MUTED })], { spacing: { after: 120 } }),
      p([t('Signups iOS: ', { bold: true, size: 20 }), t('cruzamento entre PostHog (eventos com propriedade $os = iOS, person.properties.email não-nulo) e Supabase (tabela profiles, is_test_account = false). 6 emails iOS identificados no PostHog no período; 3 dentro da janela de signup dos últimos 30 dias.', { size: 20, color: MUTED })], { spacing: { after: 120 } }),
      p([t('Ativação 1ª criança: ', { bold: true, size: 20 }), t('Supabase, MIN(children.created_at) por coparenting_groups.created_by, filtrando grupos de teste (is_test_fixture = false). Critério "ativou": primeira criança adicionada em até 7 dias após o signup.', { size: 20, color: MUTED })], { spacing: { after: 120 } }),
      p([t('Limites conhecidos: ', { bold: true, size: 20 }), t('PostHog só passou a capturar $os = iOS a partir de 13/05 — antes disso, sinal indireto. Cross-check com Apple (45 person_ids iOS no PostHog vs 43 downloads Apple) sugere captura completa dentro da janela. Pré-orders (PTI = 3) não estão contadas como download nem como update.', { size: 20, color: MUTED, italics: true })], { spacing: { after: 240 } }),
    ],
  }],
});

const outPath = process.env.OUT_PATH || 'C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/Kindar - iOS Aquisicao e Conversao - 30d.docx';
Packer.toBuffer(doc).then((buf) => {
  writeFileSync(outPath, buf);
  console.log(`Gerado: ${outPath}`);
  console.log(`Tamanho: ${(buf.length / 1024).toFixed(1)} KB`);
});
