-- Add missing index for group-level illness queries
CREATE INDEX IF NOT EXISTS idx_illness_episodes_group ON public.illness_episodes(group_id);

-- Add missing index for child_medical_info queries
CREATE INDEX IF NOT EXISTS idx_child_medical_info_child ON public.child_medical_info(child_id);
