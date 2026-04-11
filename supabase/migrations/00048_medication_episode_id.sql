-- ============================================================
-- 00048: Add illness_episode_id to active_medications
-- Replaces text-based matching (reason = episode.title)
-- ============================================================

ALTER TABLE public.active_medications
  ADD COLUMN IF NOT EXISTS illness_episode_id UUID REFERENCES public.illness_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medications_episode ON public.active_medications(illness_episode_id);
