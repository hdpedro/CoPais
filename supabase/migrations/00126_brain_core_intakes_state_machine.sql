-- ============================================================
-- MIGRATION 126: Kindar Brain — Family Inbox (núcleo do intake)
--
-- Institui a infraestrutura compartilhada do "Kindar Brain": toda
-- entrada (foto, áudio, mensagem, comando) vira um INTAKE que percorre
-- compreender → impacto → priorizar → planejar → confirmar → executar →
-- coordenar. Esta migration entrega só a BASE (Épico A do plano):
--
--   1. brain_intakes          — máquina de estados + versionamento
--   2. brain_intake_artifacts — proveniência (de qual intake veio cada
--                                registro) + detach-on-edit pro undo seguro
--   3. brain_intake_audit     — trilha imutável (analyzed/confirmed/undone…)
--   4. brain_outbox           — transactional outbox da coordenação
--   5. child_activities       — reminder_routing + reminder_rule + provenance
--   6. coparenting_groups     — timezone canônico (IANA)
--   7. RPCs de transição      — guardas atômicos de concorrência
--
-- Premissas (CLAUDE.md + plano aprovado):
--   - RLS por is_group_member (migration 00008); audit imutável.
--   - Transições contendidas (begin_analysis, claim_execution) via RPC
--     SECURITY DEFINER atômico — 2ª chamada concorrente pega 0 linhas.
--   - plan_hash é calculado no app sobre JSON canônico incluindo
--     playbook_version + policy_version (rastreabilidade da confirmação).
--   - Idempotência NÃO bloqueia (sem UNIQUE) — só índice de lookup; o
--     serviço pergunta "ver o anterior ou refazer?".
--   - Proposta bilateral de escala (Épico C) NÃO entra aqui.
-- ============================================================

-- ─── 1. brain_intakes — máquina de estados + versionamento ───

CREATE TABLE IF NOT EXISTS public.brain_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  -- nullable: a criança pode não estar resolvida antes da desambiguação.
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),

  source  TEXT NOT NULL CHECK (source  IN ('document','audio','message','command')),
  channel TEXT NOT NULL CHECK (channel IN ('pwa','native','whatsapp')),
  -- doc_type = docType do playbook ('school_calendar', 'unknown_document'…);
  -- null até a classificação.
  doc_type TEXT,

  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded',
    'analyzing',            -- protege duas análises simultâneas
    'analyzed',
    'awaiting_confirmation',
    'executing',
    'executed',
    'failed',
    'expired',
    'canceled',
    'undone'
  )),

  -- ── versionamento / rastreio (correção 1 do plano) ──
  playbook_version  INT,
  schema_version    INT NOT NULL DEFAULT 1,
  policy_version    INT,
  analysis_provider TEXT,           -- OpenAI/Groq/…
  analysis_model    TEXT,           -- gpt-4o, whisper-large-v3…

  -- ── idempotência (não-cega) ──
  source_media_ref  TEXT,           -- ex: WhatsApp message id (chave primária)
  source_media_path TEXT,           -- caminho no Storage do arquivo original
  source_sha256     TEXT,           -- hash do arquivo ORIGINAL (antes de comprimir)
  input_hash        TEXT,           -- hash da entrada normalizada

  -- snapshot da agenda usado no impacto (revalidação preview→confirm)
  context_version   TIMESTAMPTZ,

  -- ── plano + confirmação ──
  extracted JSONB,                  -- saída do Understanding
  impacts   JSONB,                  -- ImpactFinding[]
  plan      JSONB,                  -- MaterializationPlan
  plan_version INT NOT NULL DEFAULT 0,
  plan_hash    TEXT,                -- canônico, inclui playbook+policy version
  confirmation_token       UUID,
  confirmation_expires_at  TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.profiles(id),

  -- ── ciclo de vida ──
  error           TEXT,
  retention_expiry TIMESTAMPTZ,     -- processed_at + 90d (purge cron)
  analyzed_at  TIMESTAMPTZ,
  executed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices: feed por grupo/status, dedup por hash/ref, purge por retenção,
