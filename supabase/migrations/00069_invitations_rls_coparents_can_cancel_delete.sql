-- Permite que pais responsaveis (admin OU member) do grupo cancelem
-- ou excluam convites pendentes via RLS direta. Antes, so a INSERT
-- policy era admin-only e nao havia policy para pais cancelarem — o
-- native fazia UPDATE direto e falhava silenciosamente (0 rows).
--
-- Tambem relaxa a policy de INSERT para aceitar member (alem de admin),
-- alinhando com a regra "pai e mae em pe de igualdade" aplicada nas
-- server actions (commit 41a5988).
--
-- Aplicada em producao 2026-05-06 via Supabase MCP.

DROP POLICY IF EXISTS "Group admins can create invitations" ON public.invitations;

CREATE POLICY "Coparents can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = invitations.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "Coparents can cancel invitations"
  ON public.invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = invitations.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = invitations.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "Coparents can delete invitations"
  ON public.invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = invitations.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  );
