-- ============================================================
-- COPAIS DATABASE SCHEMA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
CREATE TYPE user_role AS ENUM ('parent', 'grandparent', 'caregiver', 'mediator', 'lawyer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  display_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'parent',
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  lgpd_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. COPARENTING GROUPS
-- ============================================================
CREATE TABLE public.coparenting_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. GROUP MEMBERS
-- ============================================================
CREATE TYPE member_role AS ENUM ('admin', 'member', 'readonly');

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- ============================================================
-- 4. CHILDREN
-- ============================================================
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  photo_url TEXT,
  allergies TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. CUSTODY CALENDAR
-- ============================================================
CREATE TYPE custody_type AS ENUM ('regular', 'holiday', 'swap', 'vacation', 'special');

CREATE TABLE public.custody_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  responsible_user_id UUID NOT NULL REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  custody_type custody_type NOT NULL DEFAULT 'regular',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- ============================================================
-- 6. EXPENSES
-- ============================================================
CREATE TYPE expense_category AS ENUM (
  'education', 'health', 'food', 'clothing',
  'transport', 'leisure', 'housing', 'other'
);
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'disputed');

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id),
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  paid_by UUID NOT NULL REFERENCES public.profiles(id),
  split_ratio JSONB NOT NULL DEFAULT '{"default": 50}',
  receipt_url TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. CHAT MESSAGES (legally non-deletable)
-- ============================================================
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  text TEXT,
  audio_url TEXT,
  image_url TEXT,
  reply_to_id UUID REFERENCES public.chat_messages(id),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  read_by JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at, NO deleted_at: messages are immutable
);

-- Prevent physical deletion
CREATE OR REPLACE FUNCTION prevent_chat_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Chat messages cannot be deleted for legal compliance';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_chat_messages
  BEFORE DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION prevent_chat_delete();

-- Prevent text modification
CREATE OR REPLACE FUNCTION prevent_chat_text_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.text IS DISTINCT FROM NEW.text THEN
    RAISE EXCEPTION 'Chat message text cannot be modified for legal compliance';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_chat_text
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION prevent_chat_text_update();

-- ============================================================
-- 8. HEALTH LOGS
-- ============================================================
CREATE TYPE health_log_type AS ENUM (
  'fever', 'medication', 'mood', 'screen_time',
  'food', 'sleep', 'weight', 'height', 'vaccine', 'other'
);

CREATE TABLE public.health_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  log_type health_log_type NOT NULL,
  value TEXT,
  notes TEXT,
  logged_by UUID NOT NULL REFERENCES public.profiles(id),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. DOCUMENTS
-- ============================================================
CREATE TYPE document_category AS ENUM ('personal', 'health', 'education', 'legal', 'other');

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id),
  category document_category NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. SWAP REQUESTS
-- ============================================================
CREATE TYPE swap_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE public.swap_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id),
  original_date DATE NOT NULL,
  proposed_date DATE,
  reason TEXT,
  status swap_status NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. NOTIFICATIONS
-- ============================================================
CREATE TYPE notification_type AS ENUM (
  'expense_new', 'expense_approved', 'expense_rejected',
  'swap_request', 'swap_response',
  'chat_message', 'document_uploaded',
  'custody_change', 'invitation', 'system'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. INVITATIONS
-- ============================================================
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  email TEXT,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'parent',
  group_role member_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_children_group ON public.children(group_id);
CREATE INDEX idx_custody_events_group_date ON public.custody_events(group_id, start_date, end_date);
CREATE INDEX idx_expenses_group ON public.expenses(group_id);
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX idx_chat_messages_group_created ON public.chat_messages(group_id, created_at);
CREATE INDEX idx_health_logs_child ON public.health_logs(child_id, logged_at);
CREATE INDEX idx_documents_group ON public.documents(group_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at);
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.custody_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
