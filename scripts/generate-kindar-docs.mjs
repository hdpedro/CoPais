import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, HeadingLevel, AlignmentType, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} from "docx";
import fs from "fs";
import path from "path";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FONT = "Arial";
const HEADER_SHADING = { type: ShadingType.CLEAR, color: "auto", fill: "D5E8F0" };
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
const FULL_WIDTH = 9360; // DXA for US Letter minus margins

const BORDERS_ALL = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
};

function p(text, opts = {}) {
  const { bold, size, color, alignment, spacing, font, italics, heading, bullet } = opts;
  const config = {};
  if (heading) config.heading = heading;
  if (alignment) config.alignment = alignment;
  if (spacing) config.spacing = spacing;
  if (bullet) config.bullet = { level: bullet.level || 0 };

  config.children = [
    new TextRun({
      text,
      bold: bold || false,
      italics: italics || false,
      size: size || 24, // 12pt
      font: font || FONT,
      color: color || "000000",
    }),
  ];
  return new Paragraph(config);
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: FONT, color: "1A3C5E" })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: "2A5C8E" })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: FONT, color: "3A6C9E" })],
  });
}

function body(text, opts = {}) {
  return p(text, { size: 24, spacing: { after: 120 }, ...opts });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 24, font: FONT })],
  });
}

function boldBullet(label, description, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label + ": ", bold: true, size: 24, font: FONT }),
      new TextRun({ text: description, size: 24, font: FONT }),
    ],
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function makeCell(text, opts = {}) {
  const { bold, shading, width, alignment } = opts;
  const config = {
    children: [
      new Paragraph({
        alignment: alignment || AlignmentType.LEFT,
        children: [new TextRun({ text: text || "", bold: bold || false, size: 20, font: FONT })],
      }),
    ],
    borders: BORDERS_ALL,
    margins: CELL_MARGINS,
  };
  if (shading) config.shading = shading;
  if (width) config.width = { size: width, type: WidthType.DXA };
  return new TableCell(config);
}

function makeHeaderCell(text, width) {
  return makeCell(text, { bold: true, shading: HEADER_SHADING, width });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => makeHeaderCell(h, colWidths[i])),
    tableHeader: true,
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell, i) => makeCell(cell, { width: colWidths[i] })),
      })
  );
  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
  });
}

// ── Cover Page ───────────────────────────────────────────────────────────────

function coverPage() {
  return [
    emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
    emptyLine(), emptyLine(), emptyLine(),
    p("KINDAR", { bold: true, size: 72, color: "1A3C5E", alignment: AlignmentType.CENTER }),
    emptyLine(),
    p("Documentacao Tecnica Completa", { bold: true, size: 36, color: "2A5C8E", alignment: AlignmentType.CENTER }),
    emptyLine(),
    p("Plataforma Inteligente de Coparentalidade", { size: 28, color: "555555", alignment: AlignmentType.CENTER, italics: true }),
    emptyLine(), emptyLine(),
    p("v2.0 \u2014 Marco 2026", { size: 24, color: "666666", alignment: AlignmentType.CENTER }),
    emptyLine(),
    p("Confidencial \u2014 Uso Interno", { bold: true, size: 22, color: "CC0000", alignment: AlignmentType.CENTER }),
    pageBreak(),
  ];
}

// ── Section 1: Visao Geral ──────────────────────────────────────────────────

function section1() {
  return [
    heading1("1. Visao Geral"),
    body("O Kindar e uma plataforma SaaS de coparentalidade projetada para facilitar a comunicacao, organizacao e colaboracao entre pais separados que compartilham a criacao de seus filhos."),
    emptyLine(),
    heading2("1.1 Problema"),
    body("Familias com pais separados enfrentam desafios diarios de coordenacao: agendas de guarda conflitantes, divisao desorganizada de despesas, falta de registro de informacoes de saude das criancas e comunicacao fragmentada entre multiplos aplicativos (WhatsApp, planilhas, cadernos)."),
    emptyLine(),
    heading2("1.2 Publico-Alvo"),
    bullet("Pais separados entre 28 e 45 anos"),
    bullet("Classes B e C+, predominantemente no Brasil"),
    bullet("Familias com 1 a 3 filhos em regime de guarda compartilhada"),
    bullet("Usuarios de smartphone (Android/iOS) com acesso a internet"),
    emptyLine(),
    heading2("1.3 Proposta de Valor"),
    boldBullet("Reduzir conflitos", "comunicacao estruturada substitui discussoes informais"),
    boldBullet("Previsibilidade", "calendario de guarda automatizado com escalas recorrentes"),
    boldBullet("Transparencia financeira", "divisao de despesas estilo Splitwise com comprovantes"),
    boldBullet("Historico de saude unificado", "vacinas, consultas, medicamentos e alergias centralizados"),
    boldBullet("Assistente IA", "criacao rapida de eventos e despesas por linguagem natural"),
    emptyLine(),
    heading2("1.4 Stack Tecnologica"),
    makeTable(
      ["Camada", "Tecnologia", "Versao"],
      [
        ["Frontend", "Next.js (App Router)", "16.x"],
        ["UI Library", "React", "19.x"],
        ["Estilizacao", "Tailwind CSS", "4.x"],
        ["Linguagem", "TypeScript", "5.x"],
        ["Backend/DB", "Supabase (PostgreSQL 15)", "2.x"],
        ["IA", "Groq API (Llama 3.3 70B)", "-"],
        ["Deploy", "Vercel (Serverless)", "-"],
        ["PWA", "Service Worker + Web Push", "-"],
        ["Mobile", "Capacitor (iOS)", "6.x"],
      ],
      [2400, 4200, 2760]
    ),
    pageBreak(),
  ];
}

