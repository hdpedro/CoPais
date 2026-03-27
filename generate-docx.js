const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, ExternalHyperlink
} = require("docx");

const PRIMARY = "0EA5A0";
const SECONDARY = "FF6B5B";
const ACCENT = "FFB627";
const DARK = "1A1A2E";
const MUTED = "6B7280";
const LIGHT_BG = "F0FDFA";
const WHITE = "FFFFFF";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

// Scenes data
const scenes = [
  {
    num: 1, user: "Bruno (Pai)", title: "Bruno faz o cadastro",
    action: "Bruno acessa o Kindar pela primeira vez, cria sua conta com email e senha, e configura o grupo familiar. Ele digita o nome \"Familia Kleber\", adiciona Kleber Silva Oliveira como crianca com data de nascimento 15/03/2019, e clica em \"Criar grupo e continuar\".",
    screen: "Tela de onboarding com formulario limpo: campo \"Nome da familia\" preenchido com \"Familia Kleber\", secao \"Adicionar primeira crianca\" com nome completo e data de nascimento preenchidos. Botao teal \"Criar grupo e continuar\" no final. Design minimalista com cards brancos sobre fundo claro.",
    value: "Onboarding rapido (menos de 30 segundos) reduz abandono. A criacao do grupo e da crianca no mesmo fluxo elimina etapas extras."
  },
  {
    num: 2, user: "Bruno (Pai)", title: "Bruno convida Martina via WhatsApp",
    action: "Apos criar o grupo, Bruno e direcionado para a tela de convite. O sistema gera um link unico de convite com validade de 7 dias. Bruno toca em \"Enviar por WhatsApp\" e uma mensagem pre-formatada e aberta no WhatsApp com o link de convite.",
    screen: "Card \"Convite gerado!\" com icone de link, caixa mostrando a URL do convite, botao verde \"Enviar por WhatsApp\" (destaque principal), botao \"Copiar link\" como secundario. Abaixo, instrucoes passo a passo de como o convite funciona. Badge laranja: \"O convite expira em 7 dias.\"",
    value: "O WhatsApp e o canal #1 de comunicacao no Brasil. Usar convite por WhatsApp maximiza a taxa de conversao do segundo usuario (metrica critica para apps colaborativos)."
  },
  {
    num: 3, user: "Martina (Mae)", title: "Martina aceita o convite e entra no grupo",
    action: "Martina recebe a mensagem no WhatsApp, clica no link e e levada para a tela de cadastro do Kindar. O sistema reconhece o convite e mostra que Bruno a convidou para o grupo \"Familia Kleber\". Martina preenche nome, email e senha, e ao criar a conta, entra automaticamente no grupo.",
    screen: "Logo Kindar no topo, mensagem \"Bruno convidou voce para Familia Kleber\" em destaque, informacao da crianca (Kleber Silva Oliveira), formulario de cadastro com campos preenchidos, botao \"Criar conta e entrar no grupo\". Badge verde \"Acesso automatico ao grupo\".",
    value: "Zero friccao no segundo cadastro: o link ja carrega o contexto do grupo. Nao e necessario buscar ou digitar codigo. Conversao do segundo pai e a metrica mais importante do app."
  },
  {
    num: 4, user: "Bruno (Pai)", title: "Bruno ve o dashboard com a custodia de hoje",
    action: "Bruno abre o app e ve o dashboard principal. O card superior mostra que Kleber esta com ele hoje, com indicador visual teal. Abaixo, o saldo financeiro do mes (equilibrado), acoes rapidas (Nova Despesa, Calendario, Chat) e informacoes da crianca.",
    screen: "Card \"Hoje\" com borda teal a esquerda: \"Kleber esta com voce\" e avatar circular teal com \"V\". Card \"Saldo do mes\" mostrando R$0,00 com tag \"Equilibrado\". Grid de acoes rapidas com icones coloridos. Card da crianca com nome e idade (7 anos).",
    value: "A informacao mais importante (onde esta a crianca) aparece no topo. O usuario obtem a resposta essencial em menos de 1 segundo ao abrir o app."
  },
  {
    num: 5, user: "Martina (Mae)", title: "Martina ve o dashboard da perspectiva dela",
    action: "Martina abre o app e ve o mesmo dashboard, mas da perspectiva dela. O card mostra que Kleber esta com Bruno, com o avatar de Bruno. O sistema adapta automaticamente a linguagem e as cores conforme o usuario logado.",
    screen: "Card \"Hoje\" com borda coral: \"Kleber esta com Bruno\" e avatar teal com \"B\". Mesma estrutura do dashboard de Bruno mas com perspectiva invertida. Card \"Nenhuma despesa este mes\" com CTA para registrar a primeira.",
    value: "Perspectiva personalizada por usuario gera confianca. Cada pai ve a informacao relevante para ele, sem confusao sobre de quem e a responsabilidade."
  },
  {
    num: 6, user: "Bruno (Pai)", title: "Bruno cria a escala de guarda no calendario",
    action: "Bruno acessa Calendario > Escala de Guarda. Escolhe o modelo \"Semanas alternadas\" (1 semana cada pai). O sistema preenche automaticamente o grid quinzenal: Semana 1 toda teal (Bruno), Semana 2 toda coral (Martina). Configura inicio e periodo de 6 meses, e gera ~182 eventos automaticamente.",
    screen: "Secao \"Modelos prontos\" com 4 opcoes (Semanas alternadas selecionado). Grid quinzenal: 7 dias teal com \"B\" na Semana 1, 7 dias coral com \"M\" na Semana 2. Legenda de cores. Preview: \"182 eventos nos proximos 6 meses\". Botao \"Gerar Escala de Guarda\".",
    value: "Geracao automatica de escala em 3 toques elimina horas de planejamento manual. Os modelos prontos cobrem os padroes mais comuns de guarda compartilhada no Brasil."
  },
  {
    num: 7, user: "Bruno e Martina", title: "Chat entre os pais sobre consulta medica",
    action: "Bruno envia mensagem perguntando sobre a consulta do dentista na quinta. Martina confirma o horario (15h, Dra. Ana Paula) e se oferece para levar Kleber. Bruno agradece e pede que ela registre a despesa depois. Comunicacao objetiva e registrada.",
    screen: "Tela de chat com header \"Chat do Grupo - 2 membros\". Bolhas de mensagem: teal para Bruno (alinhadas a direita), brancas para Martina (alinhadas a esquerda, com nome em destaque). Horarios em cada mensagem. Campo de texto na parte inferior com botao de envio.",
    value: "Chat integrado ao app mantem a comunicacao sobre a crianca separada de conversas pessoais do WhatsApp. Historico rastreavel e acessivel a ambos os pais."
  },
  {
    num: 8, user: "Martina (Mae)", title: "Martina registra despesa da consulta pediatra",
    action: "Apos a consulta, Martina acessa Nova Despesa e registra: descricao \"Consulta pediatra - Dr. Ana Paula\", valor R$350,00, categoria Saude, vinculada a Kleber, data 20/03/2026. A despesa e automaticamente visivel para Bruno e dividida 50/50.",
    screen: "Formulario \"Nova Despesa\" com todos os campos preenchidos: descricao, valor (350,00), categoria (Saude com icone de hospital), crianca (Kleber), data. Botao teal \"Registrar Despesa\" no final. Campos com borda teal indicando preenchimento.",
    value: "Registro rapido de despesas com categorias pre-definidas. Divisao automatica 50/50 elimina discussoes sobre quanto cada um deve. Vinculacao a crianca permite relatorios por filho."
  },
  {
    num: 9, user: "Bruno (Pai)", title: "Bruno ve o saldo atualizado no dashboard",
    action: "Bruno abre o dashboard e imediatamente ve que o saldo mudou. O card financeiro mostra R$175,00 com a tag \"Martina deve para voce\". Na area detalhada, ve que Martina pagou R$350 na consulta e a divisao 50/50 gera um saldo de R$175 que Bruno deve a Martina.",
    screen: "Dashboard atualizado: card de custodia no topo, card financeiro mostrando \"R$175,00\" com tag verde \"Martina deve para voce\". Card de balanco com icone de balanca: \"Martina deve R$175,00 para Bruno - Baseado na divisao 50/50\". Lista de despesas com a consulta pediatra e status \"Pendente\".",
    value: "Transparencia financeira total em tempo real. Ambos os pais veem o mesmo saldo, eliminando disputas sobre quem pagou o que. O sistema e a fonte unica de verdade."
  },
  {
    num: 10, user: "Martina (Mae)", title: "Martina faz o check-in diario sobre Kleber",
    action: "A noite, Martina acessa o Check-in Diario. Seleciona a categoria \"Alimentacao\", usa o template rapido \"Comeu bem no almoco\", e adiciona detalhes: \"Almocou arroz, feijao e frango. Comeu tudo e repetiu a salada!\". O check-in fica visivel para Bruno no dashboard dele.",
    screen: "Tela de check-in com pills de categoria (Alimentacao selecionada em teal). Templates rapidos abaixo com opcoes pre-definidas. Campo de titulo preenchido, area de texto com detalhes. Botao verde \"Registrado!\". Abaixo, card mostrando check-ins de hoje.",
    value: "Check-ins diarios manteem ambos os pais informados sobre a rotina da crianca mesmo quando nao estao presentes. Templates rapidos agilizam o registro e reduzem a barreira de uso."
  }
];

