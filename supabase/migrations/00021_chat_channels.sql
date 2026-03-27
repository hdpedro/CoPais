-- Chat Channels
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

-- Add channel_id to existing chat_messages (nullable for backward compat)
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.chat_channels(id);

-- Unread tracking
CREATE TABLE IF NOT EXISTS public.chat_channel_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_reads_user ON public.chat_channel_reads(user_id);

-- RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view channels" ON public.chat_channels FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can insert channels" ON public.chat_channels FOR INSERT WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Users manage own channel reads" ON public.chat_channel_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own channel reads" ON public.chat_channel_reads FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own channel reads" ON public.chat_channel_reads FOR UPDATE USING (user_id = auth.uid());
