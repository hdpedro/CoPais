-- 00123_v_user_activation.sql
-- Fonte de verdade de ATIVACAO comportamental do Kindar.
--
-- Motivo: profiles.onboarding_step e furado como metrica e NAO deve ser usado para
-- ativacao/retencao/coparentalidade:
--   1) Backfill da migration 00040 promoveu a step=4 todo usuario que ja tinha grupo
--      (nao passou pelo fluxo real).
--   2) O ACEITE de convite nunca grava o step -> o 2o responsavel fica preso em step=0
--      mesmo plenamente ativo (corrigido na 00124).
--   3) O app nativo (kindar-native) nao grava onboarding_step em lugar nenhum.
--   4) step=4 nao implica coparente (so ~33% tem grupo 2+).
--
-- Esta view le o ESTADO FACTUAL das tabelas de dominio (independe de onboarding_step):
--   has_group     -> tem membership em algum grupo
--   has_child     -> o grupo tem ao menos uma crianca (nucleo montado)
--   has_coparent  -> grupo com 2+ membros (coparentalidade real; NUNCA inferir de step=4)
--   has_real_use  -> o usuario gerou >=1 sinal de uso (atividade, evento ou mensagem)
--   is_activated  -> nucleo montado E uso real
--
-- security_invoker=true segue o padrao de 00076_security_definer_views_invoker.

CREATE OR REPLACE VIEW public.v_user_activation
WITH (security_invoker = true) AS
SELECT *,
  (has_child AND has_real_use) AS is_activated
FROM (
  WITH grp AS (
    SELECT group_id, count(*) AS members
    FROM public.group_members GROUP BY group_id
  )
  SELECT
    p.id AS user_id,
    COALESCE(p.is_test_account, false) AS is_test,
    EXISTS (SELECT 1 FROM public.group_members gm
            WHERE gm.user_id = p.id) AS has_group,
    EXISTS (SELECT 1 FROM public.group_members gm
            JOIN public.children c ON c.group_id = gm.group_id
            WHERE gm.user_id = p.id) AS has_child,
    EXISTS (SELECT 1 FROM public.group_members gm
            JOIN grp ON grp.group_id = gm.group_id
            WHERE gm.user_id = p.id AND grp.members >= 2) AS has_coparent,
    ( EXISTS (SELECT 1 FROM public.child_activities a WHERE a.created_by = p.id)
   OR EXISTS (SELECT 1 FROM public.events e          WHERE e.created_by = p.id)
   OR EXISTS (SELECT 1 FROM public.chat_messages m   WHERE m.sender_id = p.id)
    ) AS has_real_use
  FROM public.profiles p
) s;

COMMENT ON VIEW public.v_user_activation IS 'Ativacao comportamental por usuario (grupo + filho + uso real). Fonte de verdade de ativacao; usar no lugar de profiles.onboarding_step. has_coparent = grupo com 2+ membros.';
