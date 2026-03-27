# Seguranca - Kindar

> Modelo de seguranca da plataforma. Dados de criancas exigem o mais alto nivel de protecao.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Autenticacao

### Provedor: Supabase Auth

| Metodo               | Status         | Detalhes                                    |
|----------------------|----------------|---------------------------------------------|
| Email + Senha        | Implementado   | Minimo 6 caracteres, confirmacao por email   |
| Google OAuth         | Implementado   | Via Supabase OAuth provider                  |
| Magic Link           | Disponivel     | Suportado pelo Supabase, nao ativo           |
| MFA/2FA              | Nao implementado | Recomendado para Fase 2                    |

### Fluxo de Autenticacao

```
1. Usuario faz login (email/senha ou Google)
2. Supabase emite JWT (access token + refresh token)
3. Tokens armazenados em cookies HttpOnly (via @supabase/ssr)
4. middleware.ts executa a cada request:
   - updateSession() refresh do token se necessario
5. Cada Server Component chama:
   - const { data: { user } } = await supabase.auth.getUser()
   - Se null: redirect("/login")
```

### Middleware de Sessao

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Matcher: todas as rotas exceto estaticos e assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icon-.*\\.png|...).*)",
  ],
};
```

### Cookies de Autenticacao
| Cookie               | Flags                              | Expiracao        |
|----------------------|------------------------------------|------------------|
| `sb-access-token`    | HttpOnly, Secure, SameSite=Lax     | 1 hora            |
| `sb-refresh-token`   | HttpOnly, Secure, SameSite=Lax     | 60 dias           |

---

## 2. Autorizacao

### 2.1 Row Level Security (RLS)

**RLS esta habilitado em TODAS as tabelas do banco.**

```sql
-- Habilitado em cada tabela
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
-- (e todas as demais tabelas)
```

### 2.2 Helper Functions

```sql
-- Verifica se usuario e membro do grupo
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verifica se usuario e admin do grupo
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 2.3 Politicas por Tabela

| Tabela              | SELECT                        | INSERT                    | UPDATE             | DELETE             |
|---------------------|-------------------------------|---------------------------|--------------------|--------------------|
| profiles            | Co-membros do grupo           | Auth trigger              | Proprio perfil      | -                  |
| coparenting_groups  | Membros do grupo              | Qualquer autenticado      | -                  | -                  |
| group_members       | Membros do grupo              | Admin do grupo            | Admin do grupo      | Admin do grupo     |
| children            | Membros do grupo              | Membros do grupo          | Membros do grupo    | Admin do grupo     |
| custody_events      | Membros do grupo              | Membros do grupo          | Membros do grupo    | Criador do evento  |
| expenses            | Membros do grupo              | Membros do grupo          | Membros do grupo    | Criador da despesa |
| chat_messages       | Membros do grupo              | Membros do grupo          | Proprio remetente   | -                  |
| swap_requests       | Membros do grupo              | Membros do grupo          | Target user         | Solicitante        |
| notifications       | Proprio usuario               | Sistema (service role)    | Proprio usuario     | -                  |
| private_notes       | Proprio usuario               | Proprio usuario           | Proprio usuario     | Proprio usuario    |

### 2.4 Validacao Server-Side em Server Actions

Toda Server Action segue este padrao:

```typescript
export async function createSomething(formData: FormData) {
  // 1. AUTENTICACAO
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. AUTORIZACAO
  const groupId = formData.get("groupId") as string;
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // 3. VALIDACAO DE INPUTS
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    redirect("/pagina?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  // 4. OPERACAO NO BANCO
  const { error } = await supabase.from("tabela").insert({...});

  // 5. NOTIFICACAO (opcional)
  // 6. REVALIDACAO
  revalidatePath("/pagina");
}
```

---

## 3. Validacao de Inputs

### Server-Side (Obrigatoria)

| Tipo de Input     | Validacao                                              |
|-------------------|--------------------------------------------------------|
| Texto             | `.trim()`, verifica vazio, tamanho maximo              |
| Numerico          | `parseFloat()`, verifica NaN, valor minimo/maximo      |
| Data              | Formato YYYY-MM-DD, verifica validade                  |
| Email             | Formato basico, lower case                             |
| UUID              | Formato UUID v4                                         |
| Arquivo           | MIME type whitelist, tamanho maximo                      |
| Enum              | Verifica se valor esta na lista permitida               |

### File Upload

