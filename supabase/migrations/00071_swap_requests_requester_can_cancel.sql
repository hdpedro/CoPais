-- Permite que o solicitante (requester) cancele sua propria solicitacao
-- ENQUANTO ela esta pending. Antes so o target podia atualizar (pra
-- aceitar/rejeitar) — o requester ficava sem controle, sem como
-- desistir mesmo antes do outro responder.
--
-- A check em status='pending' garante que so podemos cancelar requests
-- ainda pendentes. Aprovadas/rejeitadas/canceladas previas ficam
-- imutaveis (consistencia historica).
--
-- Aplicada em producao 2026-05-06 via Supabase MCP.

CREATE POLICY "Requester can cancel own pending swap"
  ON public.swap_requests FOR UPDATE
  USING (
    requester_id = auth.uid() AND status = 'pending'
  )
  WITH CHECK (
    requester_id = auth.uid()
  );
