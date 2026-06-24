-- 00124_fix_onboarding_step_on_group_join.sql
-- Corrige o bug: o ACEITE de convite nunca gravava onboarding_step, deixando o 2o
-- responsavel (coparente convidado) preso em step<4 -> via OnboardingChecklist pra
-- sempre (DashboardClient.tsx:475) e era classificado 'inactive' no user_health_score.
--
-- Padrao "normalization-on-write" (igual 00102/00103): o banco garante o estado,
-- cobrindo binarios nativos antigos que escrevem direto via supabase client (o
-- app nativo nao grava onboarding_step em lugar nenhum).

-- 1) Funcao de trigger: marca step=4 quando o grupo passa a ter 2+ membros (= aceite).
--    Nunca dispara na criacao (1o membro), preservando o fluxo create-group (step=2).
CREATE OR REPLACE FUNCTION public.mark_onboarding_complete_on_group_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.group_members WHERE group_id = NEW.group_id) >= 2 THEN
    UPDATE public.profiles
       SET onboarding_step = 4
     WHERE id = NEW.user_id
       AND COALESCE(onboarding_step, 0) < 4;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Seguranca: trigger function nao deve ser executavel via RPC publico
--    (advisor anon_security_definer_function_executable). O trigger continua
--    funcionando pois roda no contexto do owner, independente destes grants.
REVOKE ALL ON FUNCTION public.mark_onboarding_complete_on_group_join() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_onboarding_complete_on_group_join() FROM anon;
REVOKE ALL ON FUNCTION public.mark_onboarding_complete_on_group_join() FROM authenticated;

-- 3) Trigger.
DROP TRIGGER IF EXISTS trg_mark_onboarding_on_group_join ON public.group_members;
CREATE TRIGGER trg_mark_onboarding_on_group_join
AFTER INSERT ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.mark_onboarding_complete_on_group_join();

-- 4) Backfill dos convidados ja presos (grupo com 2+ membros e step<4). 7 linhas em 18/jun.
UPDATE public.profiles p SET onboarding_step = 4
WHERE COALESCE(p.onboarding_step,0) < 4
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN (SELECT group_id, count(*) n FROM public.group_members GROUP BY group_id) g
      ON g.group_id = gm.group_id
    WHERE gm.user_id = p.id AND g.n >= 2
  );
