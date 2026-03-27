const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require("docx");
const fs = require("fs");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const teal = "0EA5A0";
const coral = "FF6B5B";
const darkBg = "1A3B3A";
const lightBg = "F0FAF9";
const headerBg = "E6F7F7";
const greenBg = "E8F5E9";
const redBg = "FFEBEE";
const yellowBg = "FFF8E1";
const grayBg = "F5F5F5";

function makeHeaderRow(cols, widths) {
  return new TableRow({
    children: cols.map((text, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: darkBg, type: ShadingType.CLEAR },
        margins: cellMargins,
        verticalAlign: "center",
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 20 })]
        })]
      })
    )
  });
}

function makeRow(cols, widths, opts = {}) {
  return new TableRow({
    children: cols.map((content, i) => {
      const isFirst = i === 0;
      const shade = opts.shading ? opts.shading[i] : (opts.altRow ? grayBg : "FFFFFF");
      const children = typeof content === "string"
        ? [new Paragraph({
            alignment: isFirst ? AlignmentType.LEFT : AlignmentType.CENTER,
            children: [new TextRun({
              text: content,
              bold: isFirst && !opts.noBoldFirst,
              font: "Arial",
              size: 19,
              color: opts.colors ? (opts.colors[i] || "333333") : "333333"
            })]
          })]
        : Array.isArray(content)
          ? content
          : [content];
      return new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: cellMargins,
        verticalAlign: "center",
        children
      });
    })
  });
}

function checkMark(has) {
  return has ? "\u2705" : "\u274C";
}

