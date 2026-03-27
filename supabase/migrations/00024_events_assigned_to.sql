-- Add assigned_to column to events table for tracking who is responsible
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id);

-- Add end_date for multi-day events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add all_day flag
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT false;