-- expiração de confirmação.
CREATE INDEX IF NOT EXISTS idx_brain_intakes_group_status
  ON public.brain_intakes (group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_intakes_sha
  ON public.brain_intakes (group_id, source_sha256);
CREATE INDEX IF NOT EXISTS idx_brain_intakes_media_ref
  ON public.brain_intakes (group_id, channel, source_media_ref);
CREATE INDEX IF NOT EXISTS idx_brain_intakes_retention
  ON public.brain_intakes (retention_expiry)
  WHERE retention_expiry IS NOT NULL AND source_media_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brain_intakes_awaiting
  ON public.brain_intakes (confirmation_expires_at)
  WHERE status = 'awaiting_confirmation';

ALTER TABLE public.brain_intakes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intakes' AND policyname='brain_intakes group read') THEN
    CREATE POLICY "brain_intakes group read" ON public.brain_intakes
      FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intakes' AND policyname='brain_intakes self insert') THEN
    CREATE POLICY "brain_intakes self insert" ON public.brain_intakes
      FOR INSERT WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id));
  END IF;
  -- UPDATE direto só pelo criador (defesa em profundidade); as transições
  -- contendidas passam pelas RPCs SECURITY DEFINER abaixo.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intakes' AND policyname='brain_intakes creator update') THEN
    CREATE POLICY "brain_intakes creator update" ON public.brain_intakes
      FOR UPDATE USING (created_by = auth.uid() AND public.is_group_member(group_id));
  END IF;
END $$;

-- ─── 2. brain_intake_artifacts — proveniência + detach-on-edit ─

CREATE TABLE IF NOT EXISTS public.brain_intake_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL REFERENCES public.brain_intakes(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL,                 -- desnormalizado pra RLS
  entity_type TEXT NOT NULL,               -- 'child_activity','note','expense','custody_event'
  entity_id   UUID NOT NULL,               -- polimórfico (sem FK)
  -- hash do payload no momento da criação. No undo, comparamos com o
  -- hash atual da entidade: se divergiu, foi editada depois → detach.
  original_payload_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ,                 -- editada após a criação
  detached_at TIMESTAMPTZ,                 -- undo pulou (preserva trabalho posterior)
  undone_at   TIMESTAMPTZ                  -- removida pelo undo
);

CREATE INDEX IF NOT EXISTS idx_brain_artifacts_intake
  ON public.brain_intake_artifacts (intake_id);
CREATE INDEX IF NOT EXISTS idx_brain_artifacts_entity
  ON public.brain_intake_artifacts (entity_type, entity_id);

ALTER TABLE public.brain_intake_artifacts ENABLE ROW LEVEL SECURITY;

-- Proveniência é APPEND-ONLY do ponto de vista do cliente: as linhas são
-- escritas SÓ pela RPC SECURITY DEFINER (brain_intake_execute_plan) e as
-- mutações do undo (detached_at/undone_at) virão por outra RPC definer — as
-- duas fazem bypass de RLS por serem do owner. Então o cliente só precisa de
-- SELECT (a UI do undo mostra "7 serão removidos, 1 permanece"). INSERT/UPDATE
-- pelo cliente seria forjar/adulterar proveniência → removido (least-privilege).
-- DROP defensivo p/ idempotência caso um ambiente já tenha as policies antigas.
DROP POLICY IF EXISTS "brain_artifacts group insert" ON public.brain_intake_artifacts;
DROP POLICY IF EXISTS "brain_artifacts group update" ON public.brain_intake_artifacts;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intake_artifacts' AND policyname='brain_artifacts group read') THEN
    CREATE POLICY "brain_artifacts group read" ON public.brain_intake_artifacts
      FOR SELECT USING (public.is_group_member(group_id));
  END IF;
END $$;

-- ─── 3. brain_intake_audit — trilha imutável ─────────────────

