-- ============================================================
-- MIGRATION 008: Formalize 4 missing tables + RLS policies
-- Tables: agreements, events, school_logs, sensitive_notes
-- These tables already exist in production (created manually).
-- This migration uses CREATE TABLE IF NOT EXISTS + idempotent RLS.
-- ============================================================

-- ============================================================
-- 1. AGREEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('principle', 'value', 'rule', 'boundary', 'routine')),
  is_non_negotiable BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  accepted_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreements_group_id ON public.agreements(group_id);
CREATE INDEX IF NOT EXISTS idx_agreements_created_by ON public.agreements(created_by);

-- ============================================================
-- 2. EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  location TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_group_id ON public.events(group_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

-- ============================================================
-- 3. SCHOOL_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('grade', 'meeting', 'behavior', 'homework', 'event', 'absence', 'achievement', 'concern', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  log_date DATE NOT NULL,
  attachment_url TEXT,
  logged_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_logs_group_id ON public.school_logs(group_id);
CREATE INDEX IF NOT EXISTS idx_school_logs_child_id ON public.school_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_school_logs_log_date ON public.school_logs(log_date);

-- ============================================================
-- 4. SENSITIVE_NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensitive_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  topic TEXT NOT NULL CHECK (topic IN ('gender_violence', 'sexual_violence', 'bullying', 'mental_health', 'substance_abuse', 'safety', 'other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  read_by UUID[],
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_notes_group_id ON public.sensitive_notes(group_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_notes_topic ON public.sensitive_notes(topic);
CREATE INDEX IF NOT EXISTS idx_sensitive_notes_is_urgent ON public.sensitive_notes(is_urgent);

-- ============================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS POLICIES — AGREEMENTS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can view agreements') THEN
    CREATE POLICY "Group members can view agreements"
      ON public.agreements FOR SELECT
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can create agreements') THEN
    CREATE POLICY "Group members can create agreements"
      ON public.agreements FOR INSERT
      WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can update agreements') THEN
    CREATE POLICY "Group members can update agreements"
      ON public.agreements FOR UPDATE
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can delete own agreements') THEN
    CREATE POLICY "Group members can delete own agreements"
      ON public.agreements FOR DELETE
      USING (created_by = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 7. RLS POLICIES — EVENTS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can view events') THEN
    CREATE POLICY "Group members can view events"
      ON public.events FOR SELECT
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can create events') THEN
    CREATE POLICY "Group members can create events"
      ON public.events FOR INSERT
      WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can update events') THEN
    CREATE POLICY "Group members can update events"
      ON public.events FOR UPDATE
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Creators can delete events') THEN
    CREATE POLICY "Creators can delete events"
      ON public.events FOR DELETE
      USING (created_by = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 8. RLS POLICIES — SCHOOL_LOGS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can view school logs') THEN
    CREATE POLICY "Group members can view school logs"
      ON public.school_logs FOR SELECT
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can create school logs') THEN
    CREATE POLICY "Group members can create school logs"
      ON public.school_logs FOR INSERT
      WITH CHECK (public.is_group_member(group_id) AND logged_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can update school logs') THEN
    CREATE POLICY "Group members can update school logs"
      ON public.school_logs FOR UPDATE
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Creators can delete school logs') THEN
    CREATE POLICY "Creators can delete school logs"
      ON public.school_logs FOR DELETE
      USING (logged_by = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 9. RLS POLICIES — SENSITIVE_NOTES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can view sensitive notes') THEN
    CREATE POLICY "Group members can view sensitive notes"
      ON public.sensitive_notes FOR SELECT
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can create sensitive notes') THEN
    CREATE POLICY "Group members can create sensitive notes"
      ON public.sensitive_notes FOR INSERT
      WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can update sensitive notes') THEN
    CREATE POLICY "Group members can update sensitive notes"
      ON public.sensitive_notes FOR UPDATE
      USING (public.is_group_member(group_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Creators can delete sensitive notes') THEN
    CREATE POLICY "Creators can delete sensitive notes"
      ON public.sensitive_notes FOR DELETE
      USING (created_by = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================
-- Reuse the update_updated_at_column function from initial schema
CREATE TRIGGER update_agreements_updated_at
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
