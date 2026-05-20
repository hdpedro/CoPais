-- Fix: FK child_sizes.created_by → profiles(id) (era → auth.users)
--
-- Por que: PostgREST resolve joins via FK explícita. O service em
-- src/lib/services/child-sizes.ts faz:
--   .select("..., profiles!child_sizes_created_by_fkey(full_name)")
-- esperando que a FK aponte pra profiles. Como a 00086 criou apontando
-- pra auth.users, o join FALHA silenciosamente — getCurrentSizes e
-- getSizeHistory retornam [] mesmo com rows no banco. UI mostra
-- "Tamanhos" vazio depois de salvar (bug reportado por Henrique em
-- 2026-05-19, 4 saves OK no banco, tela em branco).
--
-- Outras tabelas Foundation Collab já seguem esse padrão:
--   expenses_paid_by_fkey → profiles(id)
--   medical_appointments_created_by_fkey → profiles(id)
-- Migration 00086 (Foundation Collab #7) saiu fora do padrão.
--
-- profiles.id é mesmo UUID que auth.users.id (1:1), então a re-criação
-- não viola dados existentes. ON DELETE NO ACTION preserva histórico
-- mesmo se o profile sumir (matching medical_appointments).
ALTER TABLE public.child_sizes
  DROP CONSTRAINT IF EXISTS child_sizes_created_by_fkey;

ALTER TABLE public.child_sizes
  ADD CONSTRAINT child_sizes_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles(id)
  ON DELETE NO ACTION;

-- Refresh PostgREST schema cache pra reconhecer o novo relationship
-- imediatamente (sem precisar restart). Padrão Supabase.
NOTIFY pgrst, 'reload schema';
