-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coparenting_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Helper: check if user belongs to a group
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is admin of a group
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES
CREATE POLICY "Users can view profiles of group co-members"
  ON public.profiles FOR SELECT USING (
    id = auth.uid()
    OR id IN (
      SELECT gm2.user_id FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- COPARENTING GROUPS
CREATE POLICY "Members can view their groups"
  ON public.coparenting_groups FOR SELECT
  USING (public.is_group_member(id));
CREATE POLICY "Authenticated users can create groups"
  ON public.coparenting_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- GROUP MEMBERS
CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Admins can insert group members"
  ON public.group_members FOR INSERT
  WITH CHECK (public.is_group_admin(group_id) OR user_id = auth.uid());

-- CHILDREN
CREATE POLICY "Group members can view children"
  ON public.children FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can insert children"
  ON public.children FOR INSERT
  WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Group members can update children"
  ON public.children FOR UPDATE
  USING (public.is_group_member(group_id));

-- CUSTODY EVENTS
CREATE POLICY "Group members can view custody events"
  ON public.custody_events FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create custody events"
  ON public.custody_events FOR INSERT
  WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Group members can update custody events"
  ON public.custody_events FOR UPDATE
  USING (public.is_group_member(group_id));

-- EXPENSES
CREATE POLICY "Group members can view expenses"
  ON public.expenses FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND paid_by = auth.uid());
CREATE POLICY "Group members can update expense status"
  ON public.expenses FOR UPDATE
  USING (public.is_group_member(group_id));

-- CHAT MESSAGES
CREATE POLICY "Group members can view messages"
  ON public.chat_messages FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND sender_id = auth.uid());
CREATE POLICY "Group members can update read status and pin"
  ON public.chat_messages FOR UPDATE
  USING (public.is_group_member(group_id));
CREATE POLICY "No one can delete messages"
  ON public.chat_messages FOR DELETE
  USING (false);

-- HEALTH LOGS
CREATE POLICY "Group members can view health logs"
  ON public.health_logs FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create health logs"
  ON public.health_logs FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND logged_by = auth.uid());

-- DOCUMENTS
CREATE POLICY "Group members can view documents"
  ON public.documents FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND uploaded_by = auth.uid());

-- SWAP REQUESTS
CREATE POLICY "Group members can view swap requests"
  ON public.swap_requests FOR SELECT
  USING (public.is_group_member(group_id));
CREATE POLICY "Group members can create swap requests"
  ON public.swap_requests FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND requester_id = auth.uid());
CREATE POLICY "Target user can update swap request"
  ON public.swap_requests FOR UPDATE
  USING (target_user_id = auth.uid());

-- NOTIFICATIONS
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- INVITATIONS
CREATE POLICY "Inviters can view their invitations"
  ON public.invitations FOR SELECT
  USING (invited_by = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Group admins can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (public.is_group_admin(group_id));
CREATE POLICY "Invitees can update invitation to accept"
  ON public.invitations FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
