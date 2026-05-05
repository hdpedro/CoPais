-- Add quick_actions preference column to profiles
-- Stores user's personalized quick action buttons as JSON:
-- { "primary": "nova-despesa", "secondary": ["calendario", "financeiro", "saude", "acordos", "documentos", "decisoes"] }
-- NULL = use app defaults

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quick_actions jsonb DEFAULT NULL;
