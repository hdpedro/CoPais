-- =============================================
-- Migration 00019: Private Notes
-- =============================================
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

-- =============================================
-- Migration 00020: Decisions
-- =============================================
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

CREATE TABLE IF NOT EXISTS public.decision_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  vote TEXT NOT NULL CHECK (vote IN ('concordo', 'discordo', 'pensar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(decision_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.decision_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  argument_type TEXT NOT NULL CHECK (argument_type IN ('pro', 'contra')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_arguments_decision ON public.decision_arguments(decision_id);

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

-- =============================================
-- Migration 00021: Chat Channels
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'topic' CHECK (channel_type IN ('topic', 'child')),
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_group ON public.chat_channels(group_id);

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.chat_channels(id);

CREATE TABLE IF NOT EXISTS public.chat_channel_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_reads_user ON public.chat_channel_reads(user_id);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view channels" ON public.chat_channels FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can insert channels" ON public.chat_channels FOR INSERT WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Users manage own channel reads" ON public.chat_channel_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own channel reads" ON public.chat_channel_reads FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own channel reads" ON public.chat_channel_reads FOR UPDATE USING (user_id = auth.uid());
