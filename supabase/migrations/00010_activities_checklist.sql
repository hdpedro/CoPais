-- =============================================
-- Migration 010: Activities + Smart Checklist
-- Atividades recorrentes com checklist inteligente
-- Integrado à agenda do calendário
-- =============================================

-- Activities table (recurring activities like futsal, swimming, dentist)
CREATE TABLE IF NOT EXISTS public.child_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- "Futsal", "Natacao", "Dentista"
  category TEXT NOT NULL DEFAULT 'sport',      -- sport, health, school, art, music, therapy, other

  -- Recurrence
  recurrence_type TEXT NOT NULL DEFAULT 'never' CHECK (
    recurrence_type IN ('never', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom')
  ),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,                               -- when recurrence ends (NULL = indefinitely)
  days_of_week TEXT,                                         -- JSON array e.g. "[1,2,5]" for weekly/biweekly (0=Dom, 6=Sab)
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31), -- for monthly
  custom_interval INTEGER DEFAULT 1,           -- every N units
  custom_unit TEXT DEFAULT 'week' CHECK (custom_unit IN ('day', 'week', 'month')),

  -- Time & place
  time_start TIME,                             -- 09:00
  time_end TIME,                               -- 10:00
  location TEXT,                               -- "Quadra do clube"
  notes TEXT,

  -- Config
  is_active BOOLEAN DEFAULT true,
  notify_hours_before INTEGER DEFAULT 24,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Checklist items (default items per activity)
CREATE TABLE IF NOT EXISTS public.activity_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Checklist completions (per occurrence date)
CREATE TABLE IF NOT EXISTS public.checklist_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.activity_checklist_items(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  completed_by UUID NOT NULL REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, occurrence_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_child_activities_group ON public.child_activities(group_id);
CREATE INDEX IF NOT EXISTS idx_child_activities_child ON public.child_activities(child_id);
CREATE INDEX IF NOT EXISTS idx_child_activities_active ON public.child_activities(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_activity_checklist_items_activity ON public.activity_checklist_items(activity_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_activity_date ON public.checklist_completions(activity_id, occurrence_date);

-- Enable RLS
ALTER TABLE public.child_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for child_activities
CREATE POLICY "Group members can view activities"
  ON public.child_activities FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));

CREATE POLICY "Group members can create activities"
  ON public.child_activities FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));

CREATE POLICY "Group members can update activities"
  ON public.child_activities FOR UPDATE
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));

CREATE POLICY "Group members can delete activities"
  ON public.child_activities FOR DELETE
  USING (group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()));

-- RLS for checklist items
CREATE POLICY "Group members can view checklist items"
  ON public.activity_checklist_items FOR SELECT
  USING (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

CREATE POLICY "Group members can manage checklist items"
  ON public.activity_checklist_items FOR INSERT
  WITH CHECK (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

CREATE POLICY "Group members can delete checklist items"
  ON public.activity_checklist_items FOR DELETE
  USING (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

-- RLS for completions
CREATE POLICY "Group members can view completions"
  ON public.checklist_completions FOR SELECT
  USING (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

CREATE POLICY "Group members can create completions"
  ON public.checklist_completions FOR INSERT
  WITH CHECK (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

CREATE POLICY "Group members can delete completions"
  ON public.checklist_completions FOR DELETE
  USING (activity_id IN (SELECT id FROM public.child_activities WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));

-- Trigger for updated_at
CREATE TRIGGER update_child_activities_updated_at
  BEFORE UPDATE ON public.child_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
