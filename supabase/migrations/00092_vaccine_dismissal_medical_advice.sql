-- ─────────────────────────────────────────────────────────────────────
-- Migration 00092: medical_advice como motivo de dismissal vacinal
--
-- Contexto: Angelino Barata (21/05/2026) reportou que o app não permite
-- registrar quando o pediatra recomendou NÃO dar uma vacina específica.
-- Antes: snoozed_7d | snoozed_30d | already_scheduled (todos snooze curto).
-- Agora: + medical_advice — TTL 365 dias (recomendação clínica é estável;
-- ao expirar, motor reabre pra revalidação do responsável).
--
-- Padrão "dismissal_until com TTL longo" mantém consistência com o resto
-- do engine (sem flag `permanently_dismissed`). Usuário pode re-snooze ao
-- expirar; cron `vaccine-snooze-reentry` NÃO trata esse reason (sem push
-- suave de reentrada — pediatra disse pra não dar, não vamos cobrar de novo).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.vaccine_notification_dismissals
  DROP CONSTRAINT IF EXISTS vaccine_notification_dismissals_reason_check;

ALTER TABLE public.vaccine_notification_dismissals
  ADD CONSTRAINT vaccine_notification_dismissals_reason_check
  CHECK (reason IN ('snoozed_7d', 'snoozed_30d', 'already_scheduled', 'medical_advice'));

COMMENT ON COLUMN public.vaccine_notification_dismissals.reason IS
  'snoozed_7d / snoozed_30d: snooze curto user-initiated. already_scheduled: appointment criado (cron reabre se cancelado). medical_advice: pediatra recomendou não administrar — TTL 365d, sem push de reentrada.';
