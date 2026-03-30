-- AI Requests — logs every AI provider call for monitoring & analytics
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.coparenting_groups(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,              -- 'Groq', 'Together', 'Gemini'
  feature TEXT NOT NULL,               -- 'invite_parser', 'assistant_chat', etc.
  success BOOLEAN NOT NULL DEFAULT false,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI requests"
  ON public.ai_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert AI requests"
  ON public.ai_requests FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_requests_user
  ON public.ai_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_feature
  ON public.ai_requests(feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_provider
  ON public.ai_requests(provider, success, created_at DESC);
