-- 00125_mark_invite_quest_on_group_join.sql
-- APLICADA EM PROD via MCP (projeto jquaysfeeuwvoydsgssi) em 2026-06-22.
-- Persistida aqui para que `supabase db reset`/checkout limpo recriem o estado.
--
-- Paridade iOS/Android/PWA do fix do BUG 1 (convidado preso na etapa
-- "Convidar o co-responsavel" do quest de onboarding "Veja o Kindar
-- funcionando hoje").
--
-- O PWA ja resolve no read (src/actions/onboarding-quest.ts:getQuestProgress
-- marca invite_co dinamicamente quando o grupo tem 2+ membros, commit a6057f4).
-- O app NATIVO le a tabela onboarding_quests CRUA
-- (kindar-native/app/_src/services/quest.ts:getQuestProgress) -> a forma de dar
-- paridade aos 3 surfaces SEM OTA, e ainda curar quem ja esta preso, e tornar a
-- tabela a FONTE DE VERDADE: quando um grupo passa a ter 2+ membros (= existe
-- co-responsavel), a etapa invite_co esta satisfeita para os membros.
--
-- Padrao "banco como fonte de verdade" (igual 00074/00102/00103/00124).
-- O convidado nunca dispara markQuestStep('invite_co') (quem convida e o admin)
-- e a tela /convite/enviar e admin-only -> sem isto, ele ficava travado.

-- 1) Trigger function: ao entrar membro que leva o grupo a 2+, marca invite_co
--    (idempotente) para TODOS os membros do grupo -- o convidado (que nunca
--    dispara markQuestStep) e o admin (que normalmente ja tem).
CREATE OR REPLACE FUNCTION public.mark_invite_quest_on_group_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.group_members WHERE group_id = NEW.group_id) >= 2 THEN
    INSERT INTO public.onboarding_quests (user_id, step, metadata)
    SELECT gm.user_id, 'invite_co', jsonb_build_object('source', 'group_join_trigger')
      FROM public.group_members gm
     WHERE gm.group_id = NEW.group_id
    ON CONFLICT (user_id, step) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Seguranca: a funcao de trigger nao deve ser executavel via RPC publico
--    (advisor anon_security_definer_function_executable). O trigger continua
--    funcionando no contexto do owner, independente destes grants.
REVOKE ALL ON FUNCTION public.mark_invite_quest_on_group_join() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_invite_quest_on_group_join() FROM anon;
REVOKE ALL ON FUNCTION public.mark_invite_quest_on_group_join() FROM authenticated;

-- 3) Trigger.
DROP TRIGGER IF EXISTS trg_mark_invite_quest_on_group_join ON public.group_members;
CREATE TRIGGER trg_mark_invite_quest_on_group_join
AFTER INSERT ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.mark_invite_quest_on_group_join();

-- 4) Backfill: marca invite_co para todos que ja estao em grupos com 2+ membros
--    e ainda nao tem a etapa (43 usuarios distintos em 2026-06-22; still_missing=0
--    apos rodar). Idempotente.
INSERT INTO public.onboarding_quests (user_id, step, metadata)
SELECT DISTINCT gm.user_id, 'invite_co', jsonb_build_object('source', 'backfill_00125')
  FROM public.group_members gm
 WHERE (SELECT count(*) FROM public.group_members g2 WHERE g2.group_id = gm.group_id) >= 2
ON CONFLICT (user_id, step) DO NOTHING;
