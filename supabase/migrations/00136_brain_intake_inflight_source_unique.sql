-- 00136 — dedupe L1 do Brain: fecha a CORRIDA de envios simultâneos do
-- MESMO conteúdo (duplo toque, retry de conexão, pai e mãe mandando o
-- mesmo arquivo quase juntos). Só UM intake "em voo" por (grupo, hash do
-- conteúdo); o segundo INSERT colide (23505) e o app responde "já estou
-- processando" / reusa a prévia existente (ver intake-dedupe.ts).
--
-- Parcial de propósito: cobre APENAS estados em voo (transientes) —
-- awaiting/executed são tratados no app (e dados históricos podem ter
-- hashes repetidos legítimos; um índice total quebraria o deploy).
CREATE UNIQUE INDEX IF NOT EXISTS brain_intakes_inflight_source_uniq
  ON public.brain_intakes (group_id, source_sha256)
  WHERE status IN ('uploaded', 'analyzing') AND source_sha256 IS NOT NULL;