// ── Section 2: Arquitetura ──────────────────────────────────────────────────

function section2() {
  return [
    heading1("2. Arquitetura do Sistema"),
    heading2("2.1 Frontend"),
    boldBullet("Next.js App Router", "renderizacao hibrida com Server e Client Components"),
    boldBullet("PWA", "instalavel em dispositivos moveis com Service Worker para cache offline"),
    boldBullet("Responsivo", "layout adaptativo com Sidebar (desktop) e BottomNav (mobile)"),
    boldBullet("Server Actions", "78+ acoes distribuidas em 25 arquivos para mutacoes seguras"),
    emptyLine(),
    heading2("2.2 Backend (Supabase)"),
    boldBullet("PostgreSQL 15", "banco relacional com 37+ tabelas e Row Level Security (RLS)"),
    boldBullet("Auth", "autenticacao via OAuth (Google) e Magic Link"),
    boldBullet("Storage", "buckets para comprovantes de despesas e documentos"),
    boldBullet("Realtime", "subscriptions para chat e notificacoes em tempo real"),
    emptyLine(),
    heading2("2.3 Diagrama de Fluxo"),
    body("Usuario (PWA) -> Next.js (Vercel) -> Server Actions -> Supabase (PostgreSQL + Auth + Storage)"),
    body("Usuario (PWA) -> Supabase Realtime (WebSocket) -> Chat / Notificacoes"),
    body("Server Actions -> Groq API -> Assistente IA (fallback para parser local)"),
    emptyLine(),
    heading2("2.4 Deploy e Infraestrutura"),
    boldBullet("Vercel", "deploy automatico via Git, serverless functions, edge network global"),
    boldBullet("Dominio", "kindar.com.br com HTTPS automatico"),
    boldBullet("CI/CD", "build e deploy automatico a cada push na branch main"),
    boldBullet("Monitoramento", "Vercel Analytics + logs de funcoes serverless"),
    pageBreak(),
  ];
}

// ── Section 3: Modulos ──────────────────────────────────────────────────────

