-- ============================================================================
-- Migration 00090: reminder_lead_minutes em child_activities
--
-- Substitui granularidade hoje só em horas (notify_hours_before INTEGER, default 24,
-- adicionada em 00010 e NUNCA usada por nenhum cron) por minutos — permite
-- 30/60/120, e dois sentinels:
--   -1  = "manhã do dia, 08:00 hora local (BRT)"
--   -2  = "véspera às 20:00 hora local (BRT)" — comportamento legado
--    0  = "sem lembrete"
--    >0 = minutos antes do evento (60 = 1h, 120 = 2h…)
--  NULL = usa default do service (60 = 1h, padrão premium).
--
-- notify_hours_before é mantido (não-destrutivo, regra append-only do projeto)
-- mas marcado como deprecated. Backfill 1:1 (hours*60).
-- ============================================================================

ALTER TABLE public.child_activities
  ADD COLUMN IF NOT EXISTS reminder_lead_minutes INTEGER;

-- Backfill: hours_before * 60 quando existir; NULL preserva default semântico.
UPDATE public.child_activities
  SET reminder_lead_minutes = notify_hours_before * 60
  WHERE notify_hours_before IS NOT NULL
    AND reminder_lead_minutes IS NULL;

COMMENT ON COLUMN public.child_activities.reminder_lead_minutes IS
  'Minutos antes do evento pra notificar. NULL=default service (60min). 0=sem lembrete. -1=manhã do dia 08:00 BRT. -2=véspera 20:00 BRT. >0=minutos antes do event_at.';

COMMENT ON COLUMN public.child_activities.notify_hours_before IS
  'DEPRECATED — usar reminder_lead_minutes. Mantido por compat até 2027 (regra append-only).';
