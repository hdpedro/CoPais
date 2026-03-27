-- Migration: Add deletion request tracking to sensitive_notes
ALTER TABLE public.sensitive_notes
  ADD COLUMN IF NOT EXISTS deletion_requested_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