function section3() {
  const modules = [
    ["1. Calendario de Guarda", "custody_events, custody_schedules, swap_requests", "generateSchedule, clearCustodySchedule, createSwapRequest, respondToSwapRequest", "/calendario, /calendario/escala"],
    ["2. Atividades", "child_activities, activity_reports (overrides JSONB), checklist_completions", "createActivity, editActivityAll, editActivityOccurrence, cancelActivityOccurrence, changeActivityResponsible, changeActivityResponsibleAll, deleteActivity, submitActivityReport", "/atividades, /atividades/nova"],
    ["3. Eventos", "events", "createEvent, updateEvent, deleteEvent", "/calendario/novo"],
    ["4. Chat", "chat_messages, chat_channels, chat_channel_reads", "markChannelRead", "/chat"],
    ["5. Saude", "appointments, medications, allergies, vaccines, dose_records, illnesses, growth_records, health_professionals, health_views (10 tabelas)", "createAppointment, createMedication, createAllergy, updateAllergy, deleteAllergy, createVaccine, confirmDose, createIllness, createGrowthRecord + 9 mais", "/saude/*"],
    ["6. Despesas", "expenses, settlements", "createExpense, updateExpenseStatus, createSettlement, updateSettlementStatus", "/despesas, /despesas/nova"],
    ["7. Decisoes", "decisions, decision_votes, decision_arguments", "createDecision, castVote, addArgument", "/decisoes"],
    ["8. Acordos", "agreements", "createAgreement, acceptAgreement, rejectAgreement", "/acordos"],
    ["9. Notas Privadas", "private_notes", "createNote, updateNote, deleteNote", "/notas"],
    ["10. Documentos", "documents (+ Storage bucket)", "createDocument, deleteDocument", "/documentos"],
    ["11. Criancas", "children, child_education", "addChild, updateChild, deleteChild", "/criancas, /criancas/nova"],
    ["12. Check-in", "daily_checkins", "createCheckin", "/checkin"],
    ["13. Escola", "school_logs", "createSchoolLog", "/escola"],
    ["14. Temas Sensiveis", "sensitive_notes", "createSensitiveNote, requestDeletion, approveDeletion", "/temas-sensiveis"],
    ["15. Notificacoes", "notifications, push_subscriptions", "markNotificationRead, subscribePush, unsubscribePush", "/notificacoes"],
    ["16. Familia", "group_members, invitations, groups", "changeMemberRole, removeMember, createInvitation, acceptInvitation", "/familia, /convite/enviar"],
    ["17. Assistente IA", "- (sem tabelas proprias)", "AI parser local + Groq API fallback", "Botao flutuante global"],
  ];

  return [
    heading1("3. Modulos do Sistema"),
    body("O Kindar e composto por 17 modulos independentes que cobrem todas as necessidades de coparentalidade:"),
    emptyLine(),
    makeTable(
      ["Modulo", "Tabelas", "Acoes Principais", "Rotas"],
      modules,
      [1800, 2800, 2800, 1960]
    ),
    emptyLine(),
    heading2("3.1 Detalhamento dos Modulos Principais"),
    emptyLine(),
    heading3("Calendario de Guarda"),
    body("O modulo de calendario e o coracao do Kindar. Permite criar escalas de guarda recorrentes (semanal, quinzenal, personalizada), visualizar em grade mensal, solicitar trocas de dias com fluxo de aprovacao e exportar para Google Calendar/Apple Calendar via formato iCal."),
    bullet("Gerador automatico de escalas com padroes pre-definidos (alternada, 2-2-3, personalizada)"),
    bullet("Sistema de swap requests com notificacao push e saldo de trocas"),
    bullet("Planejador de finais de semana e feriados"),
    bullet("Exportacao iCal com token seguro por usuario"),
    bullet("Edicao de ocorrencias individuais ou todas (edit single/all occurrences)"),
    bullet("Relatorios de atividades com overrides JSONB por ocorrencia"),
    bullet("Formulario premium redesenhado para criacao de compromissos"),
    bullet("Limpeza de escala de guarda (clearCustodySchedule)"),
    emptyLine(),
    heading3("Modulo de Saude"),
    body("O modulo de saude centraliza todo o historico medico das criancas com 10 sub-modulos:"),
    bullet("Vacinas com calendario SBP integrado, confirmacao de doses com validacao de intervalo server-side e banner de vacinas atrasadas"),
    bullet("Consultas com agendamento WhatsApp, registro de retornos e tipos (rotina/emergencia/retorno/exame)"),
    bullet("Medicamentos com posologia e lembretes"),
    bullet("Alergias com niveis de severidade, edicao e exclusao (updateAllergy, deleteAllergy)"),
    bullet("Doencas com timeline de episodios e resolucao"),
    bullet("Crescimento com graficos WHO (peso/altura por idade)"),
    bullet("Profissionais de saude com contatos"),
    bullet("Exportacao de relatorio de saude completo"),
    bullet("Push notifications para todos os eventos de saude"),
    bullet("Sanitizacao de inputs e validacao server-side em todas as acoes"),
    emptyLine(),
    heading3("Chat"),
    body("Sistema de mensagens em tempo real com canais tematicos (geral, saude, financeiro, escola). Mensagens sao imutaveis para compliance legal em disputas de guarda. Inclui indicadores de leitura, notificacoes push, troca de canais client-side com cache LRU e iniciais das criancas nas tabs."),
    emptyLine(),
    heading3("Despesas e Financeiro"),
    body("Divisao de despesas estilo Splitwise com upload de comprovantes (WebP), ratios de divisao configuraveis (50/50, 60/40, etc), sistema de acertos (settlements) com validacao server-side e dashboard financeiro com graficos de gastos por categoria. Inclui multi-select child chips, bloqueio de auto-aprovacao e balanco calculado apenas com despesas aprovadas."),
    pageBreak(),
  ];
}

