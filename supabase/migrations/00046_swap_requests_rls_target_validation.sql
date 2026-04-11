-- ============================================================
-- 00046: Validate target_user_id in swap_requests INSERT policy
-- Ensures target_user_id is a member of the same group
-- ============================================================

DROP POLICY IF EXISTS "Group members can create swap requests" ON public.swap_requests;

CREATE POLICY "Group members can create swap requests"
  ON public.swap_requests FOR INSERT
  WITH CHECK (
    public.is_group_member(group_id)
    AND requester_id = auth.uid()
    AND target_user_id IN (
      SELECT user_id FROM public.group_members WHERE group_id = swap_requests.group_id
    )
  );
