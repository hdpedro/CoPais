-- Add responsible_override column to activity_reports
-- Allows overriding the custody-based responsible person for a specific activity occurrence
ALTER TABLE public.activity_reports
  ADD COLUMN IF NOT EXISTS responsible_override UUID REFERENCES public.profiles(id);

-- Allow group members to update reports (for responsible override changes)
CREATE POLICY "Group members can update reports"
  ON public.activity_reports FOR UPDATE
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));
