-- =============================================
-- Migration 012: Allow activities for all children
-- child_id becomes nullable; when NULL = all children
-- =============================================

ALTER TABLE public.child_activities ALTER COLUMN child_id DROP NOT NULL;
