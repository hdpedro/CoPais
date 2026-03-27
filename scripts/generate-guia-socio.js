const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require("docx");

// Colors
const DARK_GREEN = "1A3B3A";
const ACCENT_ORANGE = "E8734A";
const LIGHT_GREEN = "E8F5E9";
const LIGHT_BLUE = "E3F2FD";
const LIGHT_ORANGE = "FFF3E0";
const LIGHT_GRAY = "F5F5F5";
const MEDIUM_GRAY = "E0E0E0";
const WHITE = "FFFFFF";

// Table helpers
const border = { style: BorderStyle.SINGLE, size: 1, color: MEDIUM_GRAY };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: DARK_GREEN, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: WHITE, font: "Arial", size: 20 })] })],
  });
}

function dataCell(text, width, opts = {}) {
  const fill = opts.fill || WHITE;
  const bold = opts.bold || false;
  const color = opts.color || "333333";
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold, color, font: "Arial", size: 20 })] })],
  });
}

function sectionTitle(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({ text: `${num}. `, bold: true, color: ACCENT_ORANGE, font: "Arial", size: 32 }),
      new TextRun({ text, bold: true, color: DARK_GREEN, font: "Arial", size: 32 }),
    ],
  });
}

function subTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, color: DARK_GREEN, font: "Arial", size: 26 })],
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "333333", bold: opts.bold || false })],
  });
}

function bulletItem(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: "333333", bold: opts.bold || false })],
  });
}

function checkItem(text, checked = false) {
  const prefix = checked ? "[x] " : "[ ] ";
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: prefix, font: "Courier New", size: 20, color: checked ? "4CAF50" : "999999" }),
      new TextRun({ text, font: "Arial", size: 20, color: "333333" }),
    ],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: MEDIUM_GRAY, space: 8 } },
    children: [],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 100 }, children: [] });
}

// ---------- Build Document ----------