```typescript
// Validacao dupla: client + server
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB
const allowedTypes = [
  "image/jpeg", "image/png", "image/heic",
  "image/heif", "application/pdf"
];

if (file.size > MAX_RECEIPT_SIZE) {
  // Rejeita: "Comprovante muito grande. Maximo 5MB."
}
if (!allowedTypes.includes(file.type)) {
  // Rejeita: "Tipo de arquivo nao permitido."
}
```

---

## 4. OWASP Top 10 - Mitigacoes

| #  | Vulnerabilidade                    | Mitigacao no Kindar                              | Status      |
|----|------------------------------------|-------------------------------------------------|-------------|
| 1  | Broken Access Control              | RLS em todas as tabelas + verifyGroupMembership() | Implementado |
| 2  | Cryptographic Failures             | Supabase: encryption at rest, TLS em transito    | Implementado |
| 3  | Injection (SQL, XSS)              | Parametrized queries (Supabase SDK), React escapes | Implementado |
| 4  | Insecure Design                    | Separacao server/client, principio de menor privilegio | Implementado |
| 5  | Security Misconfiguration          | Environment variables, sem secrets no client      | Implementado |
| 6  | Vulnerable Components              | Dependabot alerts, atualizacoes regulares         | Parcial     |
| 7  | Auth Failures                      | Supabase Auth, HttpOnly cookies, session refresh  | Implementado |
| 8  | Data Integrity Failures            | Server-side validation em todas as Server Actions  | Implementado |
| 9  | Logging & Monitoring Failures      | Sentry para errors, PostHog para events           | Parcial     |
| 10 | SSRF                               | Sem fetch de URLs externas no servidor             | Implementado |

---

## 5. LGPD (Lei Geral de Protecao de Dados)

### Conformidade Atual

| Requisito LGPD                  | Implementacao                                     | Status      |
|---------------------------------|--------------------------------------------------|-------------|
| Consentimento                   | `lgpd_consent_at` no perfil do usuario            | Implementado |
| Direito de acesso               | Exportacao de dados via /saude/export             | Parcial     |
| Direito de exclusao             | Cascade delete via FK (ON DELETE CASCADE)          | Implementado |
| Minimizacao de dados            | Apenas dados necessarios coletados                | Implementado |
| Seguranca                       | Encryption at rest (Supabase), TLS                | Implementado |
| Notificacao de violacao         | Sentry alerta para erros criticos                 | Parcial     |
| DPO (Data Protection Officer)   | Nao designado                                     | Pendente    |

### Dados Sensíveis Armazenados

| Dado                    | Tabela               | Classificacao | Protecao                    |
|-------------------------|----------------------|---------------|-----------------------------|
| Nome da crianca          | children             | Pessoal       | RLS + grupo                 |
| Data de nascimento       | children             | Pessoal       | RLS + grupo                 |
| Historico de saude       | illness_episodes     | Sensivel      | RLS + grupo                 |
| Alergias                 | child_allergies      | Sensivel      | RLS + grupo                 |
| Medicamentos             | active_medications   | Sensivel      | RLS + grupo                 |
| Vacinas                  | vaccinations         | Sensivel      | RLS + grupo                 |
| Mensagens de chat        | chat_messages        | Pessoal       | RLS + grupo                 |
| Comprovantes financeiros | Supabase Storage     | Pessoal       | Bucket privado + grupo      |
| Notas privadas           | private_notes        | Sensivel      | RLS + apenas o autor        |

### Politica de Retencao de Dados
- Dados ativos: retidos enquanto conta ativa
- Conta deletada: CASCADE delete em todas as tabelas relacionadas
- Backup: gerenciado pelo Supabase (retencao de 7 dias no Pro)
- Logs de acesso: PostHog (retencao configuravel)

---

## 6. Protecao Contra Ataques

### 6.1 CSRF (Cross-Site Request Forgery)

```
Protecao: Next.js Server Actions tem protecao CSRF built-in.
- Token CSRF automatico em formularios
- Origin header verificado pelo Next.js
- SameSite=Lax nos cookies
```

### 6.2 XSS (Cross-Site Scripting)

```
Protecao:
- React escapa todos os valores por padrao
- Nenhum uso de dangerouslySetInnerHTML em todo o codebase
- CSP headers recomendados (nao implementado ainda)
- Sanitizacao de inputs no servidor
```

### 6.3 SQL Injection

```
Protecao:
- Supabase SDK usa parametrized queries internamente
- Nenhuma query SQL raw no codebase (exceto migrations)
- RLS policies usam auth.uid() (funcao segura do Supabase)
```

