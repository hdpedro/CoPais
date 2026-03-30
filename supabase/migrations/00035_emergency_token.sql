-- Add emergency_token column to children table for QR code emergency feature
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS emergency_token UUID DEFAULT uuid_generate_v4();

-- Backfill existing children
UPDATE public.children SET emergency_token = uuid_generate_v4() WHERE emergency_token IS NULL;