// ── Section 4: Banco de Dados ───────────────────────────────────────────────

function section4() {
  const tables = [
    ["profiles", "id, email, full_name, avatar_url, phone, role, locale, created_at", "Perfis de usuarios"],
    ["groups", "id, name, created_by, created_at", "Grupos familiares"],
    ["group_members", "id, group_id, user_id, role, joined_at", "Membros do grupo"],
    ["children", "id, group_id, name, birth_date, gender, blood_type, photo_url", "Criancas do grupo"],
    ["child_education", "id, child_id, school_name, grade, teacher, schedule, notes", "Info escolar"],
    ["custody_events", "id, group_id, child_id, parent_id, start_date, end_date, type, notes", "Eventos de guarda"],
    ["custody_schedules", "id, group_id, pattern, start_date, parent_a, parent_b, config", "Escalas recorrentes"],
    ["swap_requests", "id, group_id, requester_id, event_id, proposed_date, status, reason", "Trocas de dias"],
    ["events", "id, group_id, title, description, start, end, type, recurrence, assigned_to", "Eventos gerais"],
    ["child_activities", "id, group_id, child_id, name, type, days, time, location, responsible, all_children, cost, notes, category", "Atividades das criancas"],
    ["activity_reports", "id, activity_id, date, attended, notes, checklist_data, overrides (JSONB)", "Relatorios de atividades"],
    ["expenses", "id, group_id, description, amount, category, paid_by, split_ratio, receipt_url, status", "Despesas compartilhadas"],
    ["settlements", "id, group_id, from_user, to_user, amount, status, proof_url", "Acertos financeiros"],
    ["chat_messages", "id, group_id, channel_id, user_id, content, created_at", "Mensagens do chat"],
    ["chat_channels", "id, group_id, name, type, created_at", "Canais de chat"],
    ["chat_channel_reads", "id, channel_id, user_id, last_read_at", "Marcacao de leitura"],
    ["appointments", "id, child_id, group_id, professional_id, date, type, status, notes, return_date", "Consultas medicas"],
    ["medications", "id, child_id, group_id, name, dosage, frequency, start_date, end_date, notes", "Medicamentos"],
    ["allergies", "id, child_id, group_id, allergen, severity, reactions, treatment, diagnosed_at", "Alergias"],
    ["vaccines", "id, child_id, group_id, name, scheduled_date, status", "Vacinas"],
    ["dose_records", "id, vaccine_id, dose_number, applied_at, confirmed_by, batch, location", "Doses aplicadas"],
    ["illnesses", "id, child_id, group_id, name, start_date, end_date, severity, hospital, symptoms", "Episodios de doenca"],
    ["growth_records", "id, child_id, group_id, date, weight_kg, height_cm, head_cm, notes", "Registros de crescimento"],
    ["health_professionals", "id, group_id, name, specialty, phone, email, address, notes", "Profissionais de saude"],
    ["health_views", "id, record_type, record_id, user_id, viewed_at", "Visualizacoes de saude"],
    ["agreements", "id, group_id, title, description, proposed_by, status, accepted_at", "Acordos entre pais"],
    ["decisions", "id, group_id, title, description, type, deadline, status, created_by", "Decisoes colaborativas"],
    ["decision_votes", "id, decision_id, user_id, vote, comment", "Votos em decisoes"],
    ["decision_arguments", "id, decision_id, user_id, type, content", "Argumentos de decisoes"],
    ["private_notes", "id, user_id, group_id, child_id, title, content, created_at", "Notas privadas"],
    ["sensitive_notes", "id, group_id, user_id, title, content, deletion_requested, deletion_approved", "Temas sensiveis"],
    ["documents", "id, group_id, name, file_url, category, uploaded_by, created_at", "Documentos compartilhados"],
    ["daily_checkins", "id, group_id, user_id, date, mood, notes, children_status", "Check-ins diarios"],
    ["school_logs", "id, group_id, child_id, date, type, description, created_by", "Registros escolares"],
    ["notifications", "id, user_id, group_id, type, title, body, read, data, created_at", "Notificacoes in-app"],
    ["push_subscriptions", "id, user_id, endpoint, keys, created_at", "Subscricoes push"],
    ["invitations", "id, group_id, invited_by, email, token, status, created_at", "Convites para grupo"],
  ];

  return [
    heading1("4. Banco de Dados"),
    body("O Kindar utiliza PostgreSQL 15 via Supabase com 37+ tabelas principais. Todas as tabelas possuem Row Level Security (RLS) ativado, garantindo que cada usuario so acessa dados dos seus grupos."),
    emptyLine(),
    heading2("4.1 Listagem Completa de Tabelas"),
    makeTable(
      ["Tabela", "Colunas Principais", "Descricao"],
      tables,
      [2200, 5200, 1960]
    ),
    emptyLine(),
    heading2("4.2 Politicas RLS"),
    body("Cada tabela possui politicas RLS que verificam a associacao do usuario ao grupo via group_members. Exemplo de politica tipica:"),
    emptyLine(),
    body('SELECT policy: "Usuarios podem ver dados do seu grupo" -> auth.uid() IN (SELECT user_id FROM group_members WHERE group_id = tabela.group_id)', { size: 20, color: "333333" }),
    body('INSERT policy: "Usuarios podem inserir dados no seu grupo" -> auth.uid() IN (SELECT user_id FROM group_members WHERE group_id = NEW.group_id)', { size: 20, color: "333333" }),
    emptyLine(),
    heading2("4.3 Migrations"),
    body("O projeto possui 29 migrations sequenciais (00001 a 00029) que criam e evoluem o schema do banco. Cada migration e idempotente e pode ser aplicada via Supabase CLI ou manualmente no SQL Editor."),
    pageBreak(),
  ];
}

