# Checklist de branding Kindar — tarefas externas

Tarefas que **não envolvem código** e precisam ser executadas no painel de cada serviço. Sem isso, o usuário ainda verá "2Lares" no login (tela de consentimento do Google) e em e-mails. Use este documento como roteiro de execução manual.

Data deste roteiro: 2026-05-14
Domínio oficial: `https://www.kindar.com.br`

---

## A1 — Google Cloud Console (mais urgente — causa primária do "2Lares" no login)

**Onde**: [console.cloud.google.com](https://console.cloud.google.com) → projeto **`lares-490817`**

1. APIs & Services → **OAuth consent screen** → Edit App.
2. Trocar campos:
   - **App name**: `2Lares` → **`Kindar`**
   - **App logo**: subir `DEV/public/kindar-logo.png` (512×512 ou maior)
   - **Application home page**: `https://www.kindar.com.br`
   - **Application privacy policy link**: `https://www.kindar.com.br/privacidade`
   - **Application terms of service link**: `https://www.kindar.com.br/termos`
3. **Authorized domains** → garantir que `kindar.com.br` está listado.
4. **Save and Continue** em todas as etapas até concluir.
5. **Se o app estiver em "Testing"**, mover pra "Production" só depois de tudo configurado (Publish App). Se já está em Production, salvar não exige nova revisão da Google.

**Verificação**: aba anônima → `https://www.kindar.com.br/login` → "Entrar com Google" → confirmar que o Google diz **"Para continuar, faça login no Kindar"**, não "2Lares".

---

## A2 — Supabase

**Project ID**: `jquaysfeeuwvoydsgssi`
**Painel**: [supabase.com/dashboard/project/jquaysfeeuwvoydsgssi](https://supabase.com/dashboard/project/jquaysfeeuwvoydsgssi)

### A2.1 — Project name
- **Settings → General** → renomear projeto para **"Kindar"** se ainda for "2Lares".

### A2.2 — URL Configuration
- **Authentication → URL Configuration**:
  - **Site URL**: `https://www.kindar.com.br`
  - **Redirect URLs** → adicionar **AMBOS** (com e sem www, evita 404 silencioso):
    - `https://www.kindar.com.br/auth/callback`
    - `https://kindar.com.br/auth/callback`
    - (manter localhost só pra dev local)

### A2.3 — Email Templates
- **Authentication → Email Templates** → revisar cada um dos 4 templates:
  - Confirm signup
  - Invite user
  - Magic Link
  - Reset Password
- **Substituir qualquer "2Lares" / "Lares"** no subject e body por **"Kindar"**.
- Confirmar que links usam `{{ .SiteURL }}` (puxa de A2.2 automaticamente).

### A2.4 — Custom SMTP (Resend)
- **Authentication → SMTP Settings**:
  - **Sender email**: `noreply@kindar.com.br` (verificar que não é `noreply@2lares.com.br`).
  - **Sender name**: **"Kindar"** (aparece como remetente no inbox do usuário).
  - Resto da config (host/port/usuário/senha do Resend) **não mexer** — SPF/DMARC já está configurado conforme [memória email-deliverability](../memory/project_kindar_email_deliverability.md).

**Verificação**: criar conta de teste nova → conferir e-mail no Outlook/Gmail → remetente "**Kindar <noreply@kindar.com.br>**" + corpo sem "Lares".

---

## A3 — Vercel

**Painel**: [vercel.com](https://vercel.com)

### A3.1 — Project name (opcional, só consistência)
- **Settings → General** → renomear o projeto pra `kindar-app` (ou similar) se ainda for `2lares-xxx`. Isso afeta o slug do dashboard e os URLs de preview (`<slug>-<branch>.vercel.app`), não a URL pública.

### A3.2 — Domains
- **Settings → Domains**:
  - `www.kindar.com.br` → **Primary** (Production).
  - `kindar.com.br` → **Redirect to** `www.kindar.com.br` (308).
  - Qualquer alias antigo tipo `2lares-*.vercel.app` → remover ou marcar como Preview-only / não público.

### A3.3 — Environment Variables
- **Settings → Environment Variables**:
  - `NEXT_PUBLIC_APP_URL=https://www.kindar.com.br` (Production)
  - Auditar Preview/Development também — qualquer var apontando pra `2lares-*` deve virar `kindar-*` ou ser removida.

**Verificação**: durante o fluxo de login no browser, a URL deve permanecer `www.kindar.com.br` (não passar por `2lares-*.vercel.app`).

---

## B — Aplicar migration 00081 (banco de dados)

**Arquivo**: [DEV/supabase/migrations/00081_profiles_display_name.sql](../supabase/migrations/00081_profiles_display_name.sql)

Opções de aplicação:
1. **Supabase Studio (mais simples)**: copiar todo o conteúdo do arquivo → SQL Editor → Run.
2. **Supabase CLI**: `supabase migration up` (se config local).
3. **Via Claude com aprovação explícita**: dar permissão pra Claude rodar `apply_migration` neste projeto.

**Verificação pós-migration**:
```sql
SELECT id, full_name, email, display_name
FROM public.profiles
WHERE display_name = '' OR display_name IS NULL
LIMIT 10;
```
Esperado: zero linhas (ou só contas patológicas com email e nome ambos vazios).

```sql
SELECT pg_get_functiondef('public.handle_new_user'::regproc);
```
Esperado: ver as 4 chaves de metadata (`full_name`, `name`, `given_name+family_name`) no COALESCE.

---

## Status atual após esta sessão (código)

✅ Migration salva em [DEV/supabase/migrations/00081_profiles_display_name.sql](../supabase/migrations/00081_profiles_display_name.sql)
✅ [DEV/src/lib/constants.ts](../src/lib/constants.ts): `getDisplayName` defensivo (typo "Usuario" → "Usuário", lógica explicitada)
✅ [DEV/src/app/(app)/layout.tsx](../src/app/(app)/layout.tsx): usa `display_name || full_name` via `getDisplayName`, **remove fallback pra email cru**
✅ [DEV/src/app/(app)/dashboard/page.tsx](../src/app/(app)/dashboard/page.tsx): mesma mudança no greeting
✅ [DEV/src/app/auth/callback/route.ts](../src/app/auth/callback/route.ts): welcome email usa metadata em camadas (`full_name` → `name` → `given_name+family_name` → INITCAP do email)
✅ [DEV/src/lib/cached-queries.ts](../src/lib/cached-queries.ts): `getCachedMembers` inclui `display_name` no select
✅ [DEV/src/app/(app)/chat/ChatRoom.tsx](../src/app/(app)/chat/ChatRoom.tsx): comparação atualizada pra "Usuário"
✅ [DEV/src/lib/ai/context.ts](../src/lib/ai/context.ts): AI prompt usa `display_name || full_name`
✅ [DEV/package.json](../package.json): `name` "copais-temp" → "kindar"
✅ [DEV/tests/unit/display-name.test.ts](../tests/unit/display-name.test.ts): 12 testes de regressão

**Validação**: 940/940 testes vitest verdes; tsc zero erros em `src/` (erros restantes são pre-existing em `kindar-native/`, não relacionados).

❌ Pendente: aplicar migration 00081 + executar A1/A2/A3 acima.
