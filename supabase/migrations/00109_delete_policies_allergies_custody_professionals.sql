-- Mesma classe do 00108 (RLS DELETE faltando), achada num audit de TODOS os
-- safeWrite delete do client (2026-06-04) e autorizada pelo dono. As tabelas
-- child_allergies, custody_events e medical_professionals tinham RLS ligado +
-- o client deletando via safeWrite, mas NENHUMA policy DELETE -> delete negado
-- silenciosamente (apagar alergia / evento de férias-custódia / profissional
-- não funcionava — latente, ainda não reportado, quebrado igual ao expenses).
--
-- Escopo espelha as policies UPDATE/SELECT existentes dessas tabelas
-- (is_group_member(group_id): qualquer membro do grupo gerencia o dado
-- compartilhado da família). FKs que referenciam essas 3 tabelas são todas
-- ON DELETE SET NULL (medical_appointments.calendar_event_id / .professional_id,
-- child_medical_info.primary_pediatrician_id) -> não bloqueiam o delete.
--
-- Tabelas que JÁ tinham DELETE policy (ok, fora deste fix): events,
-- growth_records, medical_appointments, private_notes, expenses (00108).
-- Server-side: vale pros 3 clientes (Native iOS/Android + PWA) na hora.

CREATE POLICY "Group members can delete allergies"
ON public.child_allergies FOR DELETE USING (is_group_member(group_id));

CREATE POLICY "Group members can delete custody events"
ON public.custody_events FOR DELETE USING (is_group_member(group_id));

CREATE POLICY "Group members can delete professionals"
ON public.medical_professionals FOR DELETE USING (is_group_member(group_id));
