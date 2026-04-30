-- ============================================================
-- EARLY BIRD: also enforce capacity on UPDATE → active transition
-- ============================================================
-- Migration 00056 only checked Early Bird capacity on INSERT, but the
-- IAP flow inserts subscriptions with status='pending' (the verify
-- endpoint waits for the RC webhook to flip them to 'active'). The
-- pending status bypasses the capacity check, then the UPDATE that
-- flips status='active' is not gated, so up to N+M concurrent
-- pending rows could all become active and oversell.
--
-- This migration extends the trigger to ALSO fire on UPDATE when the
-- status transitions from non-counted into a counted bucket.
-- Counted = ('active', 'trialing', 'past_due').
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_early_bird_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
  v_lock_key BIGINT;
  v_was_counted BOOLEAN;
  v_now_counted BOOLEAN;
BEGIN
  -- Fast path: only apply to rows that reference a capped plan.
  SELECT max_subscribers INTO v_max
  FROM public.plans
  WHERE id = NEW.plan_id;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  v_now_counted := NEW.status IN ('active', 'trialing', 'past_due');

  -- On UPDATE: only check if we're transitioning INTO a counted state.
  -- Already-counted rows that update non-status fields are fine.
  IF TG_OP = 'UPDATE' THEN
    v_was_counted := OLD.status IN ('active', 'trialing', 'past_due');
    -- No-op cases:
    --   - was not counted, still not counted (e.g. pending → expired)
    --   - was counted, still counted (e.g. active → past_due) — already
    --     occupies a slot, no new draw
    --   - was counted, now not (cancellation) — frees a slot, no check
    IF v_was_counted OR NOT v_now_counted THEN
      RETURN NEW;
    END IF;
    -- Plan change between Early Bird plans should also be checked, but
    -- that's a rare admin case — handled by the same lock below.
  ELSE
    -- INSERT path: check only if NEW.status counts.
    IF NOT v_now_counted THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Acquire advisory lock so concurrent transitions serialize.
  v_lock_key := hashtext('early_bird:' || NEW.plan_id);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Count rows that already occupy slots, EXCLUDING the row being
  -- updated (otherwise the UPDATE would count itself in some races).
  SELECT COUNT(*) INTO v_current
  FROM public.subscriptions
  WHERE plan_id = NEW.plan_id
    AND status IN ('active', 'trialing', 'past_due')
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Early Bird plan % is sold out (%/%)', NEW.plan_id, v_current, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger to also fire on UPDATE.
DROP TRIGGER IF EXISTS trg_check_early_bird_capacity ON public.subscriptions;
CREATE TRIGGER trg_check_early_bird_capacity
  BEFORE INSERT OR UPDATE OF status, plan_id ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_early_bird_capacity();
