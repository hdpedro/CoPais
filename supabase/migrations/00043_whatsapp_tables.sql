-- ================================================================
-- Migration 00043: WhatsApp Integration Tables
-- Kindar Assistente (WhatsApp IA)
-- ================================================================

-- 1. whatsapp_phone_links — vincula numero WhatsApp ao perfil
CREATE TABLE public.whatsapp_phone_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  verification_code TEXT,
  verification_expires_at TIMESTAMPTZ,
  active_group_id UUID REFERENCES public.coparenting_groups(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  lgpd_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone_number)
);

CREATE INDEX idx_wa_phone_hash ON whatsapp_phone_links(phone_hash) WHERE is_active = true;
CREATE INDEX idx_wa_phone_user ON whatsapp_phone_links(user_id);

-- 2. whatsapp_sessions — estado da conversa
CREATE TABLE public.whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.coparenting_groups(id) ON DELETE SET NULL,
  state JSONB NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone_number)
);

CREATE INDEX idx_wa_sessions_user ON whatsapp_sessions(user_id);

-- 3. whatsapp_message_logs — log de mensagens
CREATE TABLE public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  wa_message_id TEXT,
  status TEXT DEFAULT 'received',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_logs_phone ON whatsapp_message_logs(phone_number, created_at DESC);
CREATE INDEX idx_wa_logs_user ON whatsapp_message_logs(user_id, created_at DESC);
CREATE INDEX idx_wa_logs_wa_id ON whatsapp_message_logs(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- 4. whatsapp_notification_preferences — preferencias de notificacao
CREATE TABLE public.whatsapp_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_summary BOOLEAN NOT NULL DEFAULT true,
  event_reminders BOOLEAN NOT NULL DEFAULT true,
  expense_notifications BOOLEAN NOT NULL DEFAULT true,
  custody_alerts BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ================================================================
-- RLS Policies
-- ================================================================

ALTER TABLE public.whatsapp_phone_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_preferences ENABLE ROW LEVEL SECURITY;

-- whatsapp_phone_links: usuarios podem CRUD apenas seus proprios registros
CREATE POLICY "Users can view own phone links"
  ON public.whatsapp_phone_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phone links"
  ON public.whatsapp_phone_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own phone links"
  ON public.whatsapp_phone_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own phone links"
  ON public.whatsapp_phone_links FOR DELETE
  USING (auth.uid() = user_id);

-- whatsapp_sessions: apenas service role (webhook usa admin client)
-- Nenhuma policy para usuarios normais — acesso somente via service role

-- whatsapp_message_logs: usuarios podem ler seus proprios logs
CREATE POLICY "Users can view own message logs"
  ON public.whatsapp_message_logs FOR SELECT
  USING (auth.uid() = user_id);

-- whatsapp_notification_preferences: usuarios podem CRUD seus proprios
CREATE POLICY "Users can view own notification prefs"
  ON public.whatsapp_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification prefs"
  ON public.whatsapp_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification prefs"
  ON public.whatsapp_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification prefs"
  ON public.whatsapp_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- Auto-update updated_at triggers
-- ================================================================

CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wa_phone_links_updated_at
  BEFORE UPDATE ON public.whatsapp_phone_links
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER trg_wa_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER trg_wa_notif_prefs_updated_at
  BEFORE UPDATE ON public.whatsapp_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();
