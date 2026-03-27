-- Health Views Tracking (for "Visualizado por X há Y min")
-- Tracks when co-parents view health records

CREATE TABLE IF NOT EXISTS public.health_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN (
    'illness_episode', 'active_medication', 'medical_appointment',
    'medication_dose', 'vaccination_record', 'growth_record', 'child_allergy',
    'health_page'
  )),
  record_id UUID,  -- nullable for 'health_page' type (page-level view)
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
  viewed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_type, record_id, viewed_by)  -- one view per user per record (upsert)
);

CREATE INDEX idx_health_views_group ON public.health_views(group_id);
CREATE INDEX idx_health_views_record ON public.health_views(record_type, record_id);
CREATE INDEX idx_health_views_child ON public.health_views(child_id);
CREATE INDEX idx_health_views_recent ON public.health_views(group_id, child_id, viewed_at DESC);

ALTER TABLE public.health_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view health views"
  ON public.health_views FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Users can insert own views"
  ON public.health_views FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND viewed_by = auth.uid());

CREATE POLICY "Users can update own views"
  ON public.health_views FOR UPDATE
  USING (viewed_by = auth.uid())
  WITH CHECK (viewed_by = auth.uid());
