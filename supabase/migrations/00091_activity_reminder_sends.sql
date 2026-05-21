-- ============================================================================
-- Migration 00091: activity_reminder_sends — ledger de idempotência
--
-- Padrão espelhado de vaccine_notification_dismissals: garante que re-rodar
-- o cron /api/cron/activity-due-reminders 100× no mesmo slot insere 1 vez só
-- (ON CONFLICT DO NOTHING) e não envia push duplicado.
--
-- Channels:
--   'push'   = T-(lead) server-side
--   'local'  = registrado pelo native quando local notification dispara
--              (observabilidade — não bloqueia push)
--   'digest' = D-1 noite agregado por usuário
--
-- TTL: rows ficam por tempo indefinido (~365 dias) — tamanho irrelevante
-- (10 atividades × 14 occurrences × 3 leads × 2 users × 2 channels = 1680 rows/grupo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_reminder_sends (
  activity_id     UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  lead_minutes    INTEGER NOT NULL,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('push', 'local', 'digest')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, occurrence_date, lead_minutes, user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_activity_reminder_sends_user_recent
  ON public.activity_reminder_sends(user_id, sent_at DESC);

ALTER TABLE public.activity_reminder_sends ENABLE ROW LEVEL SECURITY;

-- READ: membros do grupo da atividade. Service role bypassa RLS.
CREATE POLICY "Group members can view reminder sends"
  ON public.activity_reminder_sends FOR SELECT
  USING (
    activity_id IN (
      SELECT id FROM public.child_activities
        WHERE group_id IN (
          SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
        )
    )
  );

-- WRITE/DELETE: ninguém via auth.uid() — só service role (cron + Foundation).
-- Sem policy = sem permissão por padrão (RLS denial).

COMMENT ON TABLE public.activity_reminder_sends IS
  'Ledger de notificações de atividade enviadas. Idempotência do cron. Read = group members. Write = service role only.';
