-- Add sex field to children table for WHO growth curve differentiation
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('M', 'F'));

-- Comment for documentation
COMMENT ON COLUMN public.children.sex IS 'Biological sex (M/F) for WHO growth percentile curves';
