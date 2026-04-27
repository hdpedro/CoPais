-- ============================================================
-- ONBOARDING QUEST — "O Kindar funcionando hoje"
-- ============================================================
-- Tracks the 5 premium-touching steps a new user should complete during
-- the 7-day Premium Jurídico trial. Correlating quest completion with
-- trial→paid conversion tells us whether to invest in better onboarding
-- or in better product copy.
--
-- Steps:
--   1. add_child         — adiciona 1 criança com foto
--   2. setup_calendar    — cria escala de guarda OU ativa "sem escala"
--   3. invite_co         — convida co-responsável por email
--   4. ocr_prescription  — tira foto de receita médica (premium OCR)
--   5. ai_agreement      — pede pra IA criar um acordo (premium AI)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.onboarding_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, step),
  CHECK (step IN ('add_child', 'setup_calendar', 'invite_co', 'ocr_prescription', 'ai_agreement'))
);

CREATE INDEX IF NOT EXISTS idx_onboarding_quests_user
  ON public.onboarding_quests(user_id);

-- RLS: each user can read/write their own quest progress.
ALTER TABLE public.onboarding_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quests"
  ON public.onboarding_quests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own quests"
  ON public.onboarding_quests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No UPDATE/DELETE policies by design — completion is append-only and
-- a completed step is a historical fact.
