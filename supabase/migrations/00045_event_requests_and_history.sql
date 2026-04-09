-- ============================================================
-- 00045: Event Requests & Event History
-- Sistema de aprovacao para eventos + audit trail
-- ============================================================

-- ============================================================
-- 1. EVENT REQUESTS
-- ============================================================
CREATE TABLE public.event_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  affected_user_ids UUID[] NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('edit', 'cancel', 'reschedule', 'delete')),
  proposed_changes JSONB,
  original_snapshot JSONB NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled_by_system')),
  approval_mode TEXT NOT NULL DEFAULT 'any' CHECK (approval_mode IN ('any', 'all')),
  cancelled_reason TEXT,
  responded_by UUID REFERENCES public.profiles(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Max 1 pending request per event (partial unique index, no extension needed)
CREATE UNIQUE INDEX idx_event_requests_one_pending
  ON public.event_requests(event_id)
  WHERE (status = 'pending');

CREATE INDEX idx_event_requests_event ON public.event_requests(event_id);
CREATE INDEX idx_event_requests_status ON public.event_requests(status);
CREATE INDEX idx_event_requests_group ON public.event_requests(group_id);

-- RLS
ALTER TABLE public.event_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view event requests"
  ON public.event_requests FOR SELECT
  USING (group_id IN (
    SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can create event requests"
  ON public.event_requests FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Affected users and requester can update"
  ON public.event_requests FOR UPDATE
  USING (
    auth.uid() = ANY(affected_user_ids)
    OR requester_id = auth.uid()
  );

-- ============================================================
-- 2. EVENT HISTORY (audit trail)
-- ============================================================
CREATE TABLE public.event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'created', 'updated', 'cancelled', 'deleted',
    'request_created', 'request_approved', 'request_rejected', 'request_cancelled'
  )),
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  before_snapshot JSONB,
  after_snapshot JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_history_event ON public.event_history(event_id);
CREATE INDEX idx_event_history_created ON public.event_history(created_at);

-- RLS
ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view event history"
  ON public.event_history FOR SELECT
  USING (group_id IN (
    SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can insert event history"
  ON public.event_history FOR INSERT
  WITH CHECK (group_id IN (
    SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
  ));

-- ============================================================
-- 3. NOTIFICATION TYPES
-- ============================================================
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_response';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_changed';
