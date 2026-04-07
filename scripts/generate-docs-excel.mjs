#!/usr/bin/env node
/**
 * Generates a comprehensive Excel documentation of the Kindar/CoPais project.
 * Run: node scripts/generate-docs-excel.mjs
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "docs", "Kindar_Documentacao_Completa.xlsx");

// ── Brand colors ──
const PRIMARY = "FF6B4CE6";    // purple
const ACCENT = "FFFF6B35";     // orange
const DARK = "FF2D2A26";       // dark brown
const HEADER_BG = "FF4A3F8A";  // dark purple
const HEADER_FG = "FFFFFFFF";
const ALT_ROW = "FFF5F3FF";    // light purple
const SECTION_BG = "FFEEE8FF";

function styleHeader(row, colCount) {
  row.height = 28;
  row.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: "Calibri" };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  for (let i = 1; i <= colCount; i++) {
    row.getCell(i).border = {
      bottom: { style: "thin", color: { argb: PRIMARY } },
    };
  }
}

function addAltRows(sheet, startRow, endRow, colCount) {
  for (let r = startRow; r <= endRow; r++) {
    if ((r - startRow) % 2 === 1) {
      for (let c = 1; c <= colCount; c++) {
        sheet.getRow(r).getCell(c).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW },
        };
      }
    }
    sheet.getRow(r).alignment = { vertical: "top", wrapText: true };
  }
}

function addTitle(sheet, title, subtitle, colCount) {
  const r1 = sheet.addRow([title]);
  r1.font = { bold: true, size: 16, color: { argb: DARK }, name: "Calibri" };
  r1.height = 30;
  sheet.mergeCells(r1.number, 1, r1.number, colCount);
  if (subtitle) {
    const r2 = sheet.addRow([subtitle]);
    r2.font = { size: 10, color: { argb: "FF888888" }, italic: true, name: "Calibri" };
    r2.height = 20;
    sheet.mergeCells(r2.number, 1, r2.number, colCount);
  }
  sheet.addRow([]);
}

// ═══════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════

const tables = [
  // Core
  { module: "Core", table: "profiles", columns: "id (UUID PK), full_name, display_name, email, phone, role (user_role enum), avatar_url, locale, lgpd_consent_at, created_at, updated_at", rls: "Sim", notes: "Extends auth.users; auto-created on signup via trigger" },
  { module: "Core", table: "coparenting_groups", columns: "id (UUID PK), name, created_by (FK profiles), custody_enabled (boolean), created_at", rls: "Sim", notes: "Multi-group support; custody_enabled flag for progressive disclosure" },
  { module: "Core", table: "group_members", columns: "id, group_id, user_id, role (admin/member/readonly), joined_at", rls: "Sim", notes: "Unique(group_id, user_id)" },
  { module: "Core", table: "invitations", columns: "id, group_id, invited_by, email, phone, role, group_role, token, status, expires_at, accepted_by, accepted_at, created_at", rls: "Sim", notes: "Token-based; status: pending/accepted/expired/revoked" },
  // Children
  { module: "Criancas", table: "children", columns: "id, group_id, full_name, birth_date, photo_url, allergies (TEXT[]), notes, cpf, rg, sex (M/F), emergency_token (UUID), created_at, updated_at", rls: "Sim", notes: "CPF/RG, emergency QR token, sex field for WHO growth" },
  { module: "Criancas", table: "child_education", columns: "id, child_id (unique), group_id, school_name, school_address, school_phone, grade, class_name, teacher_name, coordinator_name, entry_time, exit_time, extracurricular_activities (TEXT[]), created_at", rls: "Sim", notes: "1:1 with children" },
  { module: "Criancas", table: "child_medical_info", columns: "id, child_id (unique), group_id, blood_type, insurance_name, insurance_number, sus_number, primary_pediatrician_id, notes, updated_at", rls: "Sim", notes: "1:1 with children" },
  // Calendar
  { module: "Calendario", table: "custody_events", columns: "id, group_id, child_id, responsible_user_id, start_date, end_date, custody_type (regular/holiday/swap/vacation/special), notes, start_time, end_time, is_recurring, recurrence_rule, created_by", rls: "Sim", notes: "Custody calendar events" },
  { module: "Calendario", table: "custody_schedules", columns: "id, group_id, child_id, pattern (JSONB), start_date, months, created_by", rls: "Sim", notes: "14-day custody pattern; unique(group_id, child_id)" },
  { module: "Calendario", table: "calendar_tokens", columns: "id, user_id, group_id, token, created_at", rls: "Sim", notes: "iCal subscription tokens" },
  { module: "Calendario", table: "swap_requests", columns: "id, group_id, requester_id, target_user_id, original_date, proposed_date, reason, status (pending/approved/rejected/cancelled), responded_at", rls: "Sim", notes: "Custody day swap requests" },
  { module: "Calendario", table: "events", columns: "id, group_id, child_id, title, description, event_date, event_time, end_date, all_day, location, image_url, status, assigned_to, created_by", rls: "Sim", notes: "Family/social events" },
  { module: "Calendario", table: "daily_checkins", columns: "id, group_id, child_id, logged_by, checkin_date, category, title, description, created_at", rls: "Sim", notes: "Daily child status logs" },
  // Financial
  { module: "Financeiro", table: "expenses", columns: "id, group_id, child_id, category (enum 8), description, amount, currency, paid_by, split_ratio (JSONB), receipt_url, status (pending/approved/rejected/disputed), expense_date, rejection_reason", rls: "Sim", notes: "Shared expenses with approval workflow" },
  { module: "Financeiro", table: "settlements", columns: "id, group_id, paid_by, paid_to, amount, payment_method, reference_note, status (pending/confirmed/disputed), settlement_date", rls: "Sim", notes: "Payment settlements between parents" },
  // Health
  { module: "Saude", table: "medical_professionals", columns: "id, group_id, name, specialty, crm, phone, whatsapp, address, notes, created_by", rls: "Sim", notes: "Doctors, dentists, therapists" },
  { module: "Saude", table: "medical_appointments", columns: "id, group_id, child_id, professional_id, title, appointment_date, location, status, notes, summary, calendar_event_id, created_by", rls: "Sim", notes: "Status: scheduled -> completed" },
  { module: "Saude", table: "active_medications", columns: "id, group_id, child_id, name, dosage, frequency, frequency_hours, reason, prescribed_by, start_date, end_date, status, notes, created_by", rls: "Sim", notes: "Active medication tracking" },
  { module: "Saude", table: "medication_doses", columns: "id, medication_id, administered_at, administered_by, notes, created_at", rls: "Sim", notes: "Each dose administered" },
  { module: "Saude", table: "illness_episodes", columns: "id, group_id, child_id, title, symptoms (TEXT[]), start_date, end_date, status, diagnosis, hospitalized, severity, notes, created_by", rls: "Sim", notes: "Illness episodes with severity" },
  { module: "Saude", table: "child_allergies", columns: "id, group_id, child_id, name, allergy_type, severity, reaction, created_by", rls: "Sim", notes: "Detailed allergy records" },
  { module: "Saude", table: "vaccination_records", columns: "id, group_id, child_id, vaccine_name, dose_label, administered_date, batch_number, location, notes, created_by", rls: "Sim", notes: "Vaccination card" },
  { module: "Saude", table: "growth_records", columns: "id, group_id, child_id, measured_date, weight_kg, height_cm, head_cm, notes, created_by", rls: "Sim", notes: "WHO growth curve data" },
  { module: "Saude", table: "symptom_entries", columns: "id, group_id, child_id, illness_episode_id, recorded_at, symptom_type (8 types), temperature, intensity (leve/moderado/forte), notes, created_by", rls: "Sim", notes: "Symptom diary; linked to illness episodes" },
  { module: "Saude", table: "health_logs", columns: "id, group_id, child_id, log_type (enum), value, notes, logged_by, logged_at", rls: "Sim", notes: "Legacy health logs" },
  // Activities
  { module: "Atividades", table: "child_activities", columns: "id, group_id, child_id, name, category, recurrence_type, start_date, end_date, days_of_week, time_start, time_end, location, notes, is_active, teacher_name, responsible_id, created_by", rls: "Sim", notes: "Recurring activities" },
  { module: "Atividades", table: "activity_checklist_items", columns: "id, activity_id, name, sort_order, created_at", rls: "Sim", notes: "Default checklist items per activity" },
  { module: "Atividades", table: "checklist_completions", columns: "id, activity_id, item_id, occurrence_date, completed_by, completed_at", rls: "Sim", notes: "Per-occurrence completion; unique(item_id, occurrence_date)" },
  { module: "Atividades", table: "activity_reports", columns: "id, group_id, activity_id, occurrence_date, reported_by, status (completed/missed/cancelled), notes, child_mood, overrides (JSONB), responsible_override", rls: "Sim", notes: "Activity occurrence reports" },
  // Communication
  { module: "Comunicacao", table: "chat_messages", columns: "id, group_id, sender_id, text, audio_url, image_url, reply_to_id, is_pinned, read_by (JSONB), channel_id, created_at", rls: "Sim", notes: "Legally immutable (triggers prevent DELETE and text UPDATE)" },
  { module: "Comunicacao", table: "chat_channels", columns: "id, group_id, slug, name, channel_type (topic/child), child_id, icon, sort_order", rls: "Sim", notes: "Unique(group_id, slug)" },
  { module: "Comunicacao", table: "chat_channel_reads", columns: "id, channel_id, user_id, last_read_at", rls: "Sim", notes: "Unread tracking per user/channel" },
  { module: "Comunicacao", table: "notifications", columns: "id, user_id, type (10 types), title, message, link, is_read, created_at", rls: "Sim", notes: "In-app notifications" },
  { module: "Comunicacao", table: "push_subscriptions", columns: "id, user_id, endpoint, p256dh, auth, created_at", rls: "Sim", notes: "Web Push API (VAPID)" },
  // Governance
  { module: "Governanca", table: "agreements", columns: "id, group_id, title, description, category (5 types), is_non_negotiable, created_by, accepted_by, accepted_at", rls: "Sim", notes: "Coparenting agreements" },
  { module: "Governanca", table: "decisions", columns: "id, group_id, title, description, category (7 types), status (4 types), deadline, created_by, resolved_at", rls: "Sim", notes: "Shared decision-making with voting" },
  { module: "Governanca", table: "decision_votes", columns: "id, decision_id, user_id, vote (concordo/discordo/pensar)", rls: "Sim", notes: "Unique(decision_id, user_id)" },
  { module: "Governanca", table: "decision_arguments", columns: "id, decision_id, user_id, argument_type (pro/contra), text", rls: "Sim", notes: "Pro/contra arguments" },
  { module: "Governanca", table: "sensitive_notes", columns: "id, group_id, child_id, topic (7 types), title, content, source_url, is_urgent, read_by (UUID[]), deletion_requested_by", rls: "Sim", notes: "Sensitive topics with dual-approval deletion" },
  { module: "Governanca", table: "private_notes", columns: "id, user_id, group_id, child_id, category (5 types), title, content, note_date", rls: "Sim", notes: "Private to author only" },
  // Education
  { module: "Educacao", table: "school_logs", columns: "id, group_id, child_id, log_type (9 types), title, description, log_date, attachment_url, logged_by", rls: "Sim", notes: "School updates and logs" },
  { module: "Documentos", table: "documents", columns: "id, group_id, child_id, category (5 types), name, file_url, file_size, mime_type, uploaded_by", rls: "Sim", notes: "Shared documents library" },
  // AI
  { module: "AI", table: "ai_event_logs", columns: "id, user_id, group_id, raw_text, parsed_json (JSONB), success, parser_type, processing_time_ms, ocr_confidence", rls: "Sim", notes: "Invite parsing quality log" },
  { module: "AI", table: "ai_requests", columns: "id, user_id, group_id, provider, feature, success, response_time_ms, error_message", rls: "Sim", notes: "Every AI provider call" },
  { module: "AI", table: "usage_events", columns: "id, user_id, feature, created_at", rls: "Sim", notes: "Feature usage tracking" },
];

const serverActions = [
  { file: "auth.ts", action: "signUp", params: "formData", description: "Cria nova conta de usuario no Supabase Auth" },
  { file: "auth.ts", action: "signIn", params: "formData", description: "Login com email/senha + cookie remember-me" },
  { file: "auth.ts", action: "signOut", params: "-", description: "Logout e limpa cookies de sessao" },
  { file: "auth.ts", action: "resetPassword", params: "formData", description: "Envia email de reset de senha" },
  { file: "auth.ts", action: "signInWithOAuth", params: "provider, redirectPath?", description: "Login OAuth (Google/Apple/Facebook)" },
  { file: "auth.ts", action: "updatePassword", params: "formData", description: "Atualiza senha apos reset" },
  { file: "group.ts", action: "createGroup", params: "formData", description: "Cria novo grupo com usuario como admin" },
  { file: "group.ts", action: "enableCustody", params: "groupId", description: "Ativa features de custodia no grupo" },
  { file: "group.ts", action: "addChild", params: "formData", description: "Adiciona crianca ao grupo (inclui sexo)" },
  { file: "group.ts", action: "updateChild", params: "formData", description: "Atualiza dados da crianca" },
  { file: "group-switch.ts", action: "switchGroup", params: "formData", description: "Troca grupo ativo do usuario" },
  { file: "invitation.ts", action: "createInvitation", params: "formData", description: "Cria e envia convite para o grupo" },
  { file: "invitation.ts", action: "acceptInvitation", params: "token", description: "Aceita convite via token" },
  { file: "invitation.ts", action: "autoAcceptPendingInvitations", params: "-", description: "Auto-aceita convites pendentes por email" },
  { file: "members.ts", action: "changeMemberRole", params: "formData", description: "Altera role de membro (admin/member/readonly)" },
  { file: "members.ts", action: "removeMember", params: "formData", description: "Remove membro do grupo" },
  { file: "members.ts", action: "leaveGroup", params: "formData", description: "Usuario sai do grupo" },
  { file: "calendar.ts", action: "createCustodyEvent", params: "formData", description: "Cria evento de custodia" },
  { file: "calendar.ts", action: "createSwapRequest", params: "formData", description: "Solicita troca de dia de custodia" },
  { file: "calendar.ts", action: "respondToSwapRequest", params: "formData", description: "Aprova/rejeita troca" },
  { file: "calendar.ts", action: "generateSchedule", params: "formData", description: "Gera escala de custodia a partir de padrao 14 dias" },
  { file: "events.ts", action: "createEvent", params: "formData", description: "Cria evento familiar" },
  { file: "events.ts", action: "updateEvent", params: "formData", description: "Atualiza evento" },
  { file: "events.ts", action: "deleteEvent", params: "formData", description: "Deleta evento" },
  { file: "expenses.ts", action: "createExpense", params: "formData", description: "Cria despesa compartilhada com upload de recibo" },
  { file: "expenses.ts", action: "updateExpenseStatus", params: "formData", description: "Aprova/rejeita/disputa despesa" },
  { file: "settlements.ts", action: "createSettlement", params: "formData", description: "Registra pagamento entre pais" },
  { file: "settlements.ts", action: "confirmSettlement", params: "formData", description: "Confirma recebimento de pagamento" },
  { file: "health.ts", action: "createProfessional", params: "formData", description: "Adiciona profissional de saude" },
  { file: "health.ts", action: "createAppointment", params: "formData", description: "Agenda consulta medica" },
  { file: "health.ts", action: "completeAppointment", params: "formData", description: "Marca consulta como concluida com resumo" },
  { file: "health.ts", action: "createMedication", params: "formData", description: "Cria medicamento ativo" },
  { file: "health.ts", action: "logMedicationDose", params: "formData", description: "Registra dose administrada" },
  { file: "health.ts", action: "createIllnessEpisode", params: "formData", description: "Cria episodio de doenca" },
  { file: "health.ts", action: "createAllergy", params: "formData", description: "Adiciona alergia" },
  { file: "health.ts", action: "upsertMedicalInfo", params: "formData", description: "Cria/atualiza info medica (tipo sanguineo, plano, SUS)" },
  { file: "health.ts", action: "createVaccinationRecord", params: "formData", description: "Registra dose de vacina" },
  { file: "health.ts", action: "createVaccinationRecordsBulk", params: "records[]", description: "Insere multiplas vacinas em lote (leitor IA)" },
  { file: "health.ts", action: "createGrowthRecord", params: "formData", description: "Registra medidas de crescimento" },
  { file: "health.ts", action: "regenerateEmergencyToken", params: "formData", description: "Regenera token QR de emergencia" },
  { file: "health.ts", action: "createSymptomEntry", params: "params", description: "Registra entrada no diario de sintomas" },
  { file: "activities.ts", action: "createActivity", params: "formData", description: "Cria atividade recorrente com checklist" },
  { file: "activities.ts", action: "toggleChecklistItem", params: "params", description: "Marca/desmarca item do checklist" },
  { file: "activities.ts", action: "submitActivityReport", params: "formData", description: "Envia relatorio de atividade (completa/faltou/cancelada)" },
  { file: "activities.ts", action: "sendActivityReminders", params: "-", description: "Cron: envia push de atividades de amanha" },
  { file: "decisions.ts", action: "createDecision", params: "formData", description: "Cria decisao para votacao" },
  { file: "decisions.ts", action: "castVote", params: "formData", description: "Vota em decisao (concordo/discordo/pensar)" },
  { file: "agreements.ts", action: "createAgreement", params: "formData", description: "Cria acordo de coparentalidade" },
  { file: "notes.ts", action: "createNote", params: "formData", description: "Cria nota privada" },
  { file: "children.ts", action: "upsertChildEducation", params: "formData", description: "Cria/atualiza dados escolares" },
  { file: "documents.ts", action: "createDocument", params: "formData", description: "Upload de documento compartilhado" },
  { file: "school.ts", action: "createSchoolLog", params: "formData", description: "Cria registro escolar" },
  { file: "sensitive.ts", action: "createSensitiveNote", params: "formData", description: "Cria nota sobre tema sensivel" },
  { file: "chat-channels.ts", action: "ensureDefaultChannels", params: "groupId", description: "Cria canais padrao (geral, financeiro, etc.)" },
  { file: "notifications.ts", action: "markAllNotificationsRead", params: "-", description: "Marca todas notificacoes como lidas" },
  { file: "profile.ts", action: "updateProfile", params: "formData", description: "Atualiza perfil do usuario" },
  { file: "checkin.ts", action: "createCheckin", params: "formData", description: "Cria check-in diario da crianca" },
];

const apiRoutes = [
  { route: "/api/create-group", method: "POST", auth: "Sim", description: "Cria grupo durante onboarding (bypass RLS bootstrap)" },
  { route: "/api/auth/signout", method: "GET", auth: "Sim", description: "Logout server-side, limpa cookies, redireciona /login" },
  { route: "/api/auth/test-login", method: "GET", auth: "Nao", description: "Login de teste (dev only). Rate limited: 5/min" },
  { route: "/api/calendar/[token]", method: "GET", auth: "Token", description: "Feed iCal (.ics) para assinatura de calendario" },
  { route: "/api/chat/messages", method: "GET", auth: "Sim", description: "Mensagens paginadas de chat (verifica membership)" },
  { route: "/api/chat/export", method: "GET", auth: "Sim", description: "Exporta canal de chat como PDF" },
  { route: "/api/push/subscribe", method: "POST/DELETE", auth: "Sim", description: "Registra/remove Web Push subscription (VAPID)" },
  { route: "/api/push/chat", method: "POST", auth: "Sim", description: "Envia push para membros ao enviar mensagem" },
  { route: "/api/ai/assistant", method: "POST", auth: "Sim", description: "Assistente IA com 12 tools (Groq -> Together -> Gemini)" },
  { route: "/api/ai/parse-invite", method: "POST", auth: "Sim", description: "Parseia convite de festa via OCR + LLM" },
  { route: "/api/ai/parse-vaccines", method: "POST", auth: "Sim", description: "Parseia carteirinha de vacinacao via visao IA" },
  { route: "/api/ai/context", method: "GET", auth: "Sim", description: "Retorna criancas + nomes de membros para parser local" },
  { route: "/api/cron/activity-reminders", method: "GET", auth: "Cron", description: "Cron diario: lembretes de atividades + relatorios pendentes" },
  { route: "/api/cron/custody-change", method: "GET", auth: "Cron", description: "Cron diario: notifica troca de custodia amanha" },
  { route: "/api/health/emergency/[childId]", method: "GET", auth: "Token", description: "Dados de emergencia publica via QR code" },
];

const pages = [
  { module: "Dashboard", route: "/dashboard", description: "Painel principal: custodia de hoje, eventos proximos, acoes rapidas" },
  { module: "Calendario", route: "/calendario", description: "Calendario mensal/semanal com custodia, eventos e consultas" },
  { module: "Calendario", route: "/calendario/novo", description: "Criar novo evento de custodia ou familiar" },
  { module: "Calendario", route: "/calendario/escala", description: "Configurar padrao de custodia 14 dias" },
  { module: "Calendario", route: "/calendario/convite", description: "Parser IA de convites de festa (upload imagem)" },
  { module: "Chat", route: "/chat", description: "Chat em tempo real com canais, fixar, responder, push, export PDF" },
  { module: "Financeiro", route: "/financeiro", description: "Dashboard financeiro: saldo, acerto, historico" },
  { module: "Financeiro", route: "/despesas", description: "Lista de despesas com workflow de aprovacao" },
  { module: "Financeiro", route: "/despesas/nova", description: "Nova despesa com upload de recibo" },
  { module: "Familia", route: "/familia", description: "Gestao do grupo: membros, roles, convites" },
  { module: "Criancas", route: "/criancas", description: "Lista de criancas do grupo" },
  { module: "Criancas", route: "/criancas/nova", description: "Adicionar nova crianca (com campo sexo)" },
  { module: "Criancas", route: "/criancas/[id]", description: "Perfil detalhado: tabs Geral, Saude, Documentos, Escola" },
  { module: "Saude", route: "/saude", description: "Hub de saude: alergias, medicamentos, consultas, crescimento, vacinas" },
  { module: "Saude", route: "/saude/consultas", description: "Lista de consultas medicas" },
  { module: "Saude", route: "/saude/consultas/nova", description: "Agendar nova consulta" },
  { module: "Saude", route: "/saude/consultas/resumo", description: "Resumo pre-consulta: historico desde ultima visita" },
  { module: "Saude", route: "/saude/medicamentos", description: "Medicamentos ativos com log de doses" },
  { module: "Saude", route: "/saude/medicamentos/novo", description: "Adicionar novo medicamento" },
  { module: "Saude", route: "/saude/doencas", description: "Episodios de doenca" },
  { module: "Saude", route: "/saude/doencas/nova", description: "Registrar novo episodio de doenca" },
  { module: "Saude", route: "/saude/alergias", description: "Lista de alergias" },
  { module: "Saude", route: "/saude/alergias/nova", description: "Adicionar alergia" },
  { module: "Saude", route: "/saude/vacinas", description: "Registros de vacinacao" },
  { module: "Saude", route: "/saude/vacinas/nova", description: "Registrar vacina (manual ou IA)" },
  { module: "Saude", route: "/saude/vacinas/carteirinha", description: "Carteirinha digital de vacinacao + leitor IA" },
  { module: "Saude", route: "/saude/crescimento", description: "Curvas de crescimento OMS com percentis" },
  { module: "Saude", route: "/saude/crescimento/novo", description: "Registrar medidas (peso, altura, PC)" },
  { module: "Saude", route: "/saude/profissionais", description: "Lista de profissionais de saude" },
  { module: "Saude", route: "/saude/emergencia", description: "Cartao de emergencia com QR code publico" },
  { module: "Saude", route: "/saude/sintomas", description: "Diario de sintomas: registro rapido + timeline" },
  { module: "Saude", route: "/saude/export", description: "Exportar dados de saude" },
  { module: "Atividades", route: "/atividades", description: "Atividades recorrentes com checklist de mochila" },
  { module: "Atividades", route: "/atividades/nova", description: "Criar atividade recorrente" },
  { module: "Eventos", route: "/eventos", description: "Eventos familiares" },
  { module: "Check-in", route: "/checkin", description: "Check-in diario da crianca (humor, refeicoes, escola)" },
  { module: "Acordos", route: "/acordos", description: "Acordos de coparentalidade" },
  { module: "Decisoes", route: "/decisoes", description: "Decisoes compartilhadas com votacao" },
  { module: "Notas", route: "/notas", description: "Notas privadas (visiveis so para o autor)" },
  { module: "Documentos", route: "/documentos", description: "Biblioteca de documentos compartilhados" },
  { module: "Escola", route: "/escola", description: "Registros escolares (notas, reunioes, comportamento)" },
  { module: "Sensivel", route: "/temas-sensiveis", description: "Temas sensiveis (violencia, bullying, saude mental)" },
  { module: "Notificacoes", route: "/notificacoes", description: "Central de notificacoes" },
  { module: "Perfil", route: "/perfil", description: "Perfil, idioma, push, tema" },
  { module: "Onboarding", route: "/onboarding", description: "Fluxo de novo usuario: criar grupo, add crianca" },
];

const integrations = [
  { integration: "Supabase Auth", type: "Autenticacao", description: "Email/senha, OAuth (Google, Apple, Facebook), magic link, reset de senha", config: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY" },
  { integration: "Supabase Database", type: "Banco de Dados", description: "PostgreSQL com RLS em todas as tabelas, 38 migrations", config: "SUPABASE_SERVICE_ROLE_KEY (admin)" },
  { integration: "Supabase Realtime", type: "Real-time", description: "Subscricoes em chat_messages para atualizacao instantanea", config: "Habilitado no Supabase dashboard" },
  { integration: "Supabase Storage", type: "Armazenamento", description: "Upload de fotos de perfil, recibos, documentos, fotos de chat", config: "Buckets: avatars, receipts, documents, chat-images" },
  { integration: "Groq", type: "IA (Primario)", description: "LLM llama-4-scout: assistente, parser de convites, leitor de vacinas. 30 req/min free", config: "GROQ_API_KEY" },
  { integration: "Together AI", type: "IA (Fallback 1)", description: "Llama-Vision-Free: fallback para visao e texto. Free tier", config: "TOGETHER_API_KEY" },
  { integration: "Google Gemini", type: "IA (Fallback 2)", description: "gemini-2.0-flash: ultimo fallback. 15 RPM, 1500 req/dia free", config: "GEMINI_API_KEY" },
  { integration: "Tesseract.js", type: "OCR", description: "OCR client-side para parser de convites de festa", config: "N/A (bundled)" },
  { integration: "Web Push (VAPID)", type: "Notificacoes", description: "Push notifications para atividades, custodia, chat, despesas", config: "NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY" },
  { integration: "PostHog", type: "Analytics", description: "Tracking de eventos de uso por feature e usuario", config: "NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST" },
  { integration: "Sentry", type: "Monitoramento", description: "Error tracking em producao", config: "SENTRY_DSN" },
  { integration: "Vercel", type: "Hosting", description: "Deploy automatico via GitHub. Turbopack build. Edge functions.", config: "Vinculado a hdpedro/CoPais" },
  { integration: "Capacitor", type: "Mobile (iOS)", description: "Bundle ID: com.kindar.app. StatusBar, SplashScreen, Haptics, Keyboard", config: "capacitor.config.ts" },
  { integration: "iCal (RFC 5545)", type: "Calendario", description: "Feed .ics para assinatura em Google Calendar, Apple Calendar", config: "/api/calendar/[token]" },
];

const businessRules = [
  { module: "Autenticacao", rule: "Remember Me", description: "Cookie 'kindar-remember-me' com duracao de 30 dias. Safari ITP recovery via localStorage backup." },
  { module: "Autenticacao", rule: "Multi-grupo", description: "Usuario pode pertencer a multiplos grupos. Cookie 'active-group' armazena grupo ativo." },
  { module: "Autorizacao", rule: "Roles", description: "3 roles: admin (CRUD total), member (CRUD proprio), readonly (apenas leitura). Admin pode mudar roles de outros." },
  { module: "Autorizacao", rule: "RLS", description: "Todas as tabelas tem RLS. Funcao is_group_member(group_id) verifica pertencimento." },
  { module: "Custodia", rule: "Progressive Disclosure", description: "Features de custodia ficam ocultas ate custody_enabled=true. Ativado ao criar escala ou manualmente." },
  { module: "Custodia", rule: "Padrao 14 dias", description: "Escala gerada a partir de padrao de 14 dias, aplicado por N meses. Gera custody_events em lote." },
  { module: "Custodia", rule: "Trocas", description: "Swap requests: requester propoe, target aprova/rejeita. Eventos atualizados automaticamente." },
  { module: "Financeiro", rule: "Workflow despesas", description: "pending -> approved/rejected/disputed. Apenas admin ou membro nao-autor pode aprovar." },
  { module: "Financeiro", rule: "Split ratio", description: "JSONB com percentual por membro. Default: 50/50. Calculo de saldo: total pago - quota devida." },
  { module: "Saude", rule: "Percentil OMS", description: "Interpolacao linear entre P3/P15/P50/P85/P97 para peso e altura, 0-60 meses, por sexo." },
  { module: "Saude", rule: "Diario sintomas", description: "8 tipos de sintoma. Vinculacao automatica a illness_episode ativo. Compartilhar via clipboard." },
  { module: "Saude", rule: "Resumo pre-consulta", description: "Busca todos os dados de saude desde ultima consulta concluida. Copy + print ready." },
  { module: "Saude", rule: "QR Emergencia", description: "Token UUID unico por crianca. Pagina publica mostra alergias, medicamentos, tipo sanguineo, contatos." },
  { module: "Saude", rule: "Leitor vacinas IA", description: "Upload foto -> vision AI extrai vacinas -> preview editavel -> bulk insert." },
  { module: "Chat", rule: "Imutabilidade legal", description: "Triggers SQL impedem DELETE e UPDATE de texto em chat_messages. Garantia juridica." },
  { module: "Chat", rule: "Moderacao de tom", description: "Detecta linguagem agressiva (CAPS, ataques pessoais) e sugere reescrita neutra." },
  { module: "IA", rule: "Router multi-provider", description: "Groq (primario) -> Together (fallback 1) -> Gemini (fallback 2). Skip se API key nao configurada." },
  { module: "IA", rule: "Usage gating", description: "Limite diario por usuario. Tabela usage_events rastreia cada uso." },
  { module: "IA", rule: "12 tools assistente", description: "createExpense, checkCustody, addEvent, listActivities, etc. Function calling com intent detection local." },
  { module: "Atividades", rule: "Checklist mochila", description: "Itens de checklist por atividade. Completions por data de ocorrencia. Lembretes push na vespera." },
  { module: "Atividades", rule: "Relatorios", description: "Apos cada ocorrencia: completa/faltou/cancelada + humor da crianca. Lembrete automatico se pendente." },
  { module: "Decisoes", rule: "Votacao", description: "3 opcoes: concordo, discordo, vou pensar. Argumentos pro/contra. Status: aberta -> aprovada/rejeitada/expirada." },
  { module: "Sensivel", rule: "Delecao dual", description: "Nota sensivel so pode ser deletada com aprovacao de ambos os pais. Workflow: request -> approve." },
  { module: "i18n", rule: "5 idiomas", description: "PT (padrao), EN, ES, FR, DE. ~1488 keys por locale, 40 secoes. Locale salvo em profiles.locale." },
  { module: "Notificacoes", rule: "Push Web", description: "VAPID Web Push para atividades, custodia, chat, despesas. Cron jobs as 20h BRT." },
];

const metrics = [
  { metric: "Tabelas no banco", value: "38" },
  { metric: "Migrations SQL", value: "37" },
  { metric: "Server Actions (funcoes)", value: "84+" },
  { metric: "API Routes", value: "15" },
  { metric: "Paginas protegidas", value: "52" },
  { metric: "Idiomas suportados", value: "5 (PT, EN, ES, FR, DE)" },
  { metric: "Keys i18n por locale", value: "~1488" },
  { metric: "Secoes i18n", value: "40" },
  { metric: "Testes unitarios", value: "262" },
  { metric: "Provedores de IA", value: "3 (Groq, Together, Gemini)" },
  { metric: "Tools do assistente IA", value: "12" },
  { metric: "Framework", value: "Next.js 16 (App Router, Turbopack)" },
  { metric: "React", value: "19" },
  { metric: "TypeScript", value: "5" },
  { metric: "CSS", value: "Tailwind CSS 4" },
  { metric: "Database", value: "PostgreSQL (Supabase)" },
  { metric: "Hosting", value: "Vercel (production)" },
  { metric: "Mobile", value: "Capacitor 7 (iOS)" },
  { metric: "Dominio", value: "kindar.com.br" },
];

// ═══════════════════════════════════════════════════════════════
// BUILD WORKBOOK
// ═══════════════════════════════════════════════════════════════
const wb = new ExcelJS.Workbook();
wb.creator = "Kindar Documentation Generator";
wb.created = new Date();

// ── 1. Visao Geral ──
{
  const ws = wb.addWorksheet("Visao Geral", { properties: { tabColor: { argb: PRIMARY } } });
  ws.columns = [
    { header: "Metrica", key: "metric", width: 35 },
    { header: "Valor", key: "value", width: 50 },
  ];
  addTitle(ws, "Kindar — Visao Geral do Projeto", "Gerado em " + new Date().toLocaleDateString("pt-BR") + " | kindar.com.br", 2);
  const headerRow = ws.addRow(["Metrica", "Valor"]);
  styleHeader(headerRow, 2);
  const start = ws.rowCount + 1;
  metrics.forEach(m => ws.addRow([m.metric, m.value]));
  addAltRows(ws, start, ws.rowCount, 2);
}

// ── 2. Banco de Dados ──
{
  const ws = wb.addWorksheet("Banco de Dados", { properties: { tabColor: { argb: "FF10B981" } } });
  ws.columns = [
    { header: "Modulo", key: "module", width: 14 },
    { header: "Tabela", key: "table", width: 24 },
    { header: "Colunas", key: "columns", width: 80 },
    { header: "RLS", key: "rls", width: 6 },
    { header: "Notas", key: "notes", width: 50 },
  ];
  addTitle(ws, "Banco de Dados — 38 Tabelas", "PostgreSQL (Supabase) com Row Level Security em todas as tabelas", 5);
  const headerRow = ws.addRow(["Modulo", "Tabela", "Colunas", "RLS", "Notas"]);
  styleHeader(headerRow, 5);
  const start = ws.rowCount + 1;
  tables.forEach(t => ws.addRow([t.module, t.table, t.columns, t.rls, t.notes]));
  addAltRows(ws, start, ws.rowCount, 5);
}

// ── 3. Server Actions ──
{
  const ws = wb.addWorksheet("Server Actions", { properties: { tabColor: { argb: "FF3B82F6" } } });
  ws.columns = [
    { header: "Arquivo", key: "file", width: 22 },
    { header: "Action", key: "action", width: 32 },
    { header: "Parametros", key: "params", width: 28 },
    { header: "Descricao", key: "description", width: 60 },
  ];
  addTitle(ws, "Server Actions — 84+ funcoes", "src/actions/*.ts | Padrao: FormData + getAuthenticatedUser + verifyMembership", 4);
  const headerRow = ws.addRow(["Arquivo", "Action", "Parametros", "Descricao"]);
  styleHeader(headerRow, 4);
  const start = ws.rowCount + 1;
  serverActions.forEach(a => ws.addRow([a.file, a.action, a.params, a.description]));
  addAltRows(ws, start, ws.rowCount, 4);
}

// ── 4. API Routes ──
{
  const ws = wb.addWorksheet("API Routes", { properties: { tabColor: { argb: "FFEF4444" } } });
  ws.columns = [
    { header: "Rota", key: "route", width: 38 },
    { header: "Metodo", key: "method", width: 14 },
    { header: "Auth", key: "auth", width: 10 },
    { header: "Descricao", key: "description", width: 65 },
  ];
  addTitle(ws, "API Routes — 15 endpoints", "src/app/api/** | RESTful com autenticacao Supabase", 4);
  const headerRow = ws.addRow(["Rota", "Metodo", "Auth", "Descricao"]);
  styleHeader(headerRow, 4);
  const start = ws.rowCount + 1;
  apiRoutes.forEach(r => ws.addRow([r.route, r.method, r.auth, r.description]));
  addAltRows(ws, start, ws.rowCount, 4);
}

// ── 5. Paginas ──
{
  const ws = wb.addWorksheet("Paginas", { properties: { tabColor: { argb: "FFF59E0B" } } });
  ws.columns = [
    { header: "Modulo", key: "module", width: 16 },
    { header: "Rota", key: "route", width: 36 },
    { header: "Descricao", key: "description", width: 70 },
  ];
  addTitle(ws, "Paginas da Aplicacao — 52 rotas protegidas", "src/app/(app)/** | Todas requerem autenticacao", 3);
  const headerRow = ws.addRow(["Modulo", "Rota", "Descricao"]);
  styleHeader(headerRow, 3);
  const start = ws.rowCount + 1;
  pages.forEach(p => ws.addRow([p.module, p.route, p.description]));
  addAltRows(ws, start, ws.rowCount, 3);
}

// ── 6. Integracoes ──
{
  const ws = wb.addWorksheet("Integracoes", { properties: { tabColor: { argb: "FF8B5CF6" } } });
  ws.columns = [
    { header: "Integracao", key: "integration", width: 22 },
    { header: "Tipo", key: "type", width: 20 },
    { header: "Descricao", key: "description", width: 65 },
    { header: "Configuracao", key: "config", width: 50 },
  ];
  addTitle(ws, "Integracoes Externas — 14 servicos", "Stack: Supabase + Vercel + 3 provedores IA + Capacitor", 4);
  const headerRow = ws.addRow(["Integracao", "Tipo", "Descricao", "Configuracao"]);
  styleHeader(headerRow, 4);
  const start = ws.rowCount + 1;
  integrations.forEach(i => ws.addRow([i.integration, i.type, i.description, i.config]));
  addAltRows(ws, start, ws.rowCount, 4);
}

// ── 7. Regras de Negocio ──
{
  const ws = wb.addWorksheet("Regras de Negocio", { properties: { tabColor: { argb: "FFEC4899" } } });
  ws.columns = [
    { header: "Modulo", key: "module", width: 16 },
    { header: "Regra", key: "rule", width: 28 },
    { header: "Descricao", key: "description", width: 90 },
  ];
  addTitle(ws, "Regras de Negocio — 25 regras principais", "Logica de dominio e fluxos criticos do Kindar", 3);
  const headerRow = ws.addRow(["Modulo", "Regra", "Descricao"]);
  styleHeader(headerRow, 3);
  const start = ws.rowCount + 1;
  businessRules.forEach(r => ws.addRow([r.module, r.rule, r.description]));
  addAltRows(ws, start, ws.rowCount, 3);
}

// ── Write ──
await wb.xlsx.writeFile(OUTPUT);
console.log(`Excel gerado com sucesso: ${OUTPUT}`);
console.log(`Abas: ${wb.worksheets.map(s => s.name).join(", ")}`);
