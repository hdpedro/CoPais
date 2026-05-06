-- growth_records so tinha INSERT + SELECT. Sem UPDATE/DELETE policy,
-- o native fazia DELETE direto via Supabase e Postgres retornava 0 rows
-- sem erro — Alert "Excluir" fechava mas a medida persistia (silent fail).
-- Reportado pelo Henrique no app.
--
-- Aplicada em producao 2026-05-06 via Supabase MCP.

CREATE POLICY "Coparents can update growth"
  ON public.growth_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = growth_records.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = growth_records.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "Coparents can delete growth"
  ON public.growth_records FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = growth_records.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'member')
    )
  );
