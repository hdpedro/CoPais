-- Última policy unwrapped: invitations / Invitees can update invitation to accept.
-- Usa auth.jwt() (não auth.uid()), por isso passou no sweep de 00099.
-- Mesma técnica: wrap em (select auth.jwt()).
ALTER POLICY "Invitees can update invitation to accept" ON public.invitations
  USING (email = ((select auth.jwt()) ->> 'email'::text));
