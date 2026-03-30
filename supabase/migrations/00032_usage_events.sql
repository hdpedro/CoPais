-- Usage Events — tracks feature usage for billing/monetization
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,               -- 'invite_parser', 'assistant_chat', etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage"
  ON public.usage_events FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_user_feature
  ON public.usage_events(user_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_daily
  ON public.usage_events(feature, created_at DESC);
