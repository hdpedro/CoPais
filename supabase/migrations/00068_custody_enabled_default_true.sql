-- Reverte o default de custody_enabled de false para true em coparenting_groups.
-- Motivo: o "Progressive Disclosure" (commit 8386ffb) tornou guarda invisivel
-- para o ICP principal (separados), causando bug critico de ativacao em iOS.
-- Guarda volta a ser core; "experiencia universal" continua disponivel via
-- dispensa do CTA na UI, nao por default tecnico.
--
-- Aplicada em producao 2026-05-05 via Supabase MCP. Migration arquivada aqui
-- para manter o repo sincronizado.
ALTER TABLE public.coparenting_groups
  ALTER COLUMN custody_enabled SET DEFAULT true;

COMMENT ON COLUMN public.coparenting_groups.custody_enabled IS
  'Ativa features de guarda compartilhada (escala, swap, balanco). Default true: guarda eh feature core. Pode ser desligado por grupos que usam o app apenas para organizacao familiar (modo universal).';

-- Backfill: grupos existentes com custody_enabled=false foram destravados.
-- 6 grupos afetados (ver historico de commits / MONETIZACAO.md 2026-05-05).
UPDATE public.coparenting_groups
SET custody_enabled = true
WHERE custody_enabled = false;
