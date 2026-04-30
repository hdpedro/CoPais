-- ============================================================
-- WEBHOOK IDEMPOTENCY — dedupe Stripe + RevenueCat events
-- ============================================================
-- Both Stripe and RevenueCat retry webhooks aggressively (up to 3 days).
-- Without dedup, a re-delivery of `checkout.session.completed` or
-- `INITIAL_PURCHASE` creates duplicate subscription rows and the
-- `invoice.payment_succeeded` retry creates duplicate split expenses.
--
-- The expenses dedup we already have via (source_subscription_id,
-- source_period_start) unique index — but the subscription itself has
-- no such guard.
--
-- Solution: a generic webhook_events table that stores every event_id
-- we've seen. Webhook handlers check before processing and short-circuit
-- on duplicates with a 200 response (Stripe/RC won't retry).
--
-- Auto-vacuum policy: 90 days of history is enough for any reasonable
-- retry window. A daily cron prunes older rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'revenuecat')),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at DESC);

-- RLS: only service role can read/write. Webhook handlers use admin client.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = nobody but service role can touch it. Intentional.

COMMENT ON TABLE public.webhook_events IS
  'Idempotency log for Stripe + RC webhooks. INSERT before processing, ON CONFLICT short-circuits duplicates.';
