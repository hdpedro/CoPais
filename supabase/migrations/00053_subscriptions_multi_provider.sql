-- Allow a user to have active subscriptions on multiple platforms
-- simultaneously (e.g. Apple IAP on iOS + Stripe on web). Pre-existing
-- unique index was on user_id alone, which blocked the second insert
-- and forced the stripe webhook to expire all rows on renew — risk of
-- wiping an Apple sub when the user subscribes via web.
--
-- The new constraint is (user_id, payment_provider) so each provider
-- maintains its own row independently. The webhook fix in
-- src/app/api/stripe/webhook/route.ts scopes expiration by provider
-- to match this.

DROP INDEX IF EXISTS public.idx_subscriptions_active_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_user_provider
  ON public.subscriptions(user_id, payment_provider)
  WHERE status IN ('active', 'trialing', 'past_due');
