-- ─────────────────────────────────────────────────────────────────────
-- Migration 00093: notification_preferences (user-facing notif control)
--
-- Atende Fase C do plano de alertas (CLAUDE.md → project_kindar_activity_
-- reminders): "Tela perfil/notificacoes: quiet hours, lead default per-
-- user, only_as_responsible".
--
-- Schema JSONB pra evitar N colunas + permite extensão sem migration.
-- Defaults sensatos pra users existentes — não bombardeia ninguém que
-- já tava acostumado com push ativo.
--
-- SHAPE:
-- {
--   "quiet_hours": {
--     "enabled": boolean,         // default false (não silencia ngm sem opt-in)
--     "start": "HH:MM",            // "22:00" — local time (TZ do user)
--     "end": "HH:MM",              // "07:00"
--   },
--   "mute_until": ISO string|null, // mute global temporário ("até 22h hoje")
--   "categories": {                // toggle por tipo, default todos true
--     "activity_reminders": boolean,
--     "activity_digest": boolean,
--     "vaccine_alerts": boolean,
--     "chat": boolean,
--     "school_collab": boolean,
--     "expense_collab": boolean,
--     "health_collab": boolean,
--     "decisions": boolean,
--     "swap": boolean,
--     "retention": boolean,        // marketing-ish — pode mutar
--     "birthday": boolean,
--     "balance_operations": boolean,
--     "settlements": boolean
--   }
-- }
--
-- Server respeita via `shouldSendPush(userId, recordType)` helper — vide
-- src/lib/services/notification-prefs.ts.
--
-- TZ do user: profiles.locale dá país por convenção (pt-BR → America/Sao_Paulo).
-- Pra MVP, hardcode BRT (BR sem DST desde 2019). Pós-MVP: profiles.timezone.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT
    '{"quiet_hours": {"enabled": false, "start": "22:00", "end": "07:00"}, "mute_until": null, "categories": {}}'::jsonb;

-- Sem CHECK constraint forte — JSONB livre permite extensão. Validação
-- forte vive no helper TS (shouldSendPush).

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Preferências de notificação per-user. Shape: {quiet_hours, mute_until, categories}. Default permissivo (todos os tipos ativos, quiet hours off) — user opta-out granular via /perfil/notificacoes.';

-- Index opcional pra mute_until rápido (cron quer skipar muted users)
-- Usamos expression index porque o campo é nested.
CREATE INDEX IF NOT EXISTS idx_profiles_mute_until
  ON public.profiles ((notification_prefs ->> 'mute_until'))
  WHERE notification_prefs ->> 'mute_until' IS NOT NULL;