function statusCell(status) {
  // status: "both", "kindar", "osnossos", "none"
  const map = {
    "both": { text: "\u2705 Ambos", color: "2E7D32" },
    "kindar": { text: "\u2705 Kindar", color: teal },
    "osnossos": { text: "\u2705 Os Nossos", color: coral },
    "none": { text: "\u274C Nenhum", color: "999999" },
    "partial-kindar": { text: "\u26A0\uFE0F Parcial (Kindar)", color: "F57F17" },
    "partial-osnossos": { text: "\u26A0\uFE0F Parcial (Os Nossos)", color: "F57F17" },
  };
  const s = map[status] || map["none"];
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: s.text, font: "Arial", size: 19, color: s.color, bold: true })]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: darkBg },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: teal },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: teal, space: 4 } },
          children: [
            new TextRun({ text: "Analise Comparativa  ", font: "Arial", size: 16, color: "999999" }),
            new TextRun({ text: "Kindar", font: "Arial", size: 16, bold: true, color: teal }),
            new TextRun({ text: " vs ", font: "Arial", size: 16, color: "999999" }),
            new TextRun({ text: "Os Nossos", font: "Arial", size: 16, bold: true, color: coral }),
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD", space: 4 } },
          children: [
            new TextRun({ text: "Pagina ", font: "Arial", size: 16, color: "999999" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" }),
            new TextRun({ text: "  |  Documento confidencial  |  Marco 2026", font: "Arial", size: 16, color: "999999" }),
          ]
        })]
      })
    },
    children: [
      // ============ CAPA ============
      new Paragraph({ spacing: { before: 2400 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "ANALISE COMPARATIVA", font: "Arial", size: 44, bold: true, color: darkBg })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "Kindar", font: "Arial", size: 52, bold: true, color: teal }),
          new TextRun({ text: "  vs  ", font: "Arial", size: 36, color: "999999" }),
          new TextRun({ text: "Os Nossos", font: "Arial", size: 52, bold: true, color: coral }),
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: "Aplicativos de Coparentalidade para Guarda Compartilhada", font: "Arial", size: 24, color: "666666", italics: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 8 }, bottom: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 8 } },
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: "Marco 2026", font: "Arial", size: 28, color: darkBg, bold: true })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ INTRODUCAO ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Introducao")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Este documento apresenta uma analise comparativa detalhada entre dois aplicativos brasileiros de coparentalidade: Kindar e Os Nossos. Ambos foram desenvolvidos para ajudar pais separados a organizarem a rotina dos filhos de forma colaborativa.", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "A analise abrange funcionalidades, tecnologia, modelo de negocio, pontos fortes e oportunidades de cada plataforma.", size: 22 })]
      }),

      // ============ VISAO GERAL ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Visao Geral")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [2400, 3720, 3720],
        rows: [
          makeHeaderRow(["Aspecto", "Kindar", "Os Nossos"], [2400, 3720, 3720]),
          makeRow(["Fundacao", "2026", "2020"], [2400, 3720, 3720]),
          makeRow(["Origem", "Brasil", "Brasil (SP)"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Fundador(es)", "Henrique Pedro e Angelino Barata", "Dora Awad (mediadora familiar)"], [2400, 3720, 3720]),
          makeRow(["Plataforma", "Web App (PWA) - celular e desktop", "Apps nativos (iOS + Android)"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Tecnologia", "Next.js 16, React 19, Supabase, Vercel", "App nativo (proprietario)"], [2400, 3720, 3720]),
          makeRow(["URL", "kindar.vercel.app", "osnossos.com.br"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Idiomas", "Portugues (BR)", "PT, EN, ES, FR, DE (5 idiomas)"], [2400, 3720, 3720]),
          makeRow(["Modelo", "100% gratuito", "Freemium (Free + Plus pago)"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Modos de uso", "Compartilhado", "Compartilhado, Solo, Hibrido"], [2400, 3720, 3720]),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ COMPARACAO FUNCIONALIDADES ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Comparacao de Funcionalidades")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1 Calendario e Guarda")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Calendario de guarda com cores", checkMark(true), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Escala quinzenal (modelos prontos)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["4 modelos de escala (5-2, 3-4, etc.)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Troca de dias com aprovacao", checkMark(true), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Troca como divida (sem data retorno)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Saldo de trocas (debito/credito)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Planejador de fins de semana", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Feriados nacionais BR automaticos", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Sincronizacao iCal (Google/Apple)", checkMark(true), checkMark(true) + " (Plus)"], [4200, 2820, 2820]),
          makeRow(["Eventos recorrentes (7 tipos)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Visao semanal no Dashboard", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.2 Atividades e Compromissos")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Atividades recorrentes dos filhos", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Checklist inteligente por atividade", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Itens pre-preenchidos por categoria", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Push notification 24h antes", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Formulario unificado (9 categorias)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Eventos sociais (aniversarios, festas)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.3 Saude")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Dashboard de saude centralizado", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Registro de doencas com evolucao", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Controle de medicamentos e doses", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Agendamento de consultas", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Registro de alergias", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Carteira de vacinacao (SBP)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Curva de crescimento (WHO)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Diretorio de profissionais", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Exportacao de registros de saude", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.4 Financeiro")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Registro de despesas", checkMark(true), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Categorias de despesas", checkMark(true) + " (8 categorias)", checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Upload de comprovantes", checkMark(true), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Aprovacao/rejeicao de despesas", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Dashboard financeiro por mes", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Historico mensal com graficos", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Calculo automatico de balanco", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Divisao customizada (split ratio)", checkMark(true), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Acertos/pagamentos entre pais", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.5 Comunicacao")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Chat em tempo real", checkMark(true), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Mensagens imutaveis (legal)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Notificacoes automaticas no chat", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Conversas por assunto/filho", checkMark(false), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Exportacao do chat (PDF)", checkMark(false), checkMark(true) + " (Plus)"], [4200, 2820, 2820]),
          makeRow(["IA Mediadora (tom de mensagem)", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["IA SofIA (assistente externo)", checkMark(false), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Tomada de decisoes estruturada", checkMark(false), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.6 Outras Funcionalidades")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [4200, 2820, 2820],
        rows: [
          makeHeaderRow(["Funcionalidade", "Kindar", "Os Nossos"], [4200, 2820, 2820]),
          makeRow(["Check-in diario (rotina)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Documentos compartilhados", checkMark(true), checkMark(true) + " (Plus)"], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Acordos entre pais", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Temas sensiveis", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Informacoes escolares", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Perfil de criancas", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Convite por email/link", checkMark(true), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Multiplos grupos familiares", checkMark(true), checkMark(false)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Roles (pai, avo, cuidador, mediador)", checkMark(true), checkMark(false)], [4200, 2820, 2820]),
          makeRow(["Push notifications", checkMark(true), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Modo solo (uso individual)", checkMark(false), checkMark(true)], [4200, 2820, 2820]),
          makeRow(["Modo hibrido (notas privadas)", checkMark(false), checkMark(true)], [4200, 2820, 2820], { altRow: true }),
          makeRow(["Anotacoes privadas", checkMark(false), checkMark(true)], [4200, 2820, 2820]),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ RESUMO QUANTITATIVO ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Resumo Quantitativo")] }),

      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Contagem de funcionalidades por area:", size: 22 })]
      }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [3600, 2080, 2080, 2080],
        rows: [
          makeHeaderRow(["Area", "Kindar", "Os Nossos", "Vantagem"], [3600, 2080, 2080, 2080]),
          makeRow(["Calendario e Guarda", "11/12", "3/12", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar", bold: true, color: teal, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080]),
          makeRow(["Atividades", "6/6", "0/6", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar", bold: true, color: teal, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080], { altRow: true }),
          makeRow(["Saude", "9/9", "0/9", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar", bold: true, color: teal, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080]),
          makeRow(["Financeiro", "9/9", "3/9", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar", bold: true, color: teal, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080], { altRow: true }),
          makeRow(["Comunicacao", "4/8", "5/8", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Os Nossos", bold: true, color: coral, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080]),
          makeRow(["Outros", "10/14", "6/14", [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar", bold: true, color: teal, font: "Arial", size: 19 })] })]], [3600, 2080, 2080, 2080], { altRow: true }),
          // TOTAL
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, shading: { fill: headerBg, type: ShadingType.CLEAR }, margins: cellMargins,
                children: [new Paragraph({ children: [new TextRun({ text: "TOTAL", bold: true, font: "Arial", size: 20, color: darkBg })] })] }),
              new TableCell({ borders, width: { size: 2080, type: WidthType.DXA }, shading: { fill: greenBg, type: ShadingType.CLEAR }, margins: cellMargins,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "49/58 (84%)", bold: true, font: "Arial", size: 20, color: "2E7D32" })] })] }),
              new TableCell({ borders, width: { size: 2080, type: WidthType.DXA }, shading: { fill: redBg, type: ShadingType.CLEAR }, margins: cellMargins,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "17/58 (29%)", bold: true, font: "Arial", size: 20, color: "C62828" })] })] }),
              new TableCell({ borders, width: { size: 2080, type: WidthType.DXA }, shading: { fill: greenBg, type: ShadingType.CLEAR }, margins: cellMargins,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kindar (+32)", bold: true, font: "Arial", size: 20, color: teal })] })] }),
            ]
          }),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ MODELO DE NEGOCIO ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Modelo de Negocio")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [2400, 3720, 3720],
        rows: [
          makeHeaderRow(["Aspecto", "Kindar", "Os Nossos"], [2400, 3720, 3720]),
          makeRow(["Modelo", "100% gratuito", "Freemium"], [2400, 3720, 3720]),
          makeRow(["Plano gratuito", "Todas as funcionalidades", "Calendario, despesas, chat basico, decisoes"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Plano pago", "Nao possui", "Os Nossos Plus: documentos, export chat/calendario, sem anuncios"], [2400, 3720, 3720]),
          makeRow(["Anuncios", "Nao", "Sim (plano gratuito)"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["B2B", "Nao (por enquanto)", "Sim: licencas para escritorios de advocacia e tribunais"], [2400, 3720, 3720]),
        ]
      }),

      // ============ TECNOLOGIA ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Tecnologia e Plataforma")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [2400, 3720, 3720],
        rows: [
          makeHeaderRow(["Aspecto", "Kindar", "Os Nossos"], [2400, 3720, 3720]),
          makeRow(["Tipo", "Web App (PWA)", "Apps nativos (iOS/Android)"], [2400, 3720, 3720]),
          makeRow(["Frontend", "Next.js 16, React 19, Tailwind CSS 4", "Proprietario"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Backend", "Supabase (PostgreSQL, Auth, Realtime, RLS)", "Proprietario"], [2400, 3720, 3720]),
          makeRow(["Deploy", "Vercel (auto-deploy)", "App Stores"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Instalacao", "Sem instalacao (abre no navegador)", "Requer download na loja"], [2400, 3720, 3720]),
          makeRow(["Atualizacoes", "Instantaneas (server-side)", "Requer update na loja"], [2400, 3720, 3720], { altRow: true }),
          makeRow(["Seguranca", "RLS (Row Level Security), LGPD, chat imutavel", "Nao detalhado publicamente"], [2400, 3720, 3720]),
          makeRow(["Open Source", "Nao (codigo privado)", "Nao"], [2400, 3720, 3720], { altRow: true }),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ PONTOS FORTES ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("7. Pontos Fortes de Cada Plataforma")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.1 Pontos Fortes do Kindar")] }),

      ...[
        "Modulo de saude completo e unico no mercado (doencas, medicamentos, vacinas, consultas, alergias, crescimento, profissionais)",
        "Atividades recorrentes com checklist inteligente e lembretes push 24h antes",
        "4 modelos de escala de guarda prontos + geracao automatica em lote",
        "Sistema de troca como divida com saldo automatico entre pais",
        "Feriados nacionais BR automaticos (fixos + moveis: Carnaval, Pascoa, Corpus Christi)",
        "Dashboard financeiro completo com historico mensal, graficos e calculo de balanco",
        "Acertos financeiros (PIX, dinheiro) com confirmacao",
        "Notificacoes automaticas no chat para todas as acoes do app",
        "IA Mediadora que analisa tom das mensagens antes de enviar",
        "100% gratuito sem anuncios",
        "Sem necessidade de instalacao (funciona no navegador)",
        "Roles expandidos: pai, avo, cuidador, mediador, advogado",
        "Multiplos grupos familiares (familias recompostas)",
        "Conformidade legal: chat imutavel, LGPD, RLS"
      ].map(text => new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text, font: "Arial", size: 20 })]
      })),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.2 Pontos Fortes do Os Nossos")] }),

      ...[
        "Disponivel em 5 idiomas com expansao internacional",
        "6 anos de mercado (fundado em 2020), marca consolidada",
        "Apps nativos nas lojas (Apple App Store e Google Play)",
        "3 modos de uso: compartilhado, solo e hibrido",
        "Anotacoes privadas (modo hibrido)",
        "Tomada de decisoes estruturada (funcionalidade exclusiva)",
        "Conversas organizadas por assunto e por filho",
        "Exportacao de chat em PDF (validade legal)",
        "IA SofIA como assistente externo independente",
        "Modelo B2B para escritorios de advocacia e tribunais",
        "Fundadora especialista em mediacao familiar (15 anos de experiencia)"
      ].map(text => new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text, font: "Arial", size: 20 })]
      })),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ EXCLUSIVIDADES ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("8. Funcionalidades Exclusivas")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.1 Exclusivas do Kindar (32 funcionalidades)")] }),

      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Funcionalidades que o Os Nossos nao possui:", size: 22, italics: true, color: "666666" })]
      }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [3200, 6640],
        rows: [
          makeHeaderRow(["Area", "Funcionalidade Exclusiva"], [3200, 6640]),
          makeRow(["Calendario", "Escala quinzenal com 4 modelos prontos"], [3200, 6640]),
          makeRow(["Calendario", "Troca como divida (sem data retorno)"], [3200, 6640], { altRow: true }),
          makeRow(["Calendario", "Saldo de trocas (debito/credito)"], [3200, 6640]),
          makeRow(["Calendario", "Planejador de fins de semana"], [3200, 6640], { altRow: true }),
          makeRow(["Calendario", "Feriados BR automaticos (fixos + moveis)"], [3200, 6640]),
          makeRow(["Calendario", "Eventos recorrentes (7 tipos de recorrencia)"], [3200, 6640], { altRow: true }),
          makeRow(["Atividades", "Atividades recorrentes dos filhos"], [3200, 6640]),
          makeRow(["Atividades", "Checklist inteligente pre-preenchido"], [3200, 6640], { altRow: true }),
          makeRow(["Atividades", "Push notification 24h antes"], [3200, 6640]),
          makeRow(["Saude", "Dashboard de saude centralizado"], [3200, 6640], { altRow: true }),
          makeRow(["Saude", "Registro de doencas com evolucao"], [3200, 6640]),
          makeRow(["Saude", "Controle de medicamentos e doses"], [3200, 6640], { altRow: true }),
          makeRow(["Saude", "Agendamento de consultas"], [3200, 6640]),
          makeRow(["Saude", "Carteira de vacinacao (SBP)"], [3200, 6640], { altRow: true }),
          makeRow(["Saude", "Curva de crescimento (WHO)"], [3200, 6640]),
          makeRow(["Saude", "Diretorio de profissionais (CRM, WhatsApp)"], [3200, 6640], { altRow: true }),
          makeRow(["Financeiro", "Dashboard financeiro por mes"], [3200, 6640]),
          makeRow(["Financeiro", "Historico mensal com graficos"], [3200, 6640], { altRow: true }),
          makeRow(["Financeiro", "Calculo automatico de balanco"], [3200, 6640]),
          makeRow(["Financeiro", "Aprovacao/rejeicao de despesas"], [3200, 6640], { altRow: true }),
          makeRow(["Financeiro", "Acertos financeiros (PIX, dinheiro)"], [3200, 6640]),
          makeRow(["Comunicacao", "IA Mediadora de tom de mensagem"], [3200, 6640], { altRow: true }),
          makeRow(["Comunicacao", "Chat imutavel (conformidade legal)"], [3200, 6640]),
          makeRow(["Comunicacao", "Notificacoes automaticas no chat"], [3200, 6640], { altRow: true }),
          makeRow(["Outros", "Check-in diario (8 categorias)"], [3200, 6640]),
          makeRow(["Outros", "Acordos entre pais"], [3200, 6640], { altRow: true }),
          makeRow(["Outros", "Temas sensiveis"], [3200, 6640]),
          makeRow(["Outros", "Informacoes escolares"], [3200, 6640], { altRow: true }),
          makeRow(["Outros", "Roles expandidos (avo, cuidador, mediador, advogado)"], [3200, 6640]),
          makeRow(["Outros", "Multiplos grupos familiares"], [3200, 6640], { altRow: true }),
          makeRow(["Outros", "Perfil detalhado de criancas"], [3200, 6640]),
        ]
      }),

      new Paragraph({ spacing: { before: 300 }, children: [] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("8.2 Exclusivas do Os Nossos (6 funcionalidades)")] }),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [3200, 6640],
        rows: [
          makeHeaderRow(["Area", "Funcionalidade Exclusiva"], [3200, 6640]),
          makeRow(["Comunicacao", "Tomada de decisoes estruturada"], [3200, 6640]),
          makeRow(["Comunicacao", "Conversas por assunto/filho"], [3200, 6640], { altRow: true }),
          makeRow(["Comunicacao", "Exportacao do chat em PDF"], [3200, 6640]),
          makeRow(["Comunicacao", "IA SofIA (assistente externo)"], [3200, 6640], { altRow: true }),
          makeRow(["Outros", "Modo solo e hibrido"], [3200, 6640]),
          makeRow(["Outros", "Anotacoes privadas"], [3200, 6640], { altRow: true }),
        ]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ CONCLUSAO ============
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("9. Conclusao")] }),

      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "O Kindar se posiciona como a solucao mais completa em funcionalidades, com destaque para o modulo de saude (unico no mercado brasileiro de coparentalidade), o sistema avancado de calendario com escala e saldo de trocas, e o dashboard financeiro com historico. Oferece 84% das funcionalidades mapeadas, contra 29% do Os Nossos.", size: 22 })]
      }),

      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "O Os Nossos, por sua vez, traz vantagens em maturidade de mercado (6 anos), expansao internacional (5 idiomas), apps nativos nas lojas, e funcionalidades de comunicacao diferenciadas como tomada de decisoes estruturada e conversas organizadas por tema.", size: 22 })]
      }),

      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Oportunidades para o Kindar:", size: 22, bold: true })]
      }),

      ...[
        "Implementar tomada de decisoes estruturada (funcionalidade exclusiva do Os Nossos relevante para mediacao)",
        "Adicionar conversas por assunto/filho no chat",
        "Implementar exportacao de chat em PDF (valor legal)",
        "Considerar modo solo e hibrido com anotacoes privadas",
        "Publicar como PWA nas lojas (Play Store via TWA, App Store via Capacitor)",
        "Adicionar suporte a mais idiomas para expansao internacional",
      ].map(text => new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text, font: "Arial", size: 20 })]
      })),

      new Paragraph({ spacing: { before: 400 }, children: [] }),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 8 } },
        spacing: { before: 400 },
        children: [new TextRun({ text: "Documento gerado em Marco 2026 | Kindar", font: "Arial", size: 18, color: "999999", italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("Comparativo-Kindar-vs-OsNossos-v2.docx", buffer);
  console.log("Documento gerado: Comparativo-Kindar-vs-OsNossos.docx");
  console.log("Tamanho:", (buffer.length / 1024).toFixed(1), "KB");
});
