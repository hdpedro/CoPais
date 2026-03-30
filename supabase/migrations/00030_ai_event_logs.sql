-- AI Event Logs — tracks invite parsing for quality analysis
CREATE TABLE IF NOT EXISTS public.ai_event_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.coparenting_groups(id) ON DELETE SET NULL,
  raw_text TEXT,
  parsed_json JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  parser_type TEXT NOT NULL DEFAULT 'pilot',
  processing_time_ms INTEGER,
  ocr_confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ai_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs"
  ON public.ai_event_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs"
  ON public.ai_event_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for analysis queries
CREATE INDEX IF NOT EXISTS idx_ai_event_logs_user
  ON public.ai_event_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_event_logs_success
  ON public.ai_event_logs(success, created_at DESC);
