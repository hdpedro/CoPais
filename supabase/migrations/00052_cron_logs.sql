-- Cron execution logs for observability and daily reports
CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  processed INT NOT NULL DEFAULT 0,
  sent INT NOT NULL DEFAULT 0,
  errors JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_logs_name ON public.cron_logs(name);
CREATE INDEX idx_cron_logs_created_at ON public.cron_logs(created_at);