const TABLE_WIDTH = 9360;

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: DARK_GREEN },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: DARK_GREEN },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    // ====== COVER PAGE ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Kindar", bold: true, color: DARK_GREEN, font: "Arial", size: 72 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT_ORANGE, space: 12 } },
          children: [new TextRun({ text: "Coparentalidade Inteligente", color: ACCENT_ORANGE, font: "Arial", size: 32 })],
        }),
        emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "Como Funciona a Nossa Operacao", bold: true, color: DARK_GREEN, font: "Arial", size: 40 })],
        }),
        emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "Documento para entendimento do processo de desenvolvimento,", color: "666666", font: "Arial", size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "infraestrutura e proximos passos do Kindar.", color: "666666", font: "Arial", size: 22 })],
        }),
        emptyLine(), emptyLine(), emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Marco/2026", color: "999999", font: "Arial", size: 20 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "URL: https://kindar.vercel.app", color: "999999", font: "Arial", size: 20 })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // ====== MAIN CONTENT ======
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: DARK_GREEN, space: 4 } },
            children: [
              new TextRun({ text: "Kindar", bold: true, color: DARK_GREEN, font: "Arial", size: 18 }),
              new TextRun({ text: "  |  Como Funciona a Nossa Operacao", color: "999999", font: "Arial", size: 18 }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Pagina ", color: "999999", font: "Arial", size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], color: "999999", font: "Arial", size: 16 }),
            ],
          })],
        }),
      },
      children: [
        // ---- SECTION 1 ----
        sectionTitle("1", "O QUE E O 2LARES"),
        bodyText("Um aplicativo web (que funciona como app no celular) para pais separados organizarem a rotina dos filhos: calendario de guarda, despesas compartilhadas, comunicacao e documentos \u2014 tudo em um lugar so."),
        divider(),

        // ---- SECTION 2 ----
        sectionTitle("2", "COMO O SISTEMA FUNCIONA"),
        bodyText("Imagine o Kindar como um predio com 3 andares:"),
        emptyLine(),

        subTitle("Andar 1 \u2014 O que o usuario ve (Frontend)"),
        bodyText("Ferramenta: Next.js + React (hospedado na Vercel)", { bold: true }),
        bodyText("E a \"cara\" do aplicativo. Tudo que o usuario toca, ve e interage. Inclui:"),
        bulletItem("Telas de login, cadastro, dashboard"),
        bulletItem("Calendario de guarda"),
        bulletItem("Chat entre os pais"),
        bulletItem("Controle financeiro"),
        bulletItem("Documentos, saude, escola"),
        emptyLine(),
        bodyText("Onde fica hospedado: Vercel (como se fosse o \"terreno\" onde o predio esta construido)", { bold: true }),
        bulletItem("Custo atual: Gratuito"),
        bulletItem("O site fica no ar 24h, em servidores espalhados pelo mundo"),
        bulletItem("Quando fazemos uma atualizacao no codigo, o site atualiza sozinho em ~40 segundos"),
        emptyLine(),

        subTitle("Andar 2 \u2014 Onde ficam os dados (Banco de Dados)"),
        bodyText("Ferramenta: Supabase", { bold: true }),
        bodyText("E o \"cofre\" do aplicativo. Guarda todos os dados dos usuarios:"),
        bulletItem("Contas e perfis dos usuarios"),
        bulletItem("Eventos do calendario"),
        bulletItem("Mensagens do chat"),
        bulletItem("Registros financeiros"),
        bulletItem("Documentos enviados"),
        emptyLine(),
        bodyText("Tambem faz:", { bold: true }),
        bulletItem("Login seguro (autenticacao)"),
        bulletItem("Atualizacao em tempo real (quando alguem manda mensagem no chat, aparece na hora)"),
        bulletItem("Controle de quem pode ver o que (seguranca)"),
        bulletItem("Custo atual: Gratuito"),
        emptyLine(),

        subTitle("Andar 3 \u2014 O processo de atualizacao (Deploy automatico)"),
        bodyText("Ferramentas: Git + GitHub + Vercel", { bold: true }),
        bodyText("Fluxo de atualizacao:"),
        emptyLine(),
        new Table({
          width: { size: 6000, type: WidthType.DXA },
          columnWidths: [6000],
          rows: [
            new TableRow({ children: [new TableCell({
              borders: noBorders,
              width: { size: 6000, type: WidthType.DXA },
              shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 200, right: 200 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Desenvolvedor escreve codigo", font: "Arial", size: 20, color: DARK_GREEN, bold: true })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "\u2193", font: "Arial", size: 24, color: ACCENT_ORANGE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Envia para o GitHub (repositorio de codigo)", font: "Arial", size: 20, color: "333333" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "\u2193", font: "Arial", size: 24, color: ACCENT_ORANGE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Vercel detecta automaticamente", font: "Arial", size: 20, color: "333333" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "\u2193", font: "Arial", size: 24, color: ACCENT_ORANGE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Compila e publica em ~40 segundos", font: "Arial", size: 20, color: "333333" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "\u2193", font: "Arial", size: 24, color: ACCENT_ORANGE })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Usuarios ja veem a versao nova!", font: "Arial", size: 20, color: "4CAF50", bold: true })] }),
              ],
            })] }),
          ],
        }),
        emptyLine(),
        bodyText("Ninguem precisa \"desligar\" o sistema para atualizar. E automatico."),
        divider(),

        // ---- SECTION 3 ----
        sectionTitle("3", "O QUE CADA \"AGENTE\" FAZ"),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [1800, 2600, 2800, 2160],
          rows: [
            new TableRow({ children: [
              headerCell("Servico", 1800), headerCell("O que faz", 2600),
              headerCell("Analogia simples", 2800), headerCell("Custo atual", 2160),
            ] }),
            new TableRow({ children: [
              dataCell("Vercel", 1800, { bold: true }),
              dataCell("Hospeda o site e entrega para os usuarios", 2600),
              dataCell("O \"terreno e predio\"", 2800),
              dataCell("Gratuito", 2160, { color: "4CAF50", bold: true }),
            ] }),
            new TableRow({ children: [
              dataCell("Supabase", 1800, { bold: true, fill: LIGHT_GRAY }),
              dataCell("Guarda dados, faz login, chat em tempo real", 2600, { fill: LIGHT_GRAY }),
              dataCell("O \"cofre e porteiro\"", 2800, { fill: LIGHT_GRAY }),
              dataCell("Gratuito", 2160, { color: "4CAF50", bold: true, fill: LIGHT_GRAY }),
            ] }),
            new TableRow({ children: [
              dataCell("GitHub", 1800, { bold: true }),
              dataCell("Guarda o codigo-fonte e historico de mudancas", 2600),
              dataCell("O \"cartorio\" do codigo", 2800),
              dataCell("Gratuito", 2160, { color: "4CAF50", bold: true }),
            ] }),
            new TableRow({ children: [
              dataCell("Next.js/React", 1800, { bold: true, fill: LIGHT_GRAY }),
              dataCell("Framework que constroi as telas", 2600, { fill: LIGHT_GRAY }),
              dataCell("A \"planta do predio\"", 2800, { fill: LIGHT_GRAY }),
              dataCell("Gratuito", 2160, { color: "4CAF50", bold: true, fill: LIGHT_GRAY }),
            ] }),
            new TableRow({ children: [
              dataCell("PWA", 1800, { bold: true }),
              dataCell("Permite instalar como app no celular", 2600),
              dataCell("O \"atalho na home\"", 2800),
              dataCell("Gratuito", 2160, { color: "4CAF50", bold: true }),
            ] }),
          ],
        }),
        divider(),

        // ---- SECTION 4 ----
        sectionTitle("4", "O QUE JA ESTA FUNCIONANDO HOJE"),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2800, 1200, 5360],
          rows: [
            new TableRow({ children: [
              headerCell("Modulo", 2800), headerCell("Status", 1200), headerCell("Descricao", 5360),
            ] }),
            ...([
              ["PWA (App no celular)", "Ativo", "Usuario instala pelo navegador, abre como app"],
              ["Login/Cadastro", "Ativo", "Email + senha, recuperacao de senha"],
              ["Grupos familiares", "Ativo", "Criar grupo, convidar membros, definir papeis"],
              ["Calendario de guarda", "Ativo", "Escala de dias, feriados nacionais destacados"],
              ["Trocas de dias", "Ativo", "Solicitar troca com aprovacao, saldo de dias"],
              ["Visitas de avos", "Ativo", "Avos solicitam visita, pai responsavel aprova"],
              ["Chat", "Ativo", "Mensagens em tempo real com resposta instantanea"],
              ["Mediador IA no chat", "Ativo", "Detecta tom agressivo e sugere reescrita neutra"],
              ["Despesas compartilhadas", "Ativo", "Registrar gastos, ver saldo entre os pais"],
              ["Documentos", "Ativo", "Upload e organizacao de documentos"],
              ["Escola", "Ativo", "Informacoes escolares"],
              ["Saude", "Ativo", "Registros de saude"],
              ["Check-in", "Ativo", "Registro de atividades diarias da crianca"],
              ["Convites com status", "Ativo", "Enviar, ver se aceitou/pendente, excluir"],
              ["Dashboard", "Ativo", "Resumo do dia, proximos dias, saldo financeiro"],
            ].map((row, i) => new TableRow({ children: [
              dataCell(row[0], 2800, { bold: true, fill: i % 2 === 0 ? LIGHT_GRAY : WHITE }),
              dataCell(row[1], 1200, { color: "4CAF50", bold: true, fill: i % 2 === 0 ? LIGHT_GRAY : WHITE }),
              dataCell(row[2], 5360, { fill: i % 2 === 0 ? LIGHT_GRAY : WHITE }),
            ] }))),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- SECTION 5 ----
        sectionTitle("5", "PROXIMOS PASSOS POR FAIXA DE USUARIOS"),

        // Phase 1
        subTitle("Fase 1: 0 a 500 usuarios (AGORA)"),
        bodyText("Custo mensal: R$ 0", { bold: true }),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2000, 2000, 5360],
          rows: [
            new TableRow({ children: [headerCell("Item", 2000), headerCell("Plano", 2000), headerCell("Limite", 5360)] }),
            new TableRow({ children: [dataCell("Vercel", 2000, { bold: true }), dataCell("Free", 2000), dataCell("100 GB de banda/mes", 5360)] }),
            new TableRow({ children: [dataCell("Supabase", 2000, { bold: true, fill: LIGHT_GRAY }), dataCell("Free", 2000, { fill: LIGHT_GRAY }), dataCell("500 MB de banco, 1 GB de storage, 50k autenticacoes/mes", 5360, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("GitHub", 2000, { bold: true }), dataCell("Free", 2000), dataCell("Ilimitado", 5360)] }),
          ],
        }),
        emptyLine(),
        bodyText("O que fazer agora:", { bold: true }),
        checkItem("App funcionando e publicado", true),
        checkItem("PWA instalavel no celular", true),
        checkItem("Deploy automatico configurado", true),
        checkItem("Testar com 10-20 usuarios reais (amigos/familia)"),
        checkItem("Coletar feedback e ajustar UX"),
        checkItem("Configurar dominio proprio (ex: app.kindar.com.br)"),
        checkItem("Adicionar Google Analytics para medir uso"),
        emptyLine(),
        new Paragraph({
          spacing: { after: 120 },
          shading: { fill: LIGHT_ORANGE, type: ShadingType.CLEAR },
          children: [new TextRun({ text: "  Quando migrar: Quando o banco passar de 400 MB ou tiver mais de 200 usuarios simultaneos", font: "Arial", size: 20, color: ACCENT_ORANGE, bold: true })],
        }),
        emptyLine(),

        // Phase 2
        subTitle("Fase 2: 500 a 5.000 usuarios"),
        bodyText("Custo mensal estimado: ~R$ 250/mes (US$ 45)", { bold: true }),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 2500, 4360],
          rows: [
            new TableRow({ children: [headerCell("Item", 2500), headerCell("Plano", 2500), headerCell("Custo", 4360)] }),
            new TableRow({ children: [dataCell("Vercel", 2500, { bold: true }), dataCell("Pro", 2500), dataCell("US$ 20/mes", 4360)] }),
            new TableRow({ children: [dataCell("Supabase", 2500, { bold: true, fill: LIGHT_GRAY }), dataCell("Pro", 2500, { fill: LIGHT_GRAY }), dataCell("US$ 25/mes", 4360, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("Dominio .com.br", 2500, { bold: true }), dataCell("\u2014", 2500), dataCell("~R$ 40/ano", 4360)] }),
          ],
        }),
        emptyLine(),
        bodyText("O que fazer nesta fase:", { bold: true }),
        checkItem("Contratar Vercel Pro + Supabase Pro"),
        checkItem("Dominio proprio com SSL"),
        checkItem("Adicionar Sentry (monitoramento de erros)"),
        checkItem("Push notifications (notificar sobre trocas, mensagens)"),
        checkItem("Termos de uso e politica de privacidade (LGPD)"),
        checkItem("Pagina de landing/marketing"),
        emptyLine(),

        // Phase 3
        subTitle("Fase 3: 5.000 a 20.000 usuarios"),
        bodyText("Custo mensal estimado: ~R$ 800/mes (US$ 150)", { bold: true }),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 2500, 4360],
          rows: [
            new TableRow({ children: [headerCell("Item", 2500), headerCell("Plano", 2500), headerCell("Custo", 4360)] }),
            new TableRow({ children: [dataCell("Vercel", 2500, { bold: true }), dataCell("Pro", 2500), dataCell("US$ 20/mes", 4360)] }),
            new TableRow({ children: [dataCell("Supabase", 2500, { bold: true, fill: LIGHT_GRAY }), dataCell("Pro (escalado)", 2500, { fill: LIGHT_GRAY }), dataCell("US$ 75-100/mes", 4360, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("Sentry", 2500, { bold: true }), dataCell("Pro", 2500), dataCell("US$ 26/mes", 4360)] }),
            new TableRow({ children: [dataCell("Email (Resend)", 2500, { bold: true, fill: LIGHT_GRAY }), dataCell("Pro", 2500, { fill: LIGHT_GRAY }), dataCell("US$ 20/mes", 4360, { fill: LIGHT_GRAY })] }),
          ],
        }),
        emptyLine(),
        bodyText("O que fazer nesta fase:", { bold: true }),
        checkItem("Otimizar banco de dados (indices, queries)"),
        checkItem("CDN para documentos/imagens (Cloudflare R2)"),
        checkItem("Emails automaticos (lembretes, resumo semanal)"),
        checkItem("App na App Store via Capacitor (custo: US$ 99/ano Apple)"),
        checkItem("Suporte ao usuario (chat/email)"),
        checkItem("Metricas de retencao e engajamento"),
        emptyLine(),

        // Phase 4
        subTitle("Fase 4: 20.000 a 50.000 usuarios"),
        bodyText("Custo mensal estimado: ~R$ 3.500/mes (US$ 650)", { bold: true }),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 2500, 4360],
          rows: [
            new TableRow({ children: [headerCell("Item", 2500), headerCell("Plano", 2500), headerCell("Custo", 4360)] }),
            new TableRow({ children: [dataCell("Vercel", 2500, { bold: true }), dataCell("Pro/Enterprise", 2500), dataCell("US$ 20-50/mes", 4360)] }),
            new TableRow({ children: [dataCell("Supabase", 2500, { bold: true, fill: LIGHT_GRAY }), dataCell("Team", 2500, { fill: LIGHT_GRAY }), dataCell("US$ 599/mes", 4360, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("Sentry", 2500, { bold: true }), dataCell("Business", 2500), dataCell("US$ 80/mes", 4360)] }),
            new TableRow({ children: [dataCell("Infra extra", 2500, { bold: true, fill: LIGHT_GRAY }), dataCell("\u2014", 2500, { fill: LIGHT_GRAY }), dataCell("~US$ 50/mes", 4360, { fill: LIGHT_GRAY })] }),
          ],
        }),
        emptyLine(),
        bodyText("O que fazer nesta fase:", { bold: true }),
        checkItem("Equipe de suporte dedicada"),
        checkItem("Testes de carga (simular milhares de acessos)"),
        checkItem("Cache avancado (Redis)"),
        checkItem("App nativo iOS + Android (se ainda nao fez)"),
        checkItem("Integracoes (Google Calendar, WhatsApp)"),
        checkItem("Consultoria juridica para LGPD completa"),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- SECTION 6 ----
        sectionTitle("6", "RESUMO DE CUSTOS"),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({ children: [
              headerCell("Usuarios", 3120), headerCell("Custo mensal (R$)", 3120), headerCell("Custo por usuario", 3120),
            ] }),
            new TableRow({ children: [
              dataCell("0 - 500", 3120, { bold: true }), dataCell("R$ 0", 3120, { color: "4CAF50", bold: true }), dataCell("R$ 0,00", 3120),
            ] }),
            new TableRow({ children: [
              dataCell("500 - 5.000", 3120, { bold: true, fill: LIGHT_GRAY }), dataCell("~R$ 250", 3120, { fill: LIGHT_GRAY }), dataCell("R$ 0,05 - 0,50", 3120, { fill: LIGHT_GRAY }),
            ] }),
            new TableRow({ children: [
              dataCell("5.000 - 20.000", 3120, { bold: true }), dataCell("~R$ 800", 3120), dataCell("R$ 0,04 - 0,16", 3120),
            ] }),
            new TableRow({ children: [
              dataCell("20.000 - 50.000", 3120, { bold: true, fill: LIGHT_GRAY }), dataCell("~R$ 3.500", 3120, { fill: LIGHT_GRAY }), dataCell("R$ 0,07 - 0,17", 3120, { fill: LIGHT_GRAY }),
            ] }),
          ],
        }),
        emptyLine(),
        new Paragraph({
          spacing: { after: 200 },
          shading: { fill: LIGHT_GREEN, type: ShadingType.CLEAR },
          children: [new TextRun({ text: "  Ponto importante: O custo por usuario DIMINUI conforme cresce. Se cobrarmos R$ 19,90/mes por familia, com 1.000 familias pagantes ja temos R$ 19.900/mes de receita contra R$ 250 de custo.", font: "Arial", size: 20, color: DARK_GREEN, bold: true })],
        }),
        divider(),

        // ---- SECTION 7 ----
        sectionTitle("7", "RISCOS E COMO MITIGAR"),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2800, 2000, 4560],
          rows: [
            new TableRow({ children: [headerCell("Risco", 2800), headerCell("Probabilidade", 2000), headerCell("Mitigacao", 4560)] }),
            new TableRow({ children: [dataCell("Site sair do ar", 2800), dataCell("Baixa", 2000, { color: "4CAF50" }), dataCell("Vercel tem 99.99% de uptime", 4560)] }),
            new TableRow({ children: [dataCell("Perder dados", 2800, { fill: LIGHT_GRAY }), dataCell("Muito baixa", 2000, { color: "4CAF50", fill: LIGHT_GRAY }), dataCell("Supabase faz backup automatico (no plano Pro)", 4560, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("Ser hackeado", 2800), dataCell("Baixa", 2000, { color: "4CAF50" }), dataCell("Autenticacao segura, RLS no banco, HTTPS", 4560)] }),
            new TableRow({ children: [dataCell("Supabase ficar caro", 2800, { fill: LIGHT_GRAY }), dataCell("Media", 2000, { color: ACCENT_ORANGE, fill: LIGHT_GRAY }), dataCell("Podemos migrar para banco proprio se necessario", 4560, { fill: LIGHT_GRAY })] }),
            new TableRow({ children: [dataCell("Usuario nao entender", 2800), dataCell("Media", 2000, { color: ACCENT_ORANGE }), dataCell("Onboarding guiado + tutorial", 4560)] }),
          ],
        }),
        divider(),

        // ---- SECTION 8 ----
        sectionTitle("8", "GLOSSARIO RAPIDO"),
        emptyLine(),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 6860],
          rows: [
            new TableRow({ children: [headerCell("Termo", 2500), headerCell("O que significa", 6860)] }),
            ...([
              ["Deploy", "Publicar uma versao nova do app"],
              ["PWA", "App que funciona pelo navegador mas parece nativo"],
              ["Banco de dados", "Onde ficam guardados todos os dados"],
              ["API", "\"Ponte\" entre o app e o banco de dados"],
              ["Realtime", "Dados que atualizam na hora (como WhatsApp)"],
              ["RLS", "Regra que impede um usuario de ver dados de outro"],
              ["Git/GitHub", "Sistema que guarda todo o historico do codigo"],
              ["Vercel", "Empresa que hospeda nosso site"],
              ["Supabase", "Empresa que fornece nosso banco de dados"],
            ].map((row, i) => new TableRow({ children: [
              dataCell(row[0], 2500, { bold: true, fill: i % 2 === 0 ? LIGHT_GRAY : WHITE }),
              dataCell(row[1], 6860, { fill: i % 2 === 0 ? LIGHT_GRAY : WHITE }),
            ] }))),
          ],
        }),
        emptyLine(), emptyLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Documento atualizado em: Marco/2026  |  Versao: PWA com deploy automatico  |  URL: https://kindar.vercel.app", color: "999999", font: "Arial", size: 18, italics: true })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("GUIA-SOCIO.docx", buffer);
  console.log("GUIA-SOCIO.docx created successfully!");
});
