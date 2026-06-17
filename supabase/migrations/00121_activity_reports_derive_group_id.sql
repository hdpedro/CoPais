-- Bug Gustavo (2026-06-17, vídeo): "o relatório não salva de fato" — o item
-- "Japonês 12/jun" ficava pendente mesmo após relatar. Causa: o report foi
-- gravado com group_id = grupo ATIVO do usuário no momento (Familia Coelho)
-- em vez do grupo da ATIVIDADE (RICH). Gustavo é membro de 3 grupos; uma
-- atividade de RICH apareceu pra relatar com outro grupo ativo, e o INSERT
-- usou activeGroup.groupId. O anti-join de pendentes (fetchPendingReports)
-- filtra reports por group_id da tela → o report "perdido" no outro grupo
-- nunca casava (activity_id+occurrence_date) → pendente eterno.
--
-- Fix "banco como fonte de verdade" (padrão dos triggers 00074/00102): o
-- group_id de um activity_report é DERIVADO da atividade — nunca confiar no
-- group_id que o cliente manda. Protege todos os binários em prod sem OTA.

CREATE OR REPLACE FUNCTION public.derive_activity_report_group_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_gid uuid;
BEGIN
  SELECT group_id INTO v_gid FROM public.child_activities WHERE id = NEW.activity_id;
  -- Só sobrescreve quando a atividade existe (FK garante na prática); senão
  -- mantém o valor do cliente como fallback defensivo.
  IF v_gid IS NOT NULL THEN
    NEW.group_id := v_gid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_reports_derive_group_id ON public.activity_reports;
CREATE TRIGGER activity_reports_derive_group_id
  BEFORE INSERT OR UPDATE ON public.activity_reports
  FOR EACH ROW EXECUTE FUNCTION public.derive_activity_report_group_id();

-- Backfill: corrige os reports já gravados com group_id divergente da
-- atividade (na aplicação em prod: 1 linha — Japonês occ 2026-06-12 do
-- Gustavo). Faz o item sumir dos pendentes sem precisar reportar de novo.
UPDATE public.activity_reports ar
SET group_id = ca.group_id
FROM public.child_activities ca
WHERE ca.id = ar.activity_id
  AND ar.group_id <> ca.group_id;