// ── Section 5: Assistente IA ────────────────────────────────────────────────

function section5() {
  return [
    heading1("5. Assistente IA"),
    body("O Kindar integra um assistente de inteligencia artificial que permite aos usuarios criar eventos, despesas e consultas usando linguagem natural. O sistema opera em duas camadas para otimizar custo e latencia."),
    emptyLine(),
    heading2("5.1 Arquitetura de Duas Camadas"),
    emptyLine(),
    heading3("Camada 1: Parser Local (0ms de latencia, 12 padroes, 98.5% acuracia)"),
    body("Um parser baseado em regex e heuristicas com 12 padroes que identifica comandos comuns em portugues com 98.5% de acuracia. Processa comandos como:"),
    bullet('"Criar evento reuniao escola amanha as 14h" -> detecta titulo, data e horario'),
    bullet('"Despesa farmacia R$45,90 dividir 60/40" -> detecta categoria, valor e split ratio'),
    bullet('"Consulta pediatra dia 15 as 10h" -> detecta tipo, profissional e data'),
    emptyLine(),
    heading3("Camada 2: Groq API (fallback, ~500ms)"),
    body("Quando o parser local nao consegue interpretar o comando, a requisicao e enviada para a API do Groq usando o modelo Llama 3.3 70B Versatile. O prompt do sistema instrui o modelo a retornar JSON estruturado com a acao e parametros identificados."),
    emptyLine(),
    heading2("5.2 Acoes Disponiveis"),
    makeTable(
      ["Acao", "Descricao", "Parametros"],
      [
        ["create_event", "Cria um evento no calendario", "title, date, time, description, type"],
        ["create_expense", "Registra uma despesa", "description, amount, category, split_ratio"],
        ["create_appointment", "Agenda uma consulta", "professional, date, time, type, child"],
        ["create_medication", "Registra um medicamento", "name, dosage, frequency, child"],
        ["create_activity", "Cria uma atividade", "name, type, days, time, location"],
        ["create_checkin", "Faz um check-in diario", "mood, notes"],
        ["search_health", "Busca registros de saude", "query, child, type"],
        ["search_events", "Busca eventos", "query, date_range"],
        ["get_summary", "Resume informacoes do grupo", "period, type"],
        ["help", "Mostra ajuda do assistente", "-"],
      ],
      [2200, 3800, 3360]
    ),
    emptyLine(),
    heading2("5.3 Cache e Rate Limiting"),
    boldBullet("Cache", "respostas identicas sao cacheadas por 5 minutos para evitar chamadas duplicadas a API"),
    boldBullet("Rate Limit", "maximo de 20 requisicoes por minuto por usuario para prevenir abuso"),
    boldBullet("Fallback gracioso", "se a API estiver indisponivel, o usuario recebe sugestoes de comandos manuais"),
    emptyLine(),
    heading2("5.4 Custos de IA"),
    body("O Groq oferece um tier gratuito generoso. Com o parser local resolvendo ~85% das requisicoes (12 padroes, 98.5% acuracia), o custo projetado e:"),
    bullet("Ate 5.000 usuarios: R$0/mes (dentro do free tier do Groq)"),
    bullet("5.000 a 50.000 usuarios: ~R$50/mes (US$9 no plano Developer do Groq)"),
    pageBreak(),
  ];
}

