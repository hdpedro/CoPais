-- =============================================
-- Migration: Health Module Complete
-- Tables: medical_professionals, medical_appointments,
--   active_medications, medication_doses, illness_episodes,
--   child_allergies, child_medical_info, vaccination_records, growth_records
-- =============================================

-- 1. Medical Professionals (doctors, dentists, etc.)
CREATE TABLE IF NOT EXISTS public.medical_professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  crm TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Medical Appointments
CREATE TABLE IF NOT EXISTS public.medical_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.medical_professionals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  appointment_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  summary TEXT,
  calendar_event_id UUID REFERENCES public.custody_events(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Active Medications
CREATE TABLE IF NOT EXISTS public.active_medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  frequency_hours INT,
  reason TEXT,
  prescribed_by TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Medication Doses (log of each dose given)
CREATE TABLE IF NOT EXISTS public.medication_doses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id UUID NOT NULL REFERENCES public.active_medications(id) ON DELETE CASCADE,
  administered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  administered_by UUID NOT NULL REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Illness Episodes
CREATE TABLE IF NOT EXISTS public.illness_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  symptoms TEXT[],
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  diagnosis TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Child Allergies (detailed)
CREATE TABLE IF NOT EXISTS public.child_allergies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allergy_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  reaction TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Child Medical Info (one per child)
CREATE TABLE IF NOT EXISTS public.child_medical_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  blood_type TEXT,
  insurance_name TEXT,
  insurance_number TEXT,
  sus_number TEXT,
  primary_pediatrician_id UUID REFERENCES public.medical_professionals(id) ON DELETE SET NULL,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Vaccination Records
CREATE TABLE IF NOT EXISTS public.vaccination_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  dose_label TEXT,
  administered_date DATE NOT NULL,
  batch_number TEXT,
  location TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Growth Records
CREATE TABLE IF NOT EXISTS public.growth_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  measured_date DATE NOT NULL,
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,1),
  head_cm DECIMAL(5,1),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_medical_professionals_group ON public.medical_professionals(group_id);
CREATE INDEX IF NOT EXISTS idx_medical_appointments_group ON public.medical_appointments(group_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_medical_appointments_child ON public.medical_appointments(child_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_active_medications_child ON public.active_medications(child_id, status);
CREATE INDEX IF NOT EXISTS idx_medication_doses_med ON public.medication_doses(medication_id, administered_at);
CREATE INDEX IF NOT EXISTS idx_illness_episodes_child ON public.illness_episodes(child_id, start_date);
CREATE INDEX IF NOT EXISTS idx_child_allergies_child ON public.child_allergies(child_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_child ON public.vaccination_records(child_id, administered_date);
CREATE INDEX IF NOT EXISTS idx_growth_records_child ON public.growth_records(child_id, measured_date);

-- =============================================
-- RLS Policies
-- =============================================

-- Enable RLS on all new tables
ALTER TABLE public.medical_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_doses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.illness_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_medical_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_records ENABLE ROW LEVEL SECURITY;

-- Medical Professionals
CREATE POLICY "Group members can view professionals" ON public.medical_professionals
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create professionals" ON public.medical_professionals
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update professionals" ON public.medical_professionals
  FOR UPDATE USING (public.is_group_member(group_id));

-- Medical Appointments
CREATE POLICY "Group members can view appointments" ON public.medical_appointments
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create appointments" ON public.medical_appointments
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update appointments" ON public.medical_appointments
  FOR UPDATE USING (public.is_group_member(group_id));

-- Active Medications
CREATE POLICY "Group members can view medications" ON public.active_medications
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create medications" ON public.active_medications
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update medications" ON public.active_medications
  FOR UPDATE USING (public.is_group_member(group_id));

-- Medication Doses
CREATE POLICY "Group members can view doses" ON public.medication_doses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.active_medications m
      WHERE m.id = medication_doses.medication_id
      AND public.is_group_member(m.group_id)
    )
  );
CREATE POLICY "Group members can log doses" ON public.medication_doses
  FOR INSERT WITH CHECK (
    administered_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.active_medications m
      WHERE m.id = medication_doses.medication_id
      AND public.is_group_member(m.group_id)
    )
  );

-- Illness Episodes
CREATE POLICY "Group members can view episodes" ON public.illness_episodes
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create episodes" ON public.illness_episodes
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update episodes" ON public.illness_episodes
  FOR UPDATE USING (public.is_group_member(group_id));

-- Child Allergies
CREATE POLICY "Group members can view allergies" ON public.child_allergies
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create allergies" ON public.child_allergies
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
CREATE POLICY "Group members can update allergies" ON public.child_allergies
  FOR UPDATE USING (public.is_group_member(group_id));

-- Child Medical Info
CREATE POLICY "Group members can view medical info" ON public.child_medical_info
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can insert medical info" ON public.child_medical_info
  FOR INSERT WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Group members can update medical info" ON public.child_medical_info
  FOR UPDATE USING (public.is_group_member(group_id));

-- Vaccination Records
CREATE POLICY "Group members can view vaccinations" ON public.vaccination_records
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create vaccinations" ON public.vaccination_records
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());

-- Growth Records
CREATE POLICY "Group members can view growth" ON public.growth_records
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create growth" ON public.growth_records
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());
