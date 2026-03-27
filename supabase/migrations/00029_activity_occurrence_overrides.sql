-- Add overrides JSONB column to activity_reports
-- Allows storing field overrides for a specific activity occurrence (single-day edits)
-- Example: {"name": "Natacao especial", "time_start": "10:00", "location": "Piscina B"}
ALTER TABLE public.activity_reports
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}';
