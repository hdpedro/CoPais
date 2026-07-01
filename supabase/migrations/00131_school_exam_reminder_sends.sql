-- ============================================================
-- MIGRATION 131: idempotência do lembrete de PROVA (véspera 20h)
--
-- O lembrete da véspera das provas do Brain (agora em school_logs/events) NÃO
-- pode reusar `activity_reminder_sends` — aquela tabela tem FK real
-- `activity_id → child_activities ON DELETE CASCADE`, e prova não é
-- child_activity. Tabela de idempotência PRÓPRIA, keyed no school_log.
--
-- O cron `runSchoolExamReminders` (a cada 15min) insere 1 linha por
-- (school_log, event_date, lead, user, channel) após enviar o push — a PK
-- garante que o mesmo lembrete não sai 2x (mesmo em jitter/retry do cron).
-- Sem policies: acesso só via service_role (o cron), igual à outra.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.school_reminder_sends (
  school_log_id UUID NOT NULL,
  event_date    DATE NOT NULL,
  lead_minutes  INT  NOT NULL,
  user_id       UUID NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'push',
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_log_id, event_date, lead_minutes, user_id, channel)
);

ALTER TABLE public.school_reminder_sends ENABLE ROW LEVEL SECURITY;
-- (nenhuma policy: só service_role acessa — o cron. Clientes não leem/escrevem.)
