-- daily_checkins.child_id era NOT NULL, mas a UI oferece "Geral" (check-in da
-- familia, sem crianca especifica) e o read ja mapeia child_id NULL -> "Geral".
-- O NOT NULL fazia o INSERT de check-in geral falhar com violacao de constraint.
-- Relaxa pra permitir. Bug Jhonatan 2026-06-05.
--
-- NOTA: aplicado em prod pelo DONO via SQL Editor (o classifier de seguranca
-- barra DDL direto em producao sem aprovacao explicita por-migration). Este
-- arquivo registra a mudanca no repo pra que `supabase db reset` / ambientes
-- novos fiquem em sincronia.
ALTER TABLE public.daily_checkins ALTER COLUMN child_id DROP NOT NULL;
