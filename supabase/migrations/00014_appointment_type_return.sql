-- Add appointment_type and return_date to medical_appointments
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS appointment_type text DEFAULT 'rotina'
    CHECK (appointment_type IN ('rotina', 'emergencia', 'retorno', 'exame')),
  ADD COLUMN IF NOT EXISTS return_date date,
  ADD COLUMN IF NOT EXISTS return_notes text;

-- Index for querying upcoming returns
CREATE INDEX IF NOT EXISTS idx_medical_appointments_return
  ON public.medical_appointments(child_id, return_date)
  WHERE return_date IS NOT NULL AND status != 'cancelled';
