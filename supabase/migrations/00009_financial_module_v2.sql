-- Settlements table (record payments between parents)
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id),
  paid_by UUID NOT NULL REFERENCES public.profiles(id),
  paid_to UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT DEFAULT 'pix',
  reference_note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disputed')),
  confirmed_by UUID REFERENCES public.profiles(id),
  confirmed_at TIMESTAMPTZ,
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_paid_by ON public.settlements(paid_by);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status);

-- Enable RLS
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Group members can view settlements" ON public.settlements FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create settlements" ON public.settlements FOR INSERT WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Group members can update settlements" ON public.settlements FOR UPDATE USING (public.is_group_member(group_id));

-- Add rejection_reason to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
