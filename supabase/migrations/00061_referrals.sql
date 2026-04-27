-- ============================================================
-- REFERRAL MACHINE — Growth phase
-- ============================================================
-- Each user gets a unique referral code. When someone signs up using
-- that code AND converts to a paid plan, both parties get 1 month free
-- credited as a Stripe coupon on their next renewal.
--
-- Why "signup + conversion" and not "just signup":
--   Fake signups are trivial (throwaway emails). Requiring a conversion
--   ensures real value was exchanged before we hand out credits.
--
-- Flow:
--   1. Sender shares short URL kindar.com.br/r/ABC123
--   2. Visitor lands → tracked click (referral_clicks row)
--   3. Visitor signs up → referral_code stored in profiles.referred_by
--   4. Visitor's first paid sub → both get credit via Stripe
-- ============================================================

-- 1. profiles gains a unique referral_code + optional referred_by
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by TEXT REFERENCES public.profiles(referral_code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by
  ON public.profiles(referred_by)
  WHERE referred_by IS NOT NULL;

-- 2. Track click-throughs (before signup). Useful for funnel math.
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT, -- first 16 chars of sha256(ip) — enough to dedupe without storing raw IP
  user_agent TEXT,
  landing_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON public.referral_clicks(code, clicked_at DESC);

-- 3. Conversion tracking — one row per successful referral reward
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  -- Stripe coupon IDs we applied as credit (1 per party)
  referrer_coupon_id TEXT,
  referred_coupon_id TEXT,
  reward_type TEXT NOT NULL DEFAULT 'one_month_free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referred_subscription_id) -- at most one reward per referred sub
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
  ON public.referral_rewards(referrer_user_id, created_at DESC);

-- 4. Backfill referral_code for existing users. Use a stable short code
--    derived from the user's UUID so the same user always gets the same
--    code even if this migration is re-run. We use the first 8 chars of
--    the base64url-encoded UUID + zero-pad to avoid collisions.
UPDATE public.profiles p
SET referral_code = UPPER(
  REGEXP_REPLACE(
    ENCODE(DECODE(REPLACE(p.id::text, '-', ''), 'hex'), 'base64'),
    '[^A-Za-z0-9]', '', 'g'
  )
)::text
WHERE referral_code IS NULL;

-- Truncate to 8 chars and uppercase (we want short, shareable codes)
UPDATE public.profiles
SET referral_code = UPPER(LEFT(referral_code, 8))
WHERE referral_code IS NOT NULL AND LENGTH(referral_code) <> 8;

-- 5. Trigger: auto-generate referral_code for new profiles.
-- Uses the same base64 derivation as the backfill.
CREATE OR REPLACE FUNCTION public.generate_referral_code_for_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(
      LEFT(
        REGEXP_REPLACE(
          ENCODE(DECODE(REPLACE(NEW.id::text, '-', ''), 'hex'), 'base64'),
          '[^A-Za-z0-9]', '', 'g'
        ),
        8
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code_for_new_profile();

-- 6. RLS. Clicks are insert-only from anyone (landing page is public);
-- referral_rewards are read-only by the participants.
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log referral clicks" ON public.referral_clicks;
CREATE POLICY "Anyone can log referral clicks"
  ON public.referral_clicks FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read their referral rewards" ON public.referral_rewards;
CREATE POLICY "Users can read their referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

-- 7. Extend handle_new_user trigger to capture referred_by from signup metadata.
-- Preserves the existing insert of id/full_name/email and adds the ref code
-- when present. The column validates against the FK (referral_code exists
-- only if the referring user already has a generated code, which they do
-- via the trigger in step 5 — but the generation order matters: the
-- trigger's code is generated BEFORE the referrer row is inserted, so by
-- the time a second user signs up there's always a referral_code to link to).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_code TEXT;
BEGIN
  v_ref_code := NULLIF(NEW.raw_user_meta_data->>'referred_by', '');

  INSERT INTO public.profiles (id, full_name, email, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    -- Only set referred_by if the code exists. Otherwise insert NULL
    -- so the FK doesn't explode on fake or expired codes.
    CASE
      WHEN v_ref_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles WHERE referral_code = v_ref_code
      )
      THEN v_ref_code
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. View: referral stats per user (shown in /perfil)
CREATE OR REPLACE VIEW public.v_referral_stats AS
SELECT
  p.id AS user_id,
  p.referral_code,
  COALESCE(click_counts.total_clicks, 0) AS total_clicks,
  COALESCE(signup_counts.total_signups, 0) AS total_signups,
  COALESCE(reward_counts.total_rewards, 0) AS total_rewards,
  COALESCE(reward_counts.months_earned, 0) AS months_earned
FROM public.profiles p
LEFT JOIN (
  SELECT code, COUNT(*) AS total_clicks
  FROM public.referral_clicks
  GROUP BY code
) click_counts ON click_counts.code = p.referral_code
LEFT JOIN (
  SELECT referred_by, COUNT(*) AS total_signups
  FROM public.profiles
  WHERE referred_by IS NOT NULL
  GROUP BY referred_by
) signup_counts ON signup_counts.referred_by = p.referral_code
LEFT JOIN (
  SELECT referrer_user_id, COUNT(*) AS total_rewards, COUNT(*) AS months_earned
  FROM public.referral_rewards
  GROUP BY referrer_user_id
) reward_counts ON reward_counts.referrer_user_id = p.id;

GRANT SELECT ON public.v_referral_stats TO authenticated;
