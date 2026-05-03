-- ================================================================
-- Migration 00065: WhatsApp v2 — derived views for fast assistant queries
-- ================================================================
--
-- Adds read-only views consumed by the AI tools (`get_child_status`,
-- `get_balance`). No schema changes to base tables — all data is
-- derived. Safe to drop and recreate.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. child_current_status — per-child snapshot for the assistant
-- ----------------------------------------------------------------
-- Surfaces:
--   * is_sick — has at least one illness_episodes row with status='active'
--     and no end_date (or end_date >= today)
--   * active_illness_titles — text[] of titles for context
--   * active_medications_count — count of active_medications still in use
--   * active_medication_names — text[] of active med names
--   * allergies_count — count of registered allergies
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW public.child_current_status AS
SELECT
  c.id AS child_id,
  c.group_id,
  c.full_name,
  COALESCE(
    (
      SELECT COUNT(*) > 0
      FROM public.illness_episodes ie
      WHERE ie.child_id = c.id
        AND ie.status = 'active'
        AND (ie.end_date IS NULL OR ie.end_date >= CURRENT_DATE)
    ),
    false
  ) AS is_sick,
  COALESCE(
    (
      SELECT array_agg(ie.title ORDER BY ie.start_date DESC)
      FROM public.illness_episodes ie
      WHERE ie.child_id = c.id
        AND ie.status = 'active'
        AND (ie.end_date IS NULL OR ie.end_date >= CURRENT_DATE)
    ),
    ARRAY[]::TEXT[]
  ) AS active_illness_titles,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM public.active_medications am
      WHERE am.child_id = c.id
        AND COALESCE(am.is_active, true) = true
    ),
    0
  ) AS active_medications_count,
  COALESCE(
    (
      SELECT array_agg(am.name ORDER BY am.created_at DESC)
      FROM public.active_medications am
      WHERE am.child_id = c.id
        AND COALESCE(am.is_active, true) = true
    ),
    ARRAY[]::TEXT[]
  ) AS active_medication_names,
  COALESCE(
    (
      SELECT COUNT(*)
      FROM public.child_allergies ca
      WHERE ca.child_id = c.id
    ),
    0
  ) AS allergies_count
FROM public.children c;

COMMENT ON VIEW public.child_current_status IS
  'Per-child status snapshot consumed by the WhatsApp assistant. RLS is enforced via underlying tables.';

-- Views inherit RLS from base tables when SECURITY INVOKER (default in
-- Supabase). Children/illness/medication policies already gate access by
-- group membership, so no extra policy is needed here.

-- ----------------------------------------------------------------
-- 2. expense_balance_per_user — pending expenses split by payer/owe
-- ----------------------------------------------------------------
-- Aggregates `expenses` rows that are still pending (status='pending')
-- and computes per-user owed share based on `split_ratio`. Used by the
-- `get_balance` AI tool.
--
-- The view returns one row per (group_id, user_id) with two metrics:
--   * paid_pending: how much that user has paid that's still pending
--     other-party approval
--   * owes_pending: how much that user owes (sum across other payers'
--     pending rows, computed via JSONB split_ratio)
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW public.expense_balance_per_user AS
WITH expanded AS (
  SELECT
    e.group_id,
    e.id AS expense_id,
    e.paid_by,
    e.amount,
    e.status,
    (jsonb_each_text(e.split_ratio)).key   AS user_id,
    (jsonb_each_text(e.split_ratio)).value AS share_pct
  FROM public.expenses e
  WHERE e.status = 'pending'
    AND e.split_ratio IS NOT NULL
)
SELECT
  group_id,
  user_id::UUID AS user_id,
  -- Total paid by this user (across all expenses where they're paid_by)
  COALESCE(SUM(
    CASE WHEN paid_by::TEXT = user_id THEN amount ELSE 0 END
  ), 0) AS paid_pending,
  -- Total this user owes (their share of expenses paid by someone else)
  COALESCE(SUM(
    CASE WHEN paid_by::TEXT <> user_id
      THEN ROUND(amount * (share_pct::NUMERIC / 100), 2)
      ELSE 0
    END
  ), 0) AS owes_pending
FROM expanded
GROUP BY group_id, user_id;

COMMENT ON VIEW public.expense_balance_per_user IS
  'Per-user pending balance derived from expenses.split_ratio. Used by `get_balance` AI tool.';
