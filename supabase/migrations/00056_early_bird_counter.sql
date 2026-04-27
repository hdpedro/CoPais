-- ============================================================
-- EARLY BIRD CAPACITY ENFORCEMENT
-- ============================================================
-- Enforces that only the first N subscribers can claim an Early Bird plan.
-- N comes from plans.max_subscribers (1000 for Harmonia Early Bird).
--
-- Strategy:
--   1. Trigger on subscriptions INSERT acquires a pg_advisory_xact_lock
--      keyed by plan_id, then checks the active count against
--      plans.max_subscribers. This serializes concurrent signups across
--      PWA / iOS / Android so we never oversell.
--   2. A public view v_early_bird_slots_remaining exposes the live count
--      for the landing page counter (cached 30s on the app side).
--
-- Why advisory lock and not SELECT ... FOR UPDATE: plans rows are rarely
-- updated, FOR UPDATE would serialize all plan reads too. Advisory locks
-- are lightweight and scoped to the transaction.
-- ============================================================

-- 1. Function executed by the trigger before INSERT on subscriptions.
CREATE OR REPLACE FUNCTION public.check_early_bird_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
  v_lock_key BIGINT;
BEGIN
  -- Fast path: only apply to rows that reference a capped plan.
  SELECT max_subscribers INTO v_max
  FROM public.plans
  WHERE id = NEW.plan_id;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only count "live" statuses toward the cap. A canceled/expired sub
  -- frees up a slot — that's by design (a dropout in month 2 should
  -- not keep their slot forever if they never paid).
  IF NEW.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN NEW;
  END IF;

  -- Advisory lock keyed off the plan_id hash. hashtext is stable and
  -- deterministic, so two transactions inserting for the same plan_id
  -- will serialize on the same lock.
  v_lock_key := hashtext('early_bird:' || NEW.plan_id);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) INTO v_current
  FROM public.subscriptions
  WHERE plan_id = NEW.plan_id
    AND status IN ('active', 'trialing', 'past_due');

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Early Bird plan % is sold out (%/%)', NEW.plan_id, v_current, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger on subscriptions INSERT.
DROP TRIGGER IF EXISTS trg_check_early_bird_capacity ON public.subscriptions;
CREATE TRIGGER trg_check_early_bird_capacity
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_early_bird_capacity();

-- 3. Public view exposing slots remaining per capped plan.
CREATE OR REPLACE VIEW public.v_early_bird_slots_remaining AS
SELECT
  p.id AS plan_id,
  p.max_subscribers,
  COALESCE(active_count.count, 0) AS current_count,
  GREATEST(p.max_subscribers - COALESCE(active_count.count, 0), 0) AS slots_remaining
FROM public.plans p
LEFT JOIN (
  SELECT plan_id, COUNT(*) AS count
  FROM public.subscriptions
  WHERE status IN ('active', 'trialing', 'past_due')
  GROUP BY plan_id
) active_count ON active_count.plan_id = p.id
WHERE p.max_subscribers IS NOT NULL
  AND p.is_active = true;

-- Allow anon (landing page) + authenticated to read the counter.
GRANT SELECT ON public.v_early_bird_slots_remaining TO anon, authenticated;
