CREATE TABLE IF NOT EXISTS public.retention_events (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

ALTER TABLE public.retention_events ENABLE ROW LEVEL SECURITY;
