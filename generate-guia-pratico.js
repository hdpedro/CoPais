const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require("docx");
const fs = require("fs");

const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const teal = "0EA5A0";
const coral = "FF6B5B";
const dark = "1A3B3A";
const lightBg = "F0FAF9";
const headerBg = "E6F7F7";
const grayBg = "F5F5F5";

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after || 120 },
    children: [new TextRun({ text, font: "Arial", size: opts.size || 21, color: opts.color || "333333", bold: opts.bold, italics: opts.italics })]
  });
}
function bullet(text, bold_prefix) {
  const children = [];
  if (bold_prefix) {
    children.push(new TextRun({ text: bold_prefix + " ", font: "Arial", size: 20, bold: true }));
    children.push(new TextRun({ text, font: "Arial", size: 20 }));
  } else {
    children.push(new TextRun({ text, font: "Arial", size: 20 }));
  }
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 50 },
    children
  });
}
function tipBox(text) {
  return new Paragraph({
    border: { left: { style: BorderStyle.SINGLE, size: 8, color: teal, space: 8 } },
    spacing: { before: 120, after: 120 },
    indent: { left: 200 },
    children: [
      new TextRun({ text: "Dica: ", font: "Arial", size: 20, bold: true, color: teal }),
      new TextRun({ text, font: "Arial", size: 20, color: "555555", italics: true })
    ]
  });
}
function sectionSpacer() {
  return new Paragraph({ spacing: { before: 80 }, children: [] });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, font: "Arial", color: dark },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: teal, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: teal },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "444444" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers2", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers3", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers4", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers5", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers6", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
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
          alignment: AlignmentType.LEFT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: teal, space: 4 } },
          children: [
            new TextRun({ text: "Kindar", font: "Arial", size: 18, bold: true, color: teal }),
            new TextRun({ text: "  |  Guia Pratico de Funcionalidades", font: "Arial", size: 16, color: "999999" }),
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
            new TextRun({ text: "Kindar — Guia Pratico  |  Pagina ", font: "Arial", size: 15, color: "AAAAAA" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 15, color: "AAAAAA" }),
          ]
        })]
      })
    },
    children: [
      // ============ CAPA ============
      new Paragraph({ spacing: { before: 2000 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Kindar", font: "Arial", size: 64, bold: true, color: teal })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "Guia Pratico de Funcionalidades", font: "Arial", size: 32, color: dark })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Tudo que voce precisa saber para usar o app de coparentalidade", font: "Arial", size: 22, color: "666666", italics: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 8 }, bottom: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 8 } },
        children: [
          new TextRun({ text: "Versao 1.0  |  Marco 2026", font: "Arial", size: 24, color: dark }),
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [new TextRun({ text: "https://kindar.vercel.app", font: "Arial", size: 22, color: teal, bold: true })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ SUMARIO ============
      h1("Sumario"),
      ...[
        "1. Primeiro Acesso",
        "2. Dashboard (Tela Inicial)",
        "3. Agenda (Calendario)",
        "4. Escala de Guarda",
        "5. Troca de Dias",
        "6. Atividades e Compromissos",
        "7. Check-in Diario",
        "8. Chat",
        "9. Saude",
        "10. Financeiro e Despesas",
        "11. Documentos",
        "12. Familia",
        "13. Criancas",
        "14. Acordos",
        "15. Temas Sensiveis",
        "16. Escola",
        "17. Perfil",
        "18. Notificacoes",
        "19. Sincronizacao com Celular",
      ].map(text => p(text, { size: 22 })),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 1. PRIMEIRO ACESSO ============
      h1("1. Primeiro Acesso"),
      p("O Kindar funciona no navegador do celular ou computador — nao precisa instalar nada."),
      sectionSpacer(),
      h3("Como criar sua conta"),
      ...["Acesse kindar.vercel.app", "Clique em Criar Conta", "Preencha nome, email e senha", "Confirme o email (verifique a caixa de spam)", "Faca login e crie seu grupo familiar"].map((text, i) =>
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      sectionSpacer(),
      h3("Como convidar o outro responsavel"),
      ...["No menu, va em Familia ou Convidar", "Insira o email do outro pai/mae", "Um link de convite sera enviado por email", "A pessoa clica no link, cria a conta e ja entra no grupo"].map((text, i) =>
        new Paragraph({ numbering: { reference: "numbers2", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      tipBox("Voce pode convidar tambem avos, cuidadores, mediadores e advogados com papeis diferentes."),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 2. DASHBOARD ============
      h1("2. Dashboard (Tela Inicial)"),
      p("Ao abrir o app, voce ve o Dashboard com um resumo de tudo que importa hoje:"),
      bullet("Quem esta com a crianca hoje e quantos dias seguidos (streak)"),
      bullet("Visao da semana com cores por responsavel + feriados em vermelho"),
      bullet("Alertas de saude: medicamentos ativos, alergias criticas, consultas proximas"),
      bullet("Atividades de hoje e amanha com horario e checklist"),
      bullet("Eventos sociais (aniversarios, festas)"),
      bullet("Proximos compromissos na agenda (guarda especial, atividades, eventos)"),
      bullet("Resumo financeiro do mes (quem gastou quanto, saldo)"),
      bullet("Despesas pendentes de aprovacao"),
      bullet("Check-ins recentes dos ultimos dias"),
      bullet("Acoes rapidas: Agenda, Despesas, Check-in, Chat, Saude, Documentos"),
      tipBox("O Dashboard e a melhor forma de comecar o dia — tudo num olhar."),

      // ============ 3. AGENDA ============
      h1("3. Agenda (Calendario)"),
      p("A Agenda unifica tres conceitos: calendario de guarda, atividades recorrentes e eventos sociais."),
      sectionSpacer(),
      h3("Grade Mensal"),
      bullet("Grade com 7 colunas (Dom a Sab) mostrando o mes inteiro"),
      bullet("Dias coloridos pela cor do responsavel: teal (1o pai) e coral (2o pai)"),
      bullet("Pontos laranjas nos dias com atividades ou eventos"),
      bullet("Feriados com destaque em vermelho"),
      bullet("Navegue entre meses com as setas"),
      sectionSpacer(),
      h3("Ao clicar num dia"),
      bullet("Abre um painel mostrando quem tem a guarda naquele dia"),
      bullet("Lista atividades do dia com horario e local"),
      bullet("Lista eventos sociais do dia"),
      bullet("Botao para solicitar troca (se for dia do outro responsavel)"),
      sectionSpacer(),
      h3("Planejador de Fins de Semana"),
      bullet("Scroll horizontal mostrando os proximos 8 fins de semana"),
      bullet("Badges de status: Livre (verde), Parcial (amarelo), Com voce (azul)"),
      bullet("Facilita planejar viagens e passeios"),
      sectionSpacer(),
      h3("Saldo de Trocas"),
      bullet("Card mostrando debito/credito de dias entre os pais"),
      bullet("Se um pai esta com mais dias que o previsto, o card mostra o saldo"),
      bullet("Quando equilibrado, mostra Equilibrado com check verde"),
      tipBox("O saldo e calculado automaticamente comparando a escala original com os dias reais (incluindo trocas)."),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 4. ESCALA DE GUARDA ============
      h1("4. Escala de Guarda"),
      p("Crie a escala de guarda em minutos com modelos prontos ou personalize dia a dia."),
      sectionSpacer(),
      h3("Como criar a escala"),
      ...["Va em Agenda e clique em Escala", "Escolha um dos 4 modelos prontos ou preencha manualmente", "Toque nos dias para alternar entre pai A, pai B ou vazio", "Selecione a data de inicio", "Escolha a duracao: 3, 6 ou 12 meses", "Clique Gerar Escala — os eventos sao criados automaticamente"].map(text =>
        new Paragraph({ numbering: { reference: "numbers3", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      sectionSpacer(),
      h3("Modelos Disponiveis"),
      bullet("Semanas alternadas: 1 semana com cada pai", "Modelo 1 —"),
      bullet("5-2 / 2-5: semana com um pai, fim de semana com o outro, alternando", "Modelo 2 —"),
      bullet("3-4 / 4-3: Seg-Qua com um, Qui-Dom com o outro, alternando", "Modelo 3 —"),
      bullet("2-3 + FDS alternado: Seg-Qua / Qui-Sex + fins de semana alternados", "Modelo 4 —"),
      tipBox("Apos gerar a escala, voce pode ajustar dias individuais criando eventos de guarda avulsos."),

      // ============ 5. TROCA DE DIAS ============
      h1("5. Troca de Dias"),
      p("Precisa trocar um dia de guarda? O app gerencia todo o processo."),
      sectionSpacer(),
      h3("Como solicitar uma troca"),
      ...["Na Agenda, clique no dia que voce quer (que e do outro responsavel)", "Escolha Solicitar Troca", "Opcionalmente, selecione um dia que voce oferece em troca", "Escreva o motivo e envie"].map(text =>
        new Paragraph({ numbering: { reference: "numbers4", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      sectionSpacer(),
      h3("Troca como Divida"),
      p("Se voce NAO preencher a data de retorno, a troca fica como divida de 1 dia para voce. O app mostra um aviso amarelo antes de confirmar. O saldo de trocas atualiza automaticamente."),
      sectionSpacer(),
      h3("Aprovar ou Rejeitar"),
      p("O outro responsavel recebe uma notificacao push e pode Aprovar ou Rejeitar a troca. Ao aprovar, os eventos de guarda sao criados automaticamente no calendario."),
      tipBox("Todas as trocas geram mensagem automatica no chat do grupo para manter o historico."),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 6. ATIVIDADES ============
      h1("6. Atividades e Compromissos"),
      p("Cadastre as atividades recorrentes dos filhos e nunca mais esqueca o que levar."),
      sectionSpacer(),
      h3("Criando uma atividade"),
      ...["Na Agenda, clique em + Novo", "Escolha a categoria: Esporte, Saude, Escola, Arte, Musica, Terapia, Evento, Guarda ou Outro", "Preencha nome, filho(s), recorrencia, dias da semana, horario e local", "O checklist ja vem pre-preenchido com itens da categoria (ex: Esporte = uniforme, chuteira, meia, garrafa)", "Adicione ou remova itens do checklist", "Salve a atividade"].map(text =>
        new Paragraph({ numbering: { reference: "numbers5", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      sectionSpacer(),
      h3("Recorrencia"),
      bullet("Nunca (evento unico)"),
      bullet("Todos os dias"),
      bullet("Toda semana"),
      bullet("A cada 2 semanas"),
      bullet("Todo mes"),
      bullet("Todo ano"),
      bullet("Personalizar (ex: a cada 3 dias)"),
      sectionSpacer(),
      h3("Checklist e Lembretes"),
      p("No dia da atividade, o checklist aparece no Dashboard e no detalhe do dia. Voce pode marcar itens como concluidos. O app envia push notification 24h antes com a lista de materiais."),
      tipBox("Use a opcao Todos os filhos para atividades que envolvem todas as criancas (ex: consulta no dentista familiar)."),

      // ============ 7. CHECK-IN ============
      h1("7. Check-in Diario"),
      p("Registros rapidos sobre o dia a dia da crianca, compartilhados com o grupo."),
      sectionSpacer(),
      h3("8 Categorias"),
      bullet("Tempo de Tela, Alimentacao, Sono, Humor, Saude, Atividade, Escola, Outro"),
      sectionSpacer(),
      h3("Como usar"),
      bullet("Va em Check-in no menu"),
      bullet("Escolha a categoria e o filho"),
      bullet("Escolha um template rapido ou escreva um titulo personalizado"),
      bullet("O check-in aparece na timeline e envia mensagem automatica no chat"),
      tipBox("Templates rapidos: Ficou 1h na tela, Comeu bem, Dormiu cedo, etc."),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 8. CHAT ============
      h1("8. Chat"),
      p("Canal de comunicacao em tempo real entre os membros do grupo familiar."),
      bullet("Mensagens em tempo real via Supabase Realtime"),
      bullet("Mensagens imutaveis: nao podem ser apagadas ou editadas (conformidade legal para mediacao)"),
      bullet("Notificacoes automaticas de todas as acoes do app (check-in, despesas, eventos, trocas, doencas, medicamentos)"),
      bullet("Suporte a respostas (reply) e pins"),
      bullet("IA Mediadora: analisa o tom da mensagem antes de enviar e sugere reformulacao se detectar linguagem agressiva"),
      tipBox("O chat serve como historico oficial de todas as comunicacoes e acoes da coparentalidade."),

      // ============ 9. SAUDE ============
      h1("9. Saude"),
      p("Modulo completo de saude com 8 sub-areas. O hub central mostra um resumo de tudo."),
      sectionSpacer(),

      h3("9.1 Dashboard de Saude"),
      p("Visao geral com: doencas ativas, medicamentos em uso, alergias criticas, proximas consultas, retornos pendentes, vacinas atrasadas e doses recentes."),
      sectionSpacer(),

      h3("9.2 Doencas"),
      bullet("Registre episodios de doenca com sintomas, severidade (leve/moderado/grave) e diagnostico"),
      bullet("Adicione notas de evolucao com data/hora e autor"),
      bullet("Marque ida ao hospital"),
      bullet("Status: ativo, resolvido ou cronico"),
      tipBox("Cada registro de doenca gera mensagem no chat para o outro responsavel ficar ciente."),
      sectionSpacer(),

      h3("9.3 Medicamentos"),
      bullet("Cadastre medicamento com dosagem, frequencia e horarios"),
      bullet("Registre cada dose administrada (quem deu, quando)"),
      bullet("Status: ativo, pausado, completo, cancelado"),
      bullet("Historico completo de todas as doses"),
      sectionSpacer(),

      h3("9.4 Consultas"),
      bullet("Agende consultas com profissional, tipo, local e data"),
      bullet("Registre diagnostico, prescricoes e data de retorno"),
      bullet("Consulta cria evento automatico no calendario"),
      bullet("Status: agendada, concluida, cancelada, faltou"),
      sectionSpacer(),

      h3("9.5 Alergias"),
      bullet("Registre alergias com tipo, severidade e descricao da reacao"),
      bullet("Cadastre informacoes medicas: tipo sanguineo, convenio, numero SUS"),
      bullet("Selecione o pediatra principal da lista de profissionais"),
      sectionSpacer(),

      h3("9.6 Vacinas"),
      bullet("Registre vacinas aplicadas com dose, lote e local"),
      bullet("Comparacao automatica com o calendario da SBP (Sociedade Brasileira de Pediatria)"),
      bullet("Mostra quais vacinas estao em dia e quais estao atrasadas"),
      sectionSpacer(),

      h3("9.7 Crescimento"),
      bullet("Registre peso, altura e perimetro cefalico"),
      bullet("Dados comparados com as curvas de referencia da OMS (WHO)"),
      sectionSpacer(),

      h3("9.8 Profissionais de Saude"),
      bullet("Diretorio com nome, especialidade, CRM, telefone e endereco"),
      bullet("Link direto para WhatsApp do profissional"),
      bullet("Use na hora de agendar consultas"),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 10. FINANCEIRO ============
      h1("10. Financeiro e Despesas"),
      p("Controle financeiro completo com dashboard, despesas e acertos entre os pais."),
      sectionSpacer(),

      h3("Dashboard Financeiro"),
      bullet("Navegacao por mes com total do mes e contagem de despesas"),
      bullet("Cards por responsavel com valor, barra de progresso e percentual"),
      bullet("Calculo automatico de balanco: quem deve quanto para quem"),
      bullet("Breakdown por categoria (educacao, saude, alimentacao, roupas, etc.)"),
      bullet("Lista de despesas do mes com status (Pendente/Aprovada/Rejeitada)"),
      sectionSpacer(),

      h3("Historico"),
      bullet("Cards por mes com total e barra de cores empilhada"),
      bullet("Balanco mensal: Equilibrado ou X deve R$ Y para Z"),
      sectionSpacer(),

      h3("Criando uma Despesa"),
      ...["Va em Despesas e clique em + Nova Despesa", "Preencha descricao, valor, categoria e data", "Opcionalmente selecione o filho e anexe comprovante (foto/PDF ate 5MB)", "Defina a divisao (padrao 50/50 ou customizada)", "O outro responsavel recebe notificacao e pode Aprovar ou Rejeitar"].map(text =>
        new Paragraph({ numbering: { reference: "numbers6", level: 0 }, spacing: { after: 50 },
          children: [new TextRun({ text, font: "Arial", size: 20 })] })
      ),
      sectionSpacer(),

      h3("Acertos Financeiros"),
      p("Registre pagamentos (PIX, dinheiro, transferencia) e o outro responsavel confirma o recebimento."),
      tipBox("Cada despesa registrada gera mensagem automatica no chat."),

      // ============ 11. DOCUMENTOS ============
      h1("11. Documentos"),
      p("Repositorio compartilhado de documentos importantes da familia."),
      bullet("Categorias: Pessoal, Saude, Educacao, Legal, Outro"),
      bullet("Upload por filho ou documento geral do grupo"),
      bullet("Visualizacao e download"),

      // ============ 12. FAMILIA ============
      h1("12. Familia"),
      p("Gerencie os membros do grupo familiar."),
      bullet("Veja todos os membros com papeis e data de entrada"),
      bullet("Convites pendentes e aceitos"),
      bullet("Papeis: Admin ou Membro (Admin pode gerenciar outros membros)"),
      bullet("Remover membros (apenas admin)"),
      bullet("Sair do grupo (com restricoes se unico admin)"),

      // ============ 13. CRIANCAS ============
      h1("13. Criancas"),
      bullet("Cadastre filhos com nome e data de nascimento"),
      bullet("Veja idade calculada automaticamente"),
      bullet("Acesse perfil individual com dados de saude, escola e eventos"),

      new Paragraph({ children: [new PageBreak()] }),

      // ============ 14. ACORDOS ============
      h1("14. Acordos"),
      p("Registre principios e regras acordadas entre os pais."),
      bullet("Categorias: principio, valor, regra, limite, rotina, educacao, saude, seguranca, comunicacao, financeiro"),
      bullet("Marque como negociavel ou inegociavel"),
      bullet("O outro responsavel pode aceitar o acordo"),
      bullet("Tom de escrita moderado pelo app para evitar linguagem agressiva"),

      // ============ 15. TEMAS SENSIVEIS ============
      h1("15. Temas Sensiveis"),
      p("Espaco para registrar e discutir temas delicados da familia com suporte."),

      // ============ 16. ESCOLA ============
      h1("16. Escola"),
      p("Centralize informacoes escolares: notas, ocorrencias, reunioes, contatos."),

      // ============ 17. PERFIL ============
      h1("17. Perfil"),
      p("Gerencie seus dados pessoais: nome, email, telefone e foto."),

      // ============ 18. NOTIFICACOES ============
      h1("18. Notificacoes"),
      p("O app envia notificacoes push para o celular nos seguintes eventos:"),
      bullet("Solicitacao de troca de dia"),
      bullet("Resposta a troca (aprovada/rejeitada)"),
      bullet("Nova despesa registrada"),
      bullet("Despesa aprovada ou rejeitada"),
      bullet("Acerto financeiro e confirmacao"),
      bullet("Atividades do dia seguinte (24h antes) com lista de materiais"),
      bullet("Consulta agendada"),
      p("Alem disso, TODAS as acoes geram mensagem automatica no chat do grupo:"),
      bullet("Check-in, eventos, despesas, doencas, medicamentos, trocas de dia"),

      // ============ 19. iCAL ============
      h1("19. Sincronizacao com Celular"),
      p("Exporte o calendario de guarda para o Google Calendar ou Apple Calendar."),
      bullet("Na Agenda, clique em Sincronizar com Celular"),
      bullet("Um link iCal unico e gerado para voce"),
      bullet("No iPhone: Ajustes > Calendario > Contas > Adicionar > Outro > Assinar Calendario"),
      bullet("No Android: Google Calendar > Configuracoes > Adicionar por URL"),
      bullet("O calendario atualiza automaticamente quando a escala muda"),
      tipBox("Cada membro do grupo tem seu proprio link — so mostra os eventos do grupo."),

      sectionSpacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: teal, space: 12 } },
        spacing: { before: 400 },
        children: [
          new TextRun({ text: "Precisa de ajuda? Acesse ", font: "Arial", size: 20, color: "666666" }),
          new TextRun({ text: "kindar.vercel.app", font: "Arial", size: 20, color: teal, bold: true }),
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Documento gerado em Marco 2026", font: "Arial", size: 16, color: "AAAAAA", italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("GUIA-PRATICO-2LARES.docx", buffer);
  console.log("Guia gerado: GUIA-PRATICO-2LARES.docx");
  console.log("Tamanho:", (buffer.length / 1024).toFixed(1), "KB");
});
