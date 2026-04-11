-- ============================================================
-- 00047: Add DELETE policy for medical_appointments
-- ============================================================

CREATE POLICY "Group members can delete appointments" ON public.medical_appointments
  FOR DELETE USING (public.is_group_member(group_id));
