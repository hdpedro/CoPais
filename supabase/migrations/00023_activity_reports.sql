-- Activity completion reports
CREATE TABLE IF NOT EXISTS public.activity_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  reported_by UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'missed', 'cancelled')),
  notes TEXT,
  child_mood TEXT CHECK (child_mood IN ('happy', 'neutral', 'sad', 'anxious', 'tired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, occurrence_date)
);

ALTER TABLE public.activity_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view reports"
  ON public.activity_reports FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members can insert reports"
  ON public.activity_reports FOR INSERT
  WITH CHECK (public.is_group_member(group_id));

CREATE INDEX idx_activity_reports_group ON public.activity_reports(group_id);
CREATE INDEX idx_activity_reports_activity_date ON public.activity_reports(activity_id, occurrence_date);
