-- Decisions
CREATE TABLE IF NOT EXISTS public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('escola', 'saude', 'atividade', 'viagem', 'financeiro', 'moradia', 'outro')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'aprovada', 'rejeitada', 'expirada')),
  deadline DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_group ON public.decisions(group_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON public.decisions(status);

-- Decision votes
CREATE TABLE IF NOT EXISTS public.decision_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  vote TEXT NOT NULL CHECK (vote IN ('concordo', 'discordo', 'pensar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(decision_id, user_id)
);

-- Decision arguments
CREATE TABLE IF NOT EXISTS public.decision_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  argument_type TEXT NOT NULL CHECK (argument_type IN ('pro', 'contra')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_arguments_decision ON public.decision_arguments(decision_id);

-- RLS
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view decisions" ON public.decisions FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create decisions" ON public.decisions FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update decisions" ON public.decisions FOR UPDATE USING (public.is_group_member(group_id));

CREATE POLICY "Members can view votes" ON public.decision_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND public.is_group_member(d.group_id)));
CREATE POLICY "Members can cast votes" ON public.decision_votes FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND public.is_group_member(d.group_id)));
CREATE POLICY "Users can update own votes" ON public.decision_votes FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Members can view arguments" ON public.decision_arguments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND public.is_group_member(d.group_id)));
CREATE POLICY "Members can add arguments" ON public.decision_arguments FOR INSERT
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND public.is_group_member(d.group_id)));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_votes BEFORE UPDATE ON public.decision_votes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
