-- 00097_profiles_last_active_group.sql
-- Track which group a multi-group user was most recently active in. Billing
-- status, dashboard, calendar — all need to default to a sensible group, and
-- "oldest joined_at" (current heuristic in getPrimaryGroupId) breaks for users
-- who participate in multiple coparenting groups (separated parent re-partnered;
-- consultant added to 2 client families; lawyer with multiple cases).
--
-- Without this, when such a user opens the app and queries /api/billing/status
-- without an explicit groupId, they see the billing of the wrong group.
--
-- Policy:
--   - DEFAULT null. Backfill is best-effort: pick the user's most-recent
--     membership by joined_at DESC (the inverse of current heuristic — it's
--     more likely to be the active group than the oldest).
--   - Updated by client-side hook when the user navigates into a group-scoped
--     route. Lazy; doesn't require every API call to write back.
--   - FK SET NULL on delete so deleting a group doesn't break the profile row.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_group_id uuid REFERENCES public.coparenting_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_group
  ON public.profiles (last_active_group_id)
  WHERE last_active_group_id IS NOT NULL;

-- Best-effort backfill: most-recent membership per user.
WITH ranked AS (
  SELECT
    user_id,
    group_id,
    row_number() OVER (PARTITION BY user_id ORDER BY joined_at DESC) AS rn
  FROM public.group_members
)
UPDATE public.profiles p
  SET last_active_group_id = r.group_id
FROM ranked r
WHERE r.rn = 1
  AND p.id = r.user_id
  AND p.last_active_group_id IS NULL;

COMMENT ON COLUMN public.profiles.last_active_group_id IS
  'Most recent group the user was active in. Used by /api/billing/status and similar default-group resolvers. Updated lazily by client-side hooks when entering a group-scoped route. Backfilled 2026-05-25 to most-recent membership.';
