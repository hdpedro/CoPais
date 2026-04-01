-- Pre-computed activity occurrence dates.
-- Eliminates runtime recurrence expansion (getOccurrences in JS).
-- Generated on activity create, regenerated on edit, deleted on activity delete.

CREATE TABLE IF NOT EXISTS public.calendar_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, occurrence_date)
);

ALTER TABLE public.calendar_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view occurrences"
  ON public.calendar_occurrences FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members can insert occurrences"
  ON public.calendar_occurrences FOR INSERT
  WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Group members can delete occurrences"
  ON public.calendar_occurrences FOR DELETE
  USING (public.is_group_member(group_id));

-- Performance indexes
CREATE INDEX idx_calendar_occurrences_group_date
  ON public.calendar_occurrences(group_id, occurrence_date);

CREATE INDEX idx_calendar_occurrences_activity
  ON public.calendar_occurrences(activity_id);
