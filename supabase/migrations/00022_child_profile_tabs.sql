-- Migration 00022: Child Profile Tabs
-- Adds CPF/RG fields to children table and creates child_education table

-- 1. Add identity fields to children table
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS rg TEXT;

-- 2. Create child_education table (1:1 with children, same pattern as child_medical_info)
CREATE TABLE IF NOT EXISTS public.child_education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  school_name TEXT,
  school_address TEXT,
  school_phone TEXT,
  grade TEXT,
  class_name TEXT,
  teacher_name TEXT,
  coordinator_name TEXT,
  entry_time TIME,
  exit_time TIME,
  extracurricular_activities TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS policies
ALTER TABLE public.child_education ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view education" ON public.child_education
  FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "Group members can insert education" ON public.child_education
  FOR INSERT WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Group members can update education" ON public.child_education
  FOR UPDATE USING (public.is_group_member(group_id));

-- 4. Index for fast child lookup
CREATE INDEX IF NOT EXISTS idx_child_education_child ON public.child_education(child_id);
