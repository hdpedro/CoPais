-- Add extra info fields to child_activities for richer detail view
ALTER TABLE public.child_activities ADD COLUMN IF NOT EXISTS teacher_name TEXT;
ALTER TABLE public.child_activities ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE public.child_activities ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE public.child_activities ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id);
