-- 00096_subscriptions_is_sandbox.sql
-- Mark subscriptions originating from sandbox StoreKit / Stripe test mode so
-- production dashboards can filter them out. Pre-blocker B1 (RevenueCat
-- sandbox filter at the webhook), historical rows may have been created from
-- sandbox events on this DB — we need a way to identify and exclude them
-- without deleting (the rows still belong to the original user).
--
-- Policy:
--   - DEFAULT false. Real Stripe/IAP subs are always production.
--   - Webhook handlers in preview/dev environments will set this true when
--     persisting sandbox events.
--   - View `v_group_active_subscription` filters by `is_sandbox = false` so
--     test rows never grant production access.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

-- Update the view to filter sandbox rows out of the production access path.
-- The DROP+CREATE is intentional: PG views can't ALTER if the column list
-- changes; here we keep the same shape so consumers don't break.
DROP VIEW IF EXISTS public.v_group_active_subscription;

CREATE VIEW public.v_group_active_subscription AS
SELECT DISTINCT ON (coparenting_group_id)
  coparenting_group_id AS group_id,
  id AS subscription_id,
  user_id AS payer_user_id,
  plan_id,
  status,
  trial_end,
  current_period_end,
  cancel_at_period_end,
  payment_provider
FROM public.subscriptions s
WHERE coparenting_group_id IS NOT NULL
  AND status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text])
  AND is_sandbox = false  -- new: exclude sandbox rows from production access
ORDER BY
  coparenting_group_id,
  CASE status
    WHEN 'active' THEN 1
    WHEN 'trialing' THEN 2
    WHEN 'past_due' THEN 3
    ELSE 4
  END,
  created_at DESC;

COMMENT ON COLUMN public.subscriptions.is_sandbox IS
  'True if this row came from StoreKit sandbox / Stripe test mode. Production access views filter this out. Set by webhook handlers in preview/dev deploys (post-B1 fix 2026-05-25).';