CREATE TABLE IF NOT EXISTS public.brain_intake_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL REFERENCES public.brain_intakes(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL,
  actor_id  UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL CHECK (action IN (
    'uploaded','analyzed','awaiting_confirmation','confirmed',
    'executed','failed','expired','canceled','undone','media_purged'
  )),
  detail JSONB,                            -- batch_size, detached_count, provider…
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_audit_intake
  ON public.brain_intake_audit (intake_id, at DESC);

ALTER TABLE public.brain_intake_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intake_audit' AND policyname='brain_audit group read') THEN
    CREATE POLICY "brain_audit group read" ON public.brain_intake_audit
      FOR SELECT USING (public.is_group_member(group_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brain_intake_audit' AND policyname='brain_audit member insert') THEN
    CREATE POLICY "brain_audit member insert" ON public.brain_intake_audit
      FOR INSERT WITH CHECK (public.is_group_member(group_id));
  END IF;
  -- Sem UPDATE/DELETE — imutável.
END $$;

-- ─── 4. brain_outbox — transactional outbox da coordenação ───
-- Fila interna: a criação dos registros + a linha de outbox entram na
-- MESMA transação. Um worker entrega (push/collab) com retry idempotente.
-- Sem políticas de cliente: só service_role acessa (RLS habilitada, zero
-- policies → clientes não leem/escrevem; service_role faz bypass).

CREATE TABLE IF NOT EXISTS public.brain_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL,
  intake_id  UUID REFERENCES public.brain_intakes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                -- 'collab_notify','push'
  -- chave de idempotência da entrega (evita push duplicado em retry)
  dedupe_key TEXT,
  payload JSONB NOT NULL,
  -- 'dead' = dead-letter (esgotou retries) — painel de falhas, não some.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','delivered','failed','dead')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_brain_outbox_due
  ON public.brain_outbox (status, next_attempt_at)
  WHERE status IN ('pending','failed');
CREATE UNIQUE INDEX IF NOT EXISTS uq_brain_outbox_dedupe
  ON public.brain_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.brain_outbox ENABLE ROW LEVEL SECURITY;
-- (nenhuma policy: acesso só via service_role)

-- ─── 5. child_activities — routing + rule + proveniência ─────

ALTER TABLE public.child_activities
  ADD COLUMN IF NOT EXISTS reminder_routing TEXT NOT NULL DEFAULT 'auto'
    CHECK (reminder_routing IN ('auto','static','by_custody','by_dropoff')),
  -- regra de lembrete estruturada (correção 4): substitui o número mágico
  -- reminder_lead_minutes:-2 por { type, time, timezone }. O serviço
  -- mantém um adaptador que traduz pro sentinela enquanto o cron exige.
  ADD COLUMN IF NOT EXISTS reminder_rule JSONB,
  ADD COLUMN IF NOT EXISTS source_intake_id UUID REFERENCES public.brain_intakes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_child_activities_source_intake
  ON public.child_activities (source_intake_id)
  WHERE source_intake_id IS NOT NULL;

-- ─── 6. coparenting_groups — timezone canônico (IANA) ────────

ALTER TABLE public.coparenting_groups
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- ─── 7. RPCs de transição (guardas atômicos de concorrência) ──

-- Começa a análise. Protege duas análises simultâneas: a 2ª chamada
-- concorrente não casa o status e recebe linha NULL.
CREATE OR REPLACE FUNCTION public.brain_intake_begin_analysis(p_intake_id UUID)
RETURNS public.brain_intakes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE r public.brain_intakes;
BEGIN
  UPDATE public.brain_intakes
     SET status = 'analyzing', updated_at = now()
   WHERE id = p_intake_id
     AND status IN ('uploaded','analyzed','failed')   -- permite reprocessar
     AND public.is_group_member(group_id)
  RETURNING * INTO r;
  RETURN r;  -- NULL se já 'analyzing' (corrida) ou sem permissão
END;
$f$;

-- Reivindica a execução: confirmação blindada (correção 1 + 3 do plano).
-- Transição atômica awaiting_confirmation → executing somente se o
-- plan_hash bate (o usuário confirma o plano que VIU), o token confere e
-- a confirmação não expirou. 2ª confirmação concorrente pega 0 linhas
-- (→ already_processing); hash divergente → reanálise; expirado → reanálise.
CREATE OR REPLACE FUNCTION public.brain_intake_claim_execution(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID
)
RETURNS public.brain_intakes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE r public.brain_intakes;
BEGIN
  UPDATE public.brain_intakes
     SET status = 'executing', confirmed_by = auth.uid(), updated_at = now()
   WHERE id = p_intake_id
     AND status = 'awaiting_confirmation'
     AND plan_hash = p_plan_hash
     AND confirmation_token = p_token
     AND (confirmation_expires_at IS NULL OR confirmation_expires_at > now())
     AND public.is_group_member(group_id)
  RETURNING * INTO r;
  RETURN r;  -- NULL → already_processing / hash_mismatch / expired (caller relê)
END;
$f$;

-- Materialização ATÔMICA (outbox transacional, correção 6). O SDK JS do
-- Supabase NÃO tem BEGIN/COMMIT — então "a criação dos registros + a linha de
-- outbox entram na MESMA transação" tem que viver numa função plpgsql (1
-- chamada = 1 transação). Faz: claim (reusa brain_intake_claim_execution, sem
-- duplicar o guard) → cria N child_activities + checklist + proveniência
-- (brain_intake_artifacts) → enfileira outbox (idempotente por dedupe_key) →
-- audita → executed. Falha em QUALQUER insert reverte TUDO (inclusive o claim →
-- status volta a awaiting_confirmation): nunca materialização parcial. O insert
-- em child_activities dispara o trigger 00074 (calendar_occurrences) na MESMA
-- transação. `confirmed_by` sai do auth.uid() do claim (quem confirmou).
CREATE OR REPLACE FUNCTION public.brain_intake_execute_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_activities JSONB,
  p_outbox JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v public.brain_intakes;
  v_act_id UUID;
  v_ids UUID[] := '{}';
  v_count INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  -- Claim atômico na MESMA transação (reusa o guard testado). 2ª confirmação
  -- concorrente / hash divergente / token errado / expirado → id NULL.
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;

  -- Materializa cada atividade + checklist + proveniência (append-only).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) LOOP
    INSERT INTO public.child_activities(
      group_id, child_id, name, category, recurrence_type, start_date,
      time_start, notes, reminder_rule, reminder_routing, source_intake_id, created_by, is_active
    ) VALUES (
      v.group_id,
      -- backstop: child_id só é castado se for UUID válido (o app já valida em
      -- validate-plan.ts); qualquer outra coisa vira NULL em vez de lançar e
      -- abortar a transação inteira por um cast.
      CASE WHEN a->>'child_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (a->>'child_id')::uuid ELSE NULL END,
      a->>'name',
      coalesce(a->>'category', 'school'),
      'never',
      (a->>'start_date')::date,
      nullif(a->>'time_start', '')::time,
      a->>'notes',
      a->'reminder_rule',
      coalesce(a->>'reminder_routing', 'auto'),
      p_intake_id,
      v.created_by,
      true
    ) RETURNING id INTO v_act_id;

    v_count := v_count + 1;
    v_ids := v_ids || v_act_id;

    IF a ? 'checklist' THEN
      INSERT INTO public.activity_checklist_items(activity_id, name, sort_order)
      SELECT v_act_id, elem, ord - 1
      FROM jsonb_array_elements_text(a->'checklist') WITH ORDINALITY AS t(elem, ord);
    END IF;

    -- Proveniência: de qual intake veio + hash do payload (pro undo seguro
    -- detectar edição posterior).
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'child_activity', v_act_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key (retry não duplica).
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, auth.uid(), 'executed', jsonb_build_object('created_count', v_count));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed', 'created_count', v_count, 'activity_ids', to_jsonb(v_ids));
END;
$f$;

-- Least-privilege: o Postgres concede EXECUTE a PUBLIC por padrão e o Supabase
-- concede `anon` EXPLICITAMENTE (default privileges) — revogar só de PUBLIC não
-- basta, `anon` continua executando. Revogamos de PUBLIC E de anon e concedemos
-- só a `authenticated`: `anon` não deve alcançar os guards de transição (mesmo
-- que `is_group_member` já os barre por dentro). Padrão do projeto contra o
-- lint anon_security_definer (vazamento de função definer pra anon).
REVOKE EXECUTE ON FUNCTION public.brain_intake_begin_analysis(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.brain_intake_claim_execution(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.brain_intake_execute_plan(UUID, TEXT, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_begin_analysis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brain_intake_claim_execution(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_plan(UUID, TEXT, UUID, JSONB, JSONB) TO authenticated;
