-- Add hospital visit and severity fields to illness_episodes
ALTER TABLE illness_episodes
  ADD COLUMN IF NOT EXISTS hospital_visit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'leve'
    CHECK (severity IN ('leve', 'moderado', 'grave')),
  ADD COLUMN IF NOT EXISTS hospital_name text,
  ADD COLUMN IF NOT EXISTS hospital_date date;