// ── Section 6: Integracoes e Custos ─────────────────────────────────────────

function section6() {
  return [
    heading1("6. Integracoes e Custos Operacionais"),
    body("O Kindar foi projetado para operar com custo zero no estagio inicial (ate ~50 usuarios ativos) e escalar de forma economica."),
    emptyLine(),
    heading2("6.1 Tabela de Custos por Escala"),
    makeTable(
      ["Servico", "Uso", "50 usuarios", "500 usuarios", "5.000 usuarios"],
      [
        ["Supabase", "Banco de dados + Auth + Storage + Realtime", "$0 (Free)", "$25/mes (Pro)", "$25/mes (Pro)"],
        ["Vercel", "Hosting + Serverless Functions + Edge Network", "$0 (Hobby)", "$20/mes (Pro)", "$20/mes (Pro)"],
        ["Groq AI", "Assistente IA (Llama 3.3 70B)", "$0 (Free)", "$0 (Free)", "$9/mes (Dev)"],
        ["Web Push", "Notificacoes push nativas (VAPID)", "$0", "$0", "$0"],
        ["PostHog", "Analytics e product metrics", "$0 (Free)", "$0 (Free)", "$0 (Free)"],
        ["Total Mensal", "", "$0", "$45/mes", "$54/mes"],
      ],
      [1600, 2400, 1600, 1800, 1960]
    ),
    emptyLine(),
    heading2("6.2 Detalhamento das Integracoes"),
    emptyLine(),
    heading3("Supabase"),
    bullet("PostgreSQL 15 com conexao direta e pooling via Supavisor"),
    bullet("Auth com provedores OAuth (Google) e Magic Link"),
    bullet("Storage com buckets para receipts e documents"),
    bullet("Realtime via WebSocket para chat e presence"),
    bullet("Edge Functions para webhooks (futuro)"),
    emptyLine(),
    heading3("Vercel"),
    bullet("Deploy automatico via integracao Git"),
    bullet("Serverless Functions para Server Actions"),
    bullet("Edge Network com CDN global"),
    bullet("Analytics nativo com Web Vitals"),
    emptyLine(),
    heading3("Web Push (VAPID)"),
    bullet("Notificacoes push nativas sem custo (protocolo Web Push)"),
    bullet("Chaves VAPID gerenciadas pelo servidor"),
    bullet("Suporte a iOS 16.4+ (Safari) e Android (Chrome/Firefox)"),
    bullet("Push para: trocas de guarda, novas despesas, mensagens de chat, lembretes de consulta"),
    pageBreak(),
  ];
}

// ── Section 7: Seguranca ────────────────────────────────────────────────────

function section7() {
  return [
    heading1("7. Seguranca"),
    body("A seguranca e prioridade no Kindar dado o carater sensivel dos dados familiares. O sistema implementa multiplas camadas de protecao:"),
    emptyLine(),
    heading2("7.1 Row Level Security (RLS)"),
    body("Todas as 37+ tabelas possuem RLS ativado. Cada politica verifica que o usuario autenticado pertence ao grupo familiar antes de permitir qualquer operacao (SELECT, INSERT, UPDATE, DELETE). Isso garante isolamento completo entre familias mesmo em caso de vulnerabilidade no codigo da aplicacao."),
    emptyLine(),
    heading2("7.2 Autenticacao"),
    boldBullet("Supabase Auth", "gerenciamento seguro de sessoes com JWT"),
    boldBullet("OAuth 2.0", "login via Google com PKCE flow"),
    boldBullet("Magic Link", "autenticacao sem senha via email"),
    boldBullet("getUser() vs getSession()", "todas as Server Actions usam getUser() que valida o JWT no servidor, em vez de getSession() que pode ser spoofado no cliente"),
    emptyLine(),
    heading2("7.3 Chat Imutavel"),
    body("Mensagens do chat sao imutaveis (sem edicao ou exclusao) para garantir compliance legal. Em disputas de guarda, o historico de comunicacao pode ser usado como evidencia, portanto a integridade dos registros e essencial."),
    emptyLine(),
    heading2("7.4 Validacao de Input"),
    boldBullet("Server Actions", "toda entrada do usuario e validada no servidor antes de persistir"),
    boldBullet("Sanitizacao", "protecao contra XSS e SQL Injection via Supabase client, input sanitization em todos os formularios de saude"),
    boldBullet("Rate Limiting", "protecao contra abuso na API de IA e endpoints criticos"),
    boldBullet("CSRF", "protecao nativa do Next.js via Server Actions"),
    emptyLine(),
    heading2("7.5 Validacoes de Negocio"),
    boldBullet("Auto-aprovacao bloqueada", "despesas nao podem ser aprovadas pelo proprio criador"),
    boldBullet("Prevencao de regressao de status", "despesas aprovadas/rejeitadas nao podem voltar a pendente"),
    boldBullet("Validacao de intervalo de doses", "server-side validation para intervalo minimo entre doses de vacinas"),
    boldBullet("Validacao de settlements", "valores de acertos validados server-side contra o balanco real"),
    emptyLine(),
    heading2("7.6 Dados Sensiveis"),
    boldBullet("Temas Sensiveis", "modulo dedicado com fluxo de exclusao em duas etapas (solicitacao + aprovacao)"),
    boldBullet("Notas Privadas", "visiveis apenas para o autor, sem compartilhamento"),
    boldBullet("Documentos", "acesso restrito a membros do grupo com URLs assinadas (signed URLs)"),
    pageBreak(),
  ];
}

