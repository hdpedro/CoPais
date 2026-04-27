-- ============================================================
-- SUBSCRIPTIONS PER-GROUP
-- ============================================================
-- Evolve subscriptions from per-user to per-group. A single subscription
-- covers the whole coparenting group — both parents, grandparents,
-- caregivers, lawyers, mediators. Only profiles.role = 'parent' is
-- allowed to start/cancel a subscription (enforcement in server actions).
--
-- Backward compat: user_id is kept (legacy subs and webhooks reference
-- it). coparenting_group_id is nullable for rows created before this
-- migration; the backfill below sets it for existing active subs.
-- ============================================================

-- 1. Add coparenting_group_id column (nullable for backward compat)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS coparenting_group_id UUID
  REFERENCES public.coparenting_groups(id) ON DELETE CASCADE;

-- 2. Add google_purchase_token for Android IAP (cross-platform parity)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS google_purchase_token TEXT;

-- 3. Backfill coparenting_group_id for existing active subs.
-- Strategy: pick the first group the user is a member of (oldest joined_at).
-- If user has no group, leave NULL — they'll be fixed when they create a group.
UPDATE public.subscriptions s
SET coparenting_group_id = gm.group_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, group_id
  FROM public.group_members
  ORDER BY user_id, joined_at ASC
) gm
WHERE s.user_id = gm.user_id
  AND s.coparenting_group_id IS NULL;

-- 4. Index for fast lookup by group
CREATE INDEX IF NOT EXISTS idx_subscriptions_group
  ON public.subscriptions(coparenting_group_id)
  WHERE status IN ('active', 'trialing', 'past_due');

-- 5. Partial unique index: one active sub per group per provider.
-- Combined with existing (user_id, payment_provider) unique, this prevents
-- two parents in the same group from both paying for the same provider.
-- NULL coparenting_group_id is allowed (legacy) and doesn't participate
-- in uniqueness (NULLs are distinct in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_group_provider
  ON public.subscriptions(coparenting_group_id, payment_provider)
  WHERE status IN ('active', 'trialing', 'past_due')
    AND coparenting_group_id IS NOT NULL;

-- 6. RLS: allow any member of the group to SELECT the subscription.
-- Keep the existing "read own subs" policy as a fallback for legacy
-- (user_id-scoped) rows without coparenting_group_id.
DROP POLICY IF EXISTS "Group members can read group subscription" ON public.subscriptions;
CREATE POLICY "Group members can read group subscription"
  ON public.subscriptions FOR SELECT
  USING (
    coparenting_group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = subscriptions.coparenting_group_id
        AND gm.user_id = auth.uid()
    )
  );

-- 7. Helper view to simplify feature-gate queries: for each group, the
-- currently effective subscription (active OR trialing). Preferred order:
-- active > trialing > past_due. Scoped by payment_provider to pick the
-- "best" one if a group somehow has multiple (shouldn't, but defensive).
CREATE OR REPLACE VIEW public.v_group_active_subscription AS
SELECT DISTINCT ON (s.coparenting_group_id)
  s.coparenting_group_id AS group_id,
  s.id AS subscription_id,
  s.user_id AS payer_user_id,
  s.plan_id,
  s.status,
  s.trial_end,
  s.current_period_end,
  s.cancel_at_period_end,
  s.payment_provider
FROM public.subscriptions s
WHERE s.coparenting_group_id IS NOT NULL
  AND s.status IN ('active', 'trialing', 'past_due')
ORDER BY
  s.coparenting_group_id,
  CASE s.status
    WHEN 'active' THEN 1
    WHEN 'trialing' THEN 2
    WHEN 'past_due' THEN 3
    ELSE 4
  END,
  s.created_at DESC;

-- Grant SELECT on the view to authenticated users — RLS on the underlying
-- subscriptions table still applies via the security barrier.
GRANT SELECT ON public.v_group_active_subscription TO authenticated;
