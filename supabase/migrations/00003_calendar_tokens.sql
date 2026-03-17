-- ============================================================
-- CALENDAR TOKENS (for iCal subscription)
-- ============================================================

CREATE TABLE public.calendar_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

CREATE INDEX idx_calendar_tokens_token ON public.calendar_tokens(token);

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar tokens"
  ON public.calendar_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own calendar tokens"
  ON public.calendar_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own calendar tokens"
  ON public.calendar_tokens FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- ADD RECURRING EVENT FIELDS TO CUSTODY_EVENTS
-- ============================================================

ALTER TABLE public.custody_events
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;

-- ============================================================
-- DAILY CHECK-INS TABLE
-- ============================================================

CREATE TABLE public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  logged_by UUID NOT NULL REFERENCES public.profiles(id),
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_checkins_group_date ON public.daily_checkins(group_id, checkin_date DESC);
CREATE INDEX idx_daily_checkins_child ON public.daily_checkins(child_id, checkin_date DESC);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view checkins"
  ON public.daily_checkins FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members can create checkins"
  ON public.daily_checkins FOR INSERT
  WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Users can update own checkins"
  ON public.daily_checkins FOR UPDATE
  USING (logged_by = auth.uid());
