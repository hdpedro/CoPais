-- MIGRATION 008: RLS + Indexes for agreements, events, school_logs, sensitive_notes
-- Run this in Supabase Dashboard > SQL Editor

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_agreements_group_id ON public.agreements(group_id);
CREATE INDEX IF NOT EXISTS idx_agreements_created_by ON public.agreements(created_by);
CREATE INDEX IF NOT EXISTS idx_events_group_id ON public.events(group_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_school_logs_group_id ON public.school_logs(group_id);
CREATE INDEX IF NOT EXISTS idx_school_logs_child_id ON public.school_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_school_logs_log_date ON public.school_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_sensitive_notes_group_id ON public.sensitive_notes(group_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_notes_topic ON public.sensitive_notes(topic);
CREATE INDEX IF NOT EXISTS idx_sensitive_notes_is_urgent ON public.sensitive_notes(is_urgent);

-- ENABLE RLS
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_notes ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES: AGREEMENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can view agreements') THEN
    CREATE POLICY "Group members can view agreements" ON public.agreements FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can create agreements') THEN
    CREATE POLICY "Group members can create agreements" ON public.agreements FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can update agreements') THEN
    CREATE POLICY "Group members can update agreements" ON public.agreements FOR UPDATE USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can delete own agreements') THEN
    CREATE POLICY "Group members can delete own agreements" ON public.agreements FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

-- RLS POLICIES: EVENTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can view events') THEN
    CREATE POLICY "Group members can view events" ON public.events FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can create events') THEN
    CREATE POLICY "Group members can create events" ON public.events FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can update events') THEN
    CREATE POLICY "Group members can update events" ON public.events FOR UPDATE USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Creators can delete events') THEN
    CREATE POLICY "Creators can delete events" ON public.events FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

-- RLS POLICIES: SCHOOL_LOGS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can view school logs') THEN
    CREATE POLICY "Group members can view school logs" ON public.school_logs FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can create school logs') THEN
    CREATE POLICY "Group members can create school logs" ON public.school_logs FOR INSERT WITH CHECK (public.is_group_member(group_id) AND logged_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can update school logs') THEN
    CREATE POLICY "Group members can update school logs" ON public.school_logs FOR UPDATE USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Creators can delete school logs') THEN
    CREATE POLICY "Creators can delete school logs" ON public.school_logs FOR DELETE USING (logged_by = auth.uid());
  END IF;
END $$;

-- RLS POLICIES: SENSITIVE_NOTES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can view sensitive notes') THEN
    CREATE POLICY "Group members can view sensitive notes" ON public.sensitive_notes FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can create sensitive notes') THEN
    CREATE POLICY "Group members can create sensitive notes" ON public.sensitive_notes FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can update sensitive notes') THEN
    CREATE POLICY "Group members can update sensitive notes" ON public.sensitive_notes FOR UPDATE USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Creators can delete sensitive notes') THEN
    CREATE POLICY "Creators can delete sensitive notes" ON public.sensitive_notes FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

-- TRIGGER for updated_at on agreements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_agreements_updated_at') THEN
    CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
