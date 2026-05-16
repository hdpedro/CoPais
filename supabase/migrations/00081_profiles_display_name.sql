-- =====================================================================
-- 00081_profiles_display_name.sql
-- =====================================================================
-- Banco como fonte única de verdade do display_name, preservando override
-- do usuário.
--
-- Estado anterior:
--   - `display_name` já existia como coluna normal (sem GENERATED).
--   - 1 usuário tinha override custom ("Barata" vs full_name "Angelino Silva
--     Barata") — semântica válida que precisa ser preservada.
--   - Outros 56/57 profiles tinham display_name vazio → UI caía em
--     fallback frágil (full_name → email cru → user.id em alguns paths).
--
-- Esta migration:
--   1. Mantém display_name como coluna normal (não-gerada) — preserva overrides.
--   2. Adiciona trigger BEFORE INSERT/UPDATE que computa display_name **apenas
--      se vazio** — caller pode override explicitamente, derivação automática
--      cobre quando vazio.
--   3. Atualiza handle_new_user pra capturar name/given_name do Google OAuth.
--   4. Backfill: popula display_name onde vazio + corrige full_name legado.
--
-- Padrão "responsabilidade do banco" — mesmo do trigger de calendar_occurrences
-- (00074): UI consulta display_name diretamente, sem lógica de fallback em JS.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.profiles_compute_display_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o caller setou display_name explicitamente (não-vazio), respeita o override.
  -- Senão, deriva: full_name → prefixo do email com Title Case → string vazia.
  IF NEW.display_name IS NULL OR TRIM(NEW.display_name) = '' THEN
    NEW.display_name := COALESCE(
      NULLIF(TRIM(NEW.full_name), ''),
      NULLIF(
        INITCAP(REPLACE(REPLACE(REPLACE(split_part(NEW.email, '@', 1), '.', ' '), '_', ' '), '-', ' ')),
        ''
      ),
      ''
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_display_name ON public.profiles;
CREATE TRIGGER trg_profiles_display_name
  BEFORE INSERT OR UPDATE OF full_name, email, display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_compute_display_name();

CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles (display_name);

-- Trigger handle_new_user estendido pra capturar name/given_name/family_name do Google OAuth.
-- Supabase normaliza pra full_name na maioria dos casos, mas defesa em profundidade.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_code TEXT;
  v_full_name TEXT;
BEGIN
  v_ref_code := NULLIF(NEW.raw_user_meta_data->>'referred_by', '');

  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(
      TRIM(
        COALESCE(NEW.raw_user_meta_data->>'given_name', '') || ' ' ||
        COALESCE(NEW.raw_user_meta_data->>'family_name', '')
      ),
      ''
    ),
    ''
  );

  INSERT INTO public.profiles (id, full_name, email, referred_by)
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    CASE
      WHEN v_ref_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles WHERE referral_code = v_ref_code
      )
      THEN v_ref_code
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill 1: corrigir full_name de profiles legados que ficaram vazios (Google OAuth pré-fix).
UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  NULLIF(u.raw_user_meta_data->>'name', ''),
  NULLIF(
    TRIM(
      COALESCE(u.raw_user_meta_data->>'given_name', '') || ' ' ||
      COALESCE(u.raw_user_meta_data->>'family_name', '')
    ),
    ''
  ),
  p.full_name
)
FROM auth.users u
WHERE u.id = p.id
  AND (p.full_name IS NULL OR p.full_name = '');

-- Backfill 2: popular display_name onde estiver vazio.
-- O trigger profiles_compute_display_name roda automaticamente neste UPDATE
-- (UPDATE OF display_name é matcher do trigger), então setamos NULL pra
-- forçar a derivação. Caller seta NULL → trigger computa a fórmula. Overrides
-- como "Barata" não são tocados (filtro WHERE só pega display_name vazio).
UPDATE public.profiles
SET display_name = NULL
WHERE display_name IS NULL OR TRIM(display_name) = '';

COMMENT ON COLUMN public.profiles.display_name IS
  'Nome amigável a exibir. Coluna gerenciada por trigger profiles_compute_display_name: caller pode setar explicitamente (override do usuário, ex: "Barata"); se vazio/NULL, trigger deriva de full_name → prefixo do email com Title Case → vazio. NUNCA expõe user.id ou email cru. Usuários podem customizar via /perfil.';
