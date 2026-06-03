-- ============================================================================
-- Migration 00107: snooze ("Adiar") do follow-up "Aconteceu?" + canal
-- 'followup' no ledger de lembretes.
--
-- O DESFECHO real (aconteceu / não aconteceu) REUSA a tabela existente
-- `activity_reports` (migration 00023: status 'completed'/'missed'/'cancelled'
-- + notes + child_mood, UNIQUE(activity_id, occurrence_date)). Os quick actions
-- Sim/Não do push de follow-up escrevem lá (Sim → completed, Não → missed).
--
-- Esta migration só adiciona o que `activity_reports` NÃO cobre: o "Adiar"
-- (snooze) — re-pergunta o follow-up após snooze_until. Feedback Amanda
-- (themes 1+2): "1h depois → aconteceu? Sim / Não / Adiar".
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_followup_snoozes (
  activity_id     UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  snooze_until    TIMESTAMPTZ NOT NULL,
  snoozed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_activity_followup_snoozes_until
  ON public.activity_followup_snoozes(snooze_until);

ALTER TABLE public.activity_followup_snoozes ENABLE ROW LEVEL SECURITY;

-- Membership via child_activities.group_id → group_members. auth.uid() em
-- subselect (padrão initplan 00098-00100).
CREATE POLICY "Group members can view followup snoozes"
  ON public.activity_followup_snoozes FOR SELECT
  USING (
    activity_id IN (
      SELECT id FROM public.child_activities
        WHERE group_id IN (
          SELECT group_id FROM public.group_members WHERE user_id = (select auth.uid())
        )
    )
  );

CREATE POLICY "Group members can insert followup snoozes"
  ON public.activity_followup_snoozes FOR INSERT
  WITH CHECK (
    snoozed_by = (select auth.uid())
    AND activity_id IN (
      SELECT id FROM public.child_activities
        WHERE group_id IN (
          SELECT group_id FROM public.group_members WHERE user_id = (select auth.uid())
        )
    )
  );

CREATE POLICY "Group members can update followup snoozes"
  ON public.activity_followup_snoozes FOR UPDATE
  USING (
    activity_id IN (
      SELECT id FROM public.child_activities
        WHERE group_id IN (
          SELECT group_id FROM public.group_members WHERE user_id = (select auth.uid())
        )
    )
  );

COMMENT ON TABLE public.activity_followup_snoozes IS
  'Snooze ("Adiar") do follow-up de atividade. O desfecho real vive em activity_reports (00023). Cron re-pergunta após snooze_until. Read/Write = group members.';

-- Estende o ledger de idempotência pra cobrir o canal do follow-up.
-- Antes: ('push','local','digest','briefing'). Adiciona 'followup'.
ALTER TABLE public.activity_reminder_sends
  DROP CONSTRAINT IF EXISTS activity_reminder_sends_channel_check;
ALTER TABLE public.activity_reminder_sends
  ADD CONSTRAINT activity_reminder_sends_channel_check
  CHECK (channel IN ('push', 'local', 'digest', 'briefing', 'followup'));