// Summary table data
const summaryTable = [
  ["Dashboard de Custodia", "Saber onde a crianca esta em 1 segundo", "DAU (usuarios ativos diarios), retencao D1"],
  ["Convite por WhatsApp", "Conectar o segundo pai sem friccao", "Taxa de conversao do 2o usuario"],
  ["Calendario de Guarda", "Escala automatica em 3 toques", "Tempo ate primeira escala criada"],
  ["Chat Integrado", "Comunicacao focada e rastreavel", "Mensagens por semana por grupo"],
  ["Registro de Despesas", "Controle financeiro sem planilhas", "Despesas registradas por mes"],
  ["Saldo 50/50", "Transparencia financeira total", "Reducao de disputas financeiras"],
  ["Check-in Diario", "Ambos os pais informados sobre o dia a dia", "Check-ins por semana"],
  ["Acoes Rapidas", "Acesso direto as funcoes mais usadas", "CTR das acoes rapidas"],
  ["Perfil da Crianca", "Informacoes centralizadas sobre o filho", "Completude do perfil"],
  ["Onboarding Guiado", "Configuracao em menos de 1 minuto", "Taxa de conclusao do onboarding"]
];

async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, color: DARK }
        }
      },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: PRIMARY },
          paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 }
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: DARK },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 }
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: SECONDARY },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 }
        },
      ]
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        },
        {
          reference: "numbers",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        },
      ]
    },
    sections: [
      // ===== COVER / TITLE SECTION =====
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "Kindar", font: "Arial", size: 18, bold: true, color: PRIMARY }),
                  new TextRun({ text: " | Demonstracao de Uso Real", font: "Arial", size: 18, color: MUTED }),
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Pagina ", size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
                ]
              })
            ]
          })
        },
        children: [
          // Spacer
          new Paragraph({ spacing: { before: 2400 }, children: [] }),

          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "2", font: "Arial", size: 72, bold: true, color: ACCENT }),
              new TextRun({ text: "Lares", font: "Arial", size: 72, bold: true, color: PRIMARY }),
            ]
          }),

          // Subtitle
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({ text: "Demonstracao de Uso Real", font: "Arial", size: 36, color: DARK }),
            ]
          }),

          // Tagline
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [
              new TextRun({ text: "Organize a rotina do seu filho com mais clareza e tranquilidade.", font: "Arial", size: 22, italics: true, color: MUTED }),
            ]
          }),

          // Divider line
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PRIMARY, space: 1 } },
            spacing: { after: 400 },
            children: []
          }),

          // Info block
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Usuarios de demonstracao:", font: "Arial", size: 20, bold: true, color: DARK }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Bruno (pai) ", size: 20, color: PRIMARY, bold: true }),
              new TextRun({ text: "& ", size: 20, color: MUTED }),
              new TextRun({ text: "Martina (mae)", size: 20, color: SECONDARY, bold: true }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Crianca: Kleber Silva Oliveira", size: 20, color: DARK }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Grupo: Familia Kleber", size: 20, color: DARK }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({ text: "App: ", size: 20, color: MUTED }),
              new ExternalHyperlink({
                children: [new TextRun({ text: "https://kindar.vercel.app", style: "Hyperlink", size: 20 })],
                link: "https://kindar.vercel.app",
              }),
            ]
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 800 },
            children: [
              new TextRun({ text: "Marco 2026", size: 20, color: MUTED }),
            ]
          }),

          // Page break
          new Paragraph({ children: [new PageBreak()] }),

          // ===== TABLE OF CONTENTS HEADER =====
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "Sumario" })]
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Este documento apresenta 10 cenas demonstrando o fluxo real de uso do app Kindar, desde o cadastro ate o check-in diario.", size: 22, color: MUTED }),
            ]
          }),

          // Manual TOC entries
          ...scenes.map((s, i) =>
            new Paragraph({
              numbering: { reference: "numbers", level: 0 },
              spacing: { after: 60 },
              children: [
                new TextRun({ text: `Cena ${s.num}: ${s.title}`, size: 22, color: DARK }),
                new TextRun({ text: ` (${s.user})`, size: 20, color: MUTED }),
              ]
            })
          ),

          new Paragraph({
            numbering: { reference: "numbers", level: 0 },
            spacing: { after: 60 },
            children: [new TextRun({ text: "Tabela Resumo: Funcionalidades e Metricas", size: 22, color: DARK })]
          }),
          new Paragraph({
            numbering: { reference: "numbers", level: 0 },
            spacing: { after: 60 },
            children: [new TextRun({ text: "Roteiro de Video Promocional (60 segundos)", size: 22, color: DARK })]
          }),

          new Paragraph({ children: [new PageBreak()] }),

          // ===== SCENES =====
          ...scenes.flatMap((s, i) => {
            const isCoralUser = s.user.includes("Martina");
            const userColor = isCoralUser ? SECONDARY : PRIMARY;

            return [
              // Scene heading
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [
                  new TextRun({ text: `Cena ${s.num}: `, color: userColor }),
                  new TextRun({ text: s.title, color: userColor }),
                ]
              }),

              // User badge
              new Paragraph({
                spacing: { after: 200 },
                children: [
                  new TextRun({ text: `Usuario: ${s.user}`, size: 20, bold: true, color: userColor }),
                ]
              }),

              // Action section
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun({ text: "Acao do Usuario", color: PRIMARY })]
              }),
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: s.action, size: 22, color: DARK })]
              }),

              // Screen section
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun({ text: "O que a Tela Mostra", color: PRIMARY })]
              }),
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: s.screen, size: 22, color: DARK })]
              }),

              // Business value section
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun({ text: "Valor de Negocio", color: PRIMARY })]
              }),

              // Value in a highlighted box (table with background)
              new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [9360],
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: { top: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY }, bottom: noBorder, left: { style: BorderStyle.SINGLE, size: 8, color: PRIMARY }, right: noBorder },
                        width: { size: 9360, type: WidthType.DXA },
                        shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                        margins: { top: 100, bottom: 100, left: 200, right: 200 },
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: s.value, size: 22, color: DARK, italics: true })]
                          })
                        ]
                      })
                    ]
                  })
                ]
              }),

              // Separator
              new Paragraph({
                spacing: { before: 300, after: 100 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB", space: 1 } },
                children: []
              }),

              // Page break after every 2 scenes (except last)
              ...(i < scenes.length - 1 && i % 2 === 1 ? [new Paragraph({ children: [new PageBreak()] })] : []),
            ];
          }),

          // ===== SUMMARY TABLE =====
          new Paragraph({ children: [new PageBreak()] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "Tabela Resumo: Funcionalidades e Metricas" })]
          }),

          new Paragraph({
            spacing: { after: 300 },
            children: [
              new TextRun({ text: "Visao geral das funcionalidades demonstradas, seus beneficios para o usuario e as metricas de negocio associadas.", size: 22, color: MUTED }),
            ]
          }),

          // Table
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2800, 3280, 3280],
            rows: [
              // Header row
              new TableRow({
                tableHeader: true,
                children: [
                  new TableCell({
                    borders,
                    width: { size: 2800, type: WidthType.DXA },
                    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: "Funcionalidade", bold: true, color: WHITE, size: 20 })] })]
                  }),
                  new TableCell({
                    borders,
                    width: { size: 3280, type: WidthType.DXA },
                    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: "Beneficio para o Usuario", bold: true, color: WHITE, size: 20 })] })]
                  }),
                  new TableCell({
                    borders,
                    width: { size: 3280, type: WidthType.DXA },
                    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: "Metrica de Negocio", bold: true, color: WHITE, size: 20 })] })]
                  }),
                ]
              }),
              // Data rows
              ...summaryTable.map((row, idx) =>
                new TableRow({
                  children: row.map((cell, ci) =>
                    new TableCell({
                      borders,
                      width: { size: ci === 0 ? 2800 : 3280, type: WidthType.DXA },
                      shading: { fill: idx % 2 === 0 ? "F9FAFB" : WHITE, type: ShadingType.CLEAR },
                      margins: cellMargins,
                      children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, color: DARK, bold: ci === 0 })] })]
                    })
                  )
                })
              )
            ]
          }),

          // ===== ROTEIRO / VIDEO SCRIPT =====
          new Paragraph({ children: [new PageBreak()] }),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "Roteiro de Video Promocional" })]
          }),

          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Duracao: 60 segundos | Formato: Vertical 9:16 (Reels/TikTok/Stories)", size: 22, bold: true, color: MUTED }),
            ]
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Tom: Acolhedor, moderno, humano. NAO corporativo/frio.", size: 22, color: MUTED }),
            ]
          }),
          new Paragraph({
            spacing: { after: 300 },
            children: [
              new TextRun({ text: "Publico-alvo: Pais separados/divorciados no Brasil.", size: 22, color: MUTED }),
            ]
          }),

          // Beat 1
          ...createBeat(1, "Abertura emocional", "0s - 8s",
            "Tela dividida ao meio. Lado esquerdo: um pai sozinho na cozinha preparando o cafe da manha. Lado direito: uma mae sozinha em outra cozinha. Ambos olham o celular. Luz quente, matinal. Transicao suave para as duas telas de celular mostrando o logo do Kindar.",
            "\"Dois lares. Uma so preocupacao: o bem-estar do seu filho.\"",
            "Logo Kindar com tagline aparece centralizado sobre fundo teal gradiente."
          ),

          // Beat 2
          ...createBeat(2, "Problema", "8s - 16s",
            "Montagem rapida: mensagens de WhatsApp confusas, post-its na geladeira, tela de planilha baguncada, celular com 47 notificacoes. Tudo em tons frios, desfocado. Camera aproxima no rosto cansado do pai.",
            "\"Mensagens perdidas, contas sem controle, escala que ninguem lembra... a coparentalidade nao precisa ser assim.\"",
            "Flash de tela de WhatsApp desfocada com muitas mensagens nao lidas."
          ),

          // Beat 3
          ...createBeat(3, "Solucao - Dashboard", "16s - 26s",
            "Cut para tela limpa do celular. O pai abre o app Kindar. Camera faz zoom na tela mostrando o dashboard. Card teal \"Kleber esta com voce\" aparece com animacao suave. O pai sorri.",
            "\"Com o Kindar, voce sabe exatamente onde seu filho esta, quem e o responsavel hoje, e como foi o dia dele.\"",
            "Dashboard do app com card de custodia, saldo financeiro e acoes rapidas. Cores vibrantes: teal e coral."
          ),

          // Beat 4
          ...createBeat(4, "Funcionalidades em acao", "26s - 42s",
            "Sequencia rapida de telas do app, cada uma com 2-3 segundos. Tela dividida mostrando os dois pais usando o app simultaneamente. A mae registra despesa, o pai ve o saldo atualizar. O pai manda mensagem no chat, a mae responde.",
            "\"Calendario de guarda que se monta sozinho. Despesas divididas automaticamente. Chat focado so no que importa. Check-in diario pra ninguem ficar no escuro.\"",
            "Sequencia: (1) Calendario com dias teal/coral, (2) Nova despesa R$350, (3) Chat entre pais, (4) Check-in com pills de categoria."
          ),

          // Beat 5
          ...createBeat(5, "Resultado emocional", "42s - 52s",
            "Cena aquecida: crianca feliz correndo entre os dois pais no parque. Os pais acenam um para o outro com respeito. Sem tensao. Close no celular de cada pai mostrando o dashboard com \"Tudo em dia\". Luz dourada de fim de tarde.",
            "\"Sem brigas. Sem confusao. So clareza. Para que a unica coisa que importe... seja ele.\"",
            "Dashboard com check verde em todas as areas. Imagem desfoca suavemente para a crianca sorrindo."
          ),

          // Beat 6
          ...createBeat(6, "CTA - Chamada final", "52s - 60s",
            "Fundo teal gradiente. Logo Kindar grande no centro com efeito de brilho sutil. Tagline aparece com animacao de typing. QR Code ou botao \"Comece agora\" pulsa suavemente.",
            "\"Kindar. Dois lares, um so app. Baixe gratis e comece a organizar hoje.\"",
            "Logo Kindar + \"2 lares, 1 so app.\" + URL kindar.vercel.app + \"Comece gratis\""
          ),

          // Final slogan
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 1 } },
            children: []
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
            children: [
              new TextRun({ text: "\"2 lares, 1 so app.\"", size: 36, bold: true, color: ACCENT, font: "Arial" }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Sem brigas. Sem confusao. So clareza.", size: 24, italics: true, color: MUTED }),
            ]
          }),
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, "documentacao-kindar-demo.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("DOCX created successfully at:", outPath);
}

function createBeat(num, title, time, visual, narration, screen) {
  return [
    // Beat header
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300 },
      children: [
        new TextRun({ text: `Beat ${num}: ${title}`, color: DARK }),
      ]
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: `Tempo: ${time}`, size: 20, bold: true, color: ACCENT }),
      ]
    }),

    // Visual
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "[VISUAL] ", size: 20, bold: true, color: PRIMARY }),
        new TextRun({ text: visual, size: 20, color: DARK }),
      ]
    }),

    // Narration
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "[NARRACAO] ", size: 20, bold: true, color: ACCENT }),
        new TextRun({ text: narration, size: 20, italics: true, color: DARK }),
      ]
    }),

    // Screen
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "[TELA] ", size: 20, bold: true, color: SECONDARY }),
        new TextRun({ text: screen, size: 20, color: DARK }),
      ]
    }),
  ];
}

main().catch(err => { console.error(err); process.exit(1); });
