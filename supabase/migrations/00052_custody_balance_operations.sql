-- Migration 00052: Custody Balance Operations Ledger
-- Adds a ledger for tracking balance adjustments between co-parents.
-- Supports: debit, credit, waive, gift_day, forgive_balance, reset_balance, manual_adjustment.
-- All operations require bilateral approval.

-- Operation type enum
DO $$ BEGIN
  CREATE TYPE balance_operation_type AS ENUM (
    'debit',
    'credit',
    'waive',
    'gift_day',
    'forgive_balance',
    'reset_balance',
    'manual_adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ledger table
CREATE TABLE IF NOT EXISTS public.custody_balance_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  operation_type balance_operation_type NOT NULL,

  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  days INTEGER NOT NULL DEFAULT 1,
  direction TEXT NOT NULL
    CHECK (direction IN ('proposer_gains', 'target_gains', 'neutral', 'both_zero')),

  swap_request_id UUID REFERENCES public.swap_requests(id),
  related_date DATE,

  balance_before_proposer INTEGER,
  balance_before_target INTEGER,
  balance_after_proposer INTEGER,
  balance_after_target INTEGER,

  responded_by UUID REFERENCES public.profiles(id),
  responded_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cbo_group
  ON public.custody_balance_operations(group_id);
CREATE INDEX IF NOT EXISTS idx_cbo_group_status
  ON public.custody_balance_operations(group_id, status);
CREATE INDEX IF NOT EXISTS idx_cbo_proposed_by
  ON public.custody_balance_operations(proposed_by);

-- RLS
ALTER TABLE public.custody_balance_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view balance operations"
  ON public.custody_balance_operations FOR SELECT
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members can create balance operations"
  ON public.custody_balance_operations FOR INSERT
  WITH CHECK (
    public.is_group_member(group_id)
    AND proposed_by = auth.uid()
  );

CREATE POLICY "Target or proposer can update balance operations"
  ON public.custody_balance_operations FOR UPDATE
  USING (
    target_user_id = auth.uid() OR proposed_by = auth.uid()
  );
