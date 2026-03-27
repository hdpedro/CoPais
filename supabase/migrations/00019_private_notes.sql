CREATE TABLE IF NOT EXISTS public.private_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'lembrete' CHECK (category IN ('lembrete', 'observacao', 'preparacao', 'juridico', 'outro')),
  title TEXT NOT NULL,
  content TEXT,
  note_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_private_notes_user ON public.private_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_private_notes_group ON public.private_notes(group_id, user_id);

ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" ON public.private_notes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own notes" ON public.private_notes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own notes" ON public.private_notes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notes" ON public.private_notes FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.private_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
