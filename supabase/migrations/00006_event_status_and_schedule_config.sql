-- ============================================
-- Migration 006: Event Status + Schedule Config
-- ============================================

-- 1. Add status column to events table (social events)
-- Allows marking events as cancelled without deleting them
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Add check constraint for valid status values
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check CHECK (status IN ('active', 'cancelled'));

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

-- 2. Create custody_schedules table to store schedule configuration
-- This stores the 14-day pattern so we don't need to reconstruct it from events
CREATE TABLE IF NOT EXISTS public.custody_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  pattern JSONB NOT NULL,
  start_date DATE NOT NULL,
  months INTEGER NOT NULL DEFAULT 6,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, child_id)
);

-- RLS for custody_schedules
ALTER TABLE public.custody_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view custody schedules"
  ON public.custody_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = custody_schedules.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can insert custody schedules"
  ON public.custody_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = custody_schedules.group_id
        AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can update custody schedules"
  ON public.custody_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = custody_schedules.group_id
        AND group_members.user_id = auth.uid()
    )
  );