// ── Section 8: Escalabilidade ───────────────────────────────────────────────

function section8() {
  return [
    heading1("8. Escalabilidade"),
    body("O Kindar foi arquitetado para escalar progressivamente, adicionando infraestrutura conforme a demanda cresce:"),
    emptyLine(),
    heading2("8.1 Fase 1: Free Tier (0-500 usuarios)"),
    boldBullet("Supabase Free", "500MB banco, 1GB storage, 50K auth users"),
    boldBullet("Vercel Hobby", "100GB bandwidth, serverless functions"),
    boldBullet("Groq Free", "~30 req/min, suficiente para uso moderado"),
    boldBullet("Custo total", "$0/mes"),
    emptyLine(),
    heading2("8.2 Fase 2: Pro Tier (500-5.000 usuarios)"),
    boldBullet("Supabase Pro", "8GB banco, 100GB storage, conexoes ilimitadas"),
    boldBullet("Vercel Pro", "1TB bandwidth, funcoes otimizadas"),
    boldBullet("Groq Developer", "rate limits expandidos"),
    boldBullet("Custo total", "~$54/mes"),
    emptyLine(),
    heading2("8.3 Fase 3: Scale (5.000-50.000 usuarios)"),
    boldBullet("Cache Redis", "Upstash Redis para cache de queries frequentes e sessoes"),
    boldBullet("CDN", "cache de assets estaticos na edge da Vercel"),
    boldBullet("Read Replicas", "Supabase read replicas para distribuir carga de leitura"),
    boldBullet("Connection Pooling", "Supavisor com pool otimizado para alto throughput"),
    boldBullet("Custo total", "~$150-300/mes"),
    emptyLine(),
    heading2("8.4 Otimizacoes de Performance Implementadas"),
    bullet("Indices de performance em 25 tabelas (migration 00025)"),
    bullet("Server Components para reduzir JavaScript enviado ao cliente"),
    bullet("Dynamic imports e lazy loading de modulos e locales de i18n"),
    bullet("React.memo e useMemo em componentes criticos para evitar re-renders"),
    bullet("Image optimization via Next.js Image component"),
    bullet("Service Worker com cache-first strategy para assets estaticos"),
    bullet("Cache LRU para troca de canais de chat client-side"),
    emptyLine(),
    heading2("8.5 Mobile e Capacitor"),
    bullet("Capacitor iOS ready com configuracao nativa"),
    bullet("Safe areas para notch/Dynamic Island em dispositivos iOS"),
    bullet("Haptics feedback para interacoes criticas"),
    bullet("Touch targets minimos de 44px para acessibilidade mobile"),
    bullet("Page transitions suaves entre rotas"),
    pageBreak(),
  ];
}

// ── Section 9: i18n ─────────────────────────────────────────────────────────

