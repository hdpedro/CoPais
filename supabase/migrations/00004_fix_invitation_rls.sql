-- Fix: Replace auth.users table access with auth.jwt() in invitation RLS policies
-- The authenticated role doesn't have SELECT permission on auth.users table

-- Drop ALL existing invitation policies
DROP POLICY IF EXISTS "Group admins can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Invitees can update invitation to accept" ON public.invitations;
DROP POLICY IF EXISTS "Inviters can view their invitations" ON public.invitations;

-- Recreate INSERT policy (unchanged logic, just clean re-creation)
CREATE POLICY "Group admins can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (public.is_group_admin(group_id));

-- Recreate SELECT policy with auth.jwt() instead of subquery on auth.users
CREATE POLICY "Inviters can view their invitations"
  ON public.invitations FOR SELECT
  USING (
    invited_by = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR public.is_group_member(group_id)
  );

-- Recreate UPDATE policy with auth.jwt() instead of subquery on auth.users
CREATE POLICY "Invitees can update invitation to accept"
  ON public.invitations FOR UPDATE
  USING (email = (auth.jwt() ->> 'email'));
