-- Symptom diary for quick symptom logging with timestamps
CREATE TABLE IF NOT EXISTS public.symptom_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  illness_episode_id UUID REFERENCES public.illness_episodes(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  symptom_type TEXT NOT NULL CHECK (symptom_type IN ('febre','vomito','diarreia','tosse','dor','mancha','falta_apetite','outro')),
  temperature DECIMAL(4,1),
  intensity TEXT CHECK (intensity IN ('leve','moderado','forte')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_symptom_entries_child ON public.symptom_entries(child_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_symptom_entries_group ON public.symptom_entries(group_id);

ALTER TABLE public.symptom_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "symptom_entries_select" ON public.symptom_entries
  FOR SELECT USING (is_group_member(group_id));

CREATE POLICY "symptom_entries_insert" ON public.symptom_entries
  FOR INSERT WITH CHECK (is_group_member(group_id));

CREATE POLICY "symptom_entries_update" ON public.symptom_entries
  FOR UPDATE USING (is_group_member(group_id));

CREATE POLICY "symptom_entries_delete" ON public.symptom_entries
  FOR DELETE USING (is_group_member(group_id));