### 6.4 Rate Limiting

```
Status: NAO IMPLEMENTADO (Recomendado para Fase 2)

Recomendacao:
- Vercel Edge Middleware com rate limiter (ex: @upstash/ratelimit)
- Limites por endpoint:
  - /api/chat: 60 req/min por usuario
  - /api/cron: 1 req/min (ja protegido por CRON_SECRET)
  - Server Actions: 30 req/min por usuario
  - Login: 5 tentativas/min por IP
```

### 6.5 Protecao de Cron Jobs

```typescript
// Cron jobs protegidos por secret header
const cronSecret = request.headers.get("authorization");
if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

---

## 7. Gestao de Secrets

### Environment Variables

| Variavel                          | Onde Usada           | Exposta ao Client? |
|-----------------------------------|----------------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Client + Server      | SIM (publica)       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Client + Server      | SIM (publica, RLS protege) |
| `SUPABASE_SERVICE_ROLE_KEY`       | Server apenas        | NAO                 |
| `NEXT_PUBLIC_POSTHOG_KEY`         | Client               | SIM (publica)       |
| `CRON_SECRET`                     | Server (cron jobs)   | NAO                 |
| `VAPID_PUBLIC_KEY`                | Client + Server      | SIM (publica)       |
| `VAPID_PRIVATE_KEY`               | Server apenas        | NAO                 |
| `SENTRY_DSN`                      | Server + Client      | SIM (publica)       |

### Regras de Secrets
- Nunca commitar `.env` no repositorio (no .gitignore)
- Secrets sensiveis apenas via Vercel Environment Variables
- `NEXT_PUBLIC_` prefix: apenas para variaveis seguras de expor
- `SUPABASE_SERVICE_ROLE_KEY`: NUNCA importar em codigo client

### Service Role Key

O `SUPABASE_SERVICE_ROLE_KEY` bypassa RLS. Usado apenas em:
- Upload de arquivos (Storage precisa de service role para buckets privados)
- Cron jobs (executam sem contexto de usuario)
- NUNCA em Server Components ou Client Components

---

## 8. Seguranca do Chat

### Moderacao de Tom

```typescript
// lib/tone-moderator.ts
export function analyzeTone(text: string): ToneAnalysis {
  // Analise client-side de padroes agressivos
  // - Palavroes
  // - CAPS LOCK excessivo
  // - Multiplas exclamacoes
  // - Padroes acusatorios
  return {
    isAggressive: boolean,
    score: number,
    suggestion: string | null,
    detectedPatterns: string[]
  };
}
```

**Importante:** A moderacao e uma SUGESTAO, nunca um bloqueio. O usuario decide enviar ou reescrever.

### Read Receipts
- `read_by`: JSON object `{ userId: timestamp }` em cada mensagem
- Transparencia: ambos sabem quando o outro leu

---

## 9. Checklist de Seguranca para Novas Features

Antes de fazer merge de qualquer feature:

- [ ] `getUser()` chamado no inicio de todo Server Component
- [ ] `verifyGroupMembership()` em toda Server Action que acessa dados de grupo
- [ ] Inputs validados server-side (trim, parse, type check)
- [ ] Nenhum secret no codigo client (verificar imports)
- [ ] File uploads validados (MIME type + tamanho)
- [ ] RLS policy criada para novas tabelas
- [ ] Sem `dangerouslySetInnerHTML`
- [ ] Dados sensíveis protegidos por RLS individual (ex: private_notes)
- [ ] Redirect com `encodeURIComponent()` para mensagens de erro

---

## 10. Vulnerabilidades Conhecidas e Plano de Acao

| Vulnerabilidade              | Severidade | Status         | Plano                              |
|------------------------------|------------|----------------|------------------------------------|
| Sem rate limiting            | Media      | Nao implementado | Implementar com @upstash/ratelimit |
| Sem CSP headers              | Baixa      | Nao implementado | Adicionar via next.config.js        |
| Sem MFA/2FA                  | Media      | Nao implementado | Habilitar via Supabase Auth MFA     |
| Sem audit log                | Baixa      | Nao implementado | Tabela de audit_logs para acoes criticas |
| Sem HSTS explicito           | Baixa      | Vercel default   | Ja incluso no Vercel               |
| Sem Subresource Integrity    | Baixa      | Nao implementado | Adicionar para CDN assets           |
| Password policy fraca        | Media      | Supabase default | Configurar minimo 8 chars + complexidade |

---

*Este documento deve ser revisado apos cada auditoria de seguranca ou incidente.*