function section9() {
  return [
    heading1("9. Internacionalizacao (i18n)"),
    body("O Kindar suporta 5 idiomas com ~1.405 chaves de traducao em 38 secoes, permitindo expansao para mercados internacionais."),
    emptyLine(),
    heading2("9.1 Idiomas Suportados"),
    makeTable(
      ["Idioma", "Codigo", "Status", "Cobertura"],
      [
        ["Portugues (Brasil)", "pt-BR", "Idioma principal", "100%"],
        ["Ingles", "en", "Completo", "100%"],
        ["Espanhol", "es", "Completo", "100%"],
        ["Frances", "fr", "Completo", "100%"],
        ["Alemao", "de", "Completo", "100%"],
      ],
      [2400, 1600, 2400, 2960]
    ),
    emptyLine(),
    heading2("9.2 Implementacao Tecnica"),
    boldBullet("Arquivos", "um arquivo JSON por idioma em src/i18n/locales/"),
    boldBullet("Lazy Loading", "apenas o locale ativo e carregado, reduzindo bundle size"),
    boldBullet("Seletor", "componente LanguageSelector no perfil do usuario"),
    boldBullet("Fallback", "se uma chave nao existir no idioma selecionado, o sistema usa pt-BR"),
    boldBullet("Formato", "chaves aninhadas por modulo (ex: health.vaccines.title, calendar.swap.request)"),
    emptyLine(),
    heading2("9.3 Estrutura de Chaves"),
    makeTable(
      ["Modulo", "Exemplo de Chave", "PT-BR", "EN"],
      [
        ["Calendario", "calendar.title", "Calendario", "Calendar"],
        ["Saude", "health.vaccines.title", "Vacinas", "Vaccines"],
        ["Despesas", "expenses.new", "Nova Despesa", "New Expense"],
        ["Chat", "chat.send", "Enviar", "Send"],
        ["Familia", "family.invite", "Convidar", "Invite"],
        ["Comum", "common.save", "Salvar", "Save"],
        ["Comum", "common.cancel", "Cancelar", "Cancel"],
      ],
      [1800, 2800, 2400, 2360]
    ),
    pageBreak(),
  ];
}

// ── Section 10: Testes ──────────────────────────────────────────────────────

function section10() {
  return [
    heading1("10. Testes e Qualidade"),
    body("O Kindar possui uma suite de testes abrangente que cobre testes end-to-end, unitarios e auditorias de performance."),
    emptyLine(),
    heading2("10.1 Testes End-to-End (Playwright)"),
    body("34 testes E2E que simulam fluxos completos do usuario:"),
    bullet("Login e autenticacao (OAuth mock + test login)"),
    bullet("Criacao de grupo e onboarding completo"),
    bullet("CRUD de criancas, eventos e despesas"),
    bullet("Fluxo de calendario de guarda com trocas"),
    bullet("Navegacao entre todos os modulos"),
    bullet("Responsividade mobile e desktop"),
    bullet("Fluxo de convite e aceitacao de membro"),
    emptyLine(),
    heading2("10.2 Testes Unitarios (Vitest)"),
    body("50 testes unitarios focados no parser de IA e utilitarios:"),
    bullet("Parser local: 35 testes cobrindo todas as acoes e variacoes de input"),
    bullet("Calendar utils: 8 testes para geracao de escalas e recorrencias"),
    bullet("iCal generator: 4 testes para exportacao de calendario"),
    bullet("Recurrence utils: 3 testes para padroes recorrentes"),
    emptyLine(),
    heading2("10.3 Lighthouse Audit"),
    makeTable(
      ["Metrica", "Score", "Meta", "Status"],
      [
        ["Performance", "92", ">= 90", "Aprovado"],
        ["Accessibility", "96", ">= 90", "Aprovado"],
        ["Best Practices", "95", ">= 90", "Aprovado"],
        ["SEO", "100", ">= 90", "Aprovado"],
        ["PWA", "Sim", "Instalavel", "Aprovado"],
      ],
      [2400, 1600, 2400, 2960]
    ),
    emptyLine(),
    heading2("10.4 Ambiente de Teste"),
    boldBullet("Test Login", "endpoint /api/auth/test-login para autenticacao em ambiente de testes"),
    boldBullet("Seed Data", "scripts de seed para popular banco com dados de teste (seed-test.mjs, seed-diverse-families.mjs)"),
    boldBullet("CI", "testes executados automaticamente no pipeline de deploy"),
  ];
}

// ── Document Assembly ────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullet-list",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: "\u25E6",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24 },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Kindar \u2014 Documentacao Tecnica", italics: true, size: 18, font: FONT, color: "888888" }),
              ],
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
                new TextRun({ text: "Pagina ", size: 18, font: FONT, color: "888888" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: "888888" }),
                new TextRun({ text: " de ", size: 18, font: FONT, color: "888888" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: FONT, color: "888888" }),
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
      ],
    },
  ],
});

// ── Generate ─────────────────────────────────────────────────────────────────

const outDir = path.resolve("docs");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, "KINDAR_Documentacao_Tecnica_v2.docx");
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);

const stats = fs.statSync(outPath);
const sizeKB = (stats.size / 1024).toFixed(1);
console.log(`Document generated successfully!`);
console.log(`Output: ${outPath}`);
console.log(`Size: ${sizeKB} KB (${stats.size} bytes)`);
