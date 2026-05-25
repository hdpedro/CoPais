# Relatório de Segurança — Kindar

**Versão:** 1.0
**Data:** 20 de maio de 2026
**Autor:** Analista de Segurança (revisão técnica)
**Alvo:** `kindar.com.br` (PWA Next.js 15 + Supabase + Vercel)
**Escopo:** Auditoria externa de active recon autenticado, complementada com revisão white-box do código-fonte
**Metodologia:** OWASP Top 10 (2021) · OWASP ASVS L2 · OWASP API Security Top 10 · OWASP Secure Headers · LGPD (Lei 13.709/2018)

---

## 1. Sumário Executivo

### 1.1 Postura atual

O Kindar apresenta uma **arquitetura de aplicação defensivamente sólida** — a maioria dos fluxos sensíveis trafega por Server Actions com sessão server-side, Row Level Security (RLS) está habilitada no Supabase, HTTPS é forçado, HSTS está configurado e rotas administrativas comuns (`.env`, `.git/*`, `/admin`) estão bloqueadas no middleware.

A postura **enfraquece significativamente em três camadas**:

1. **Gestão de sessão híbrida** — tokens trafegam simultaneamente em `localStorage` (texto plano) e cookies sem `HttpOnly`, expondo material de autenticação a qualquer JavaScript executando na página. **Decisão arquitetural deliberada** para mitigar Safari ITP em PWA iOS, mas sem compensações defensivas suficientes (CSP, sanitização rigorosa, MFA, rotação curta).
2. **Headers de segurança praticamente ausentes** — sem CSP, sem X-Frame-Options, sem Referrer-Policy, sem Permissions-Policy. A consequência é que qualquer ponto de XSS futuro vira instantaneamente um *full account takeover*.
3. **Conformidade LGPD parcialmente endereçada** — session recording potencialmente ativo sobre rotas que tratam dados de crianças, com transferência internacional para EUA via PostHog. Categoria de dado mais protegida pela LGPD (art. 14).

### 1.2 Risco residual consolidado

| Categoria | Quantidade | Nota |
|---|---|---|
| Crítico | 2 | Gestão de sessão (#1, #2) — risco condicional à existência de XSS |
| Alto | 4 | Headers, RLS (verificação), UUIDs, LGPD |
| Médio | 5 | Open redirect, erros em URL, source maps, polling, X-Powered-By |
| Baixo | 2 | HSTS preload, 503 esporádicos |
| Informativo | 2 | Inventário REST, analytics proxy |

### 1.3 Recomendação executiva

**Adotar abordagem em três ondas:**

- **Onda 1 (Sprint atual, 1-3 dias):** quick wins de zero/baixo risco — CSP em modo `Report-Only`, headers passivos, desligar `X-Powered-By`, sanitização de `?next=`, mascaramento PostHog em rotas sensíveis, validação de configuração Supabase.
- **Onda 2 (1-2 semanas):** auditoria white-box de RLS em todas as tabelas, refatoração de mensagens de erro, promoção de CSP para enforce com nonces, conformidade LGPD documental.
- **Onda 3 (1+ mês):** decisão estratégica sobre trade-off Safari ITP vs cookies HttpOnly, migração de UUIDs para slugs, avaliação de PostHog self-hosted, implementação de MFA opt-in.

### 1.4 Por que isso importa para o Kindar especificamente

Kindar trata **dados de crianças** — categoria mais sensível da LGPD (art. 14), além de saúde (art. 11) e dados financeiros (art. 7). Um incidente de segurança nesse contexto não é apenas uma falha técnica: é exposição regulatória direta (ANPD), risco reputacional severo para um produto que vende confiança entre coparentes, e potencial multa de até 2% do faturamento por infração (art. 52, II).

---

## 2. Framework de Priorização

Cada achado foi pontuado com **CVSS 3.1 contextual** (ajustando *Exploitability* e *Impact* para a realidade do Kindar) e classificado em três eixos:

| Eixo | Pergunta |
|---|---|
| **Probabilidade** | Quão fácil é explorar hoje? Requer XSS pré-existente? Acesso autenticado? Conhecimento interno? |
| **Impacto técnico** | Confidencialidade, integridade, disponibilidade — afeta um usuário ou todos? |
| **Impacto de negócio** | Multa regulatória? Churn? Reputacional? Bloqueio em revisão de loja? |

**Prioridade final = max(CVSS contextual, impacto de negócio).** Um achado técnico médio pode virar prioridade alta se carrega risco LGPD com dados de criança.

---

## 3. Painel Consolidado de Achados

| # | Sev | Achado | OWASP / Norma | Confirmado | Esforço |
|---|---|---|---|---|---|
| 1 | CRÍTICO | Tokens em `localStorage` | A07 | Sim — código | M |
| 2 | CRÍTICO | Cookies de auth sem `HttpOnly` | A07 | Sim — código | M |
| 3 | ALTO→MÉDIO | `user_id` controlado pelo cliente | A01 | Parcial — RLS validada em `notifications` | S |
| 4 | ALTO | Ausência de headers de segurança | A05 | Sim — código | S |
| 5 | MÉDIO | Open redirect em `?next=` | A01/A05 | Sim — `session-recovery/page.tsx` | XS |
| 6 | MÉDIO | Erros refletidos em querystring | A04 | Sim — 15 call sites | M |
| 7 | MÉDIO | Source maps `.map` expostos | A05 | Sim — `next.config.ts` | XS |
| 8 | MÉDIO | Polling agressivo + 503 | A05 | Parcial — já usa Realtime | M |
| 9 | ALTO | LGPD: session recording + crianças | LGPD art. 14, 33 | Sim — `posthog.ts` sem masking | S |
| 10 | ALTO | UUIDs em paths/querystrings | A01/A04 | Sim — arquitetura | L |
| 11 | MÉDIO | `X-Powered-By: Next.js` | A05 | Sim — `next.config.ts` | XS |
| 12 | BAIXO | HSTS sem `includeSubDomains`/`preload` | A02 | Sim — headers | S |
| 13 | BAIXO | 503 esporádicos em `_rsc` | A05 | Observacional | — |
| 14 | INFO | Inventário de endpoints REST | — | — | — |
| 15 | INFO | Analytics em path randomizado | LGPD | — | XS |

**Legenda esforço:** XS (minutos) · S (horas) · M (1-3 dias) · L (1+ semana)

---

## 4. Detalhe Técnico dos Achados

### 4.1 [CRÍTICO] #1 — Tokens de autenticação em localStorage

**OWASP A07: Identification and Authentication Failures**
**CWE-312: Cleartext Storage of Sensitive Information**

#### Descrição

`access_token` e `refresh_token` do Supabase Auth são persistidos em texto plano no `localStorage` sob duas chaves distintas:

- `kindar-auth-persist` (3269 bytes) — sessão completa
- `kindar-auth-backup` (1464 bytes) — duplicata para recuperação

Qualquer JavaScript executando no mesmo origin tem acesso de leitura — incluindo XSS, extensões de browser maliciosas, scripts de terceiros injetados via PostHog/analytics, ou bibliotecas npm comprometidas (cadeia de suprimentos).

#### Evidência

- [src/lib/supabase/persistence.ts:28](DEV/src/lib/supabase/persistence.ts:28) — `storageKey: "kindar-auth-persist"` com `persistSession: true`
- [src/lib/supabase/client.ts:24-36](DEV/src/lib/supabase/client.ts:24) — mirror manual em `onAuthStateChange` para `kindar-auth-backup`

#### Contexto arquitetural

Esta é uma **decisão deliberada** para mitigar Safari ITP (Intelligent Tracking Prevention), que limpa cookies de sessão sem `maxAge` quando o PWA é fechado no iOS. Sem o backup em `localStorage`, usuários iOS PWA seriam deslogados a cada ciclo de fechamento do app. O fluxo `/session-recovery` ([src/app/(auth)/session-recovery/page.tsx](DEV/src/app/(auth)/session-recovery/page.tsx)) lê o backup e re-injeta cookies via `setSession()`.

#### Impacto

- **Confidencialidade:** ALTA — exfiltração completa da sessão (acesso a dados de crianças, saúde, finanças, chat)
- **Integridade:** ALTA — atacante pode criar/editar/deletar via Server Actions cobrindo-se como vítima
- **Persistência:** ALTA — `refresh_token` permite manter sessão indefinidamente até revogação manual

#### Recomendação

Estratégia em três níveis (não substituir cego):

**Curto prazo — defesa em profundidade contra o vetor de exfiltração:**

1. CSP estrita que bloqueia exfil para origens não-permitidas (vide #4)
2. Rotação obrigatória de `refresh_token` no Supabase (a cada uso → invalida o anterior)
3. JWT expiry reduzido de 3600s para 900s
4. Auditoria rigorosa de todos os pontos de input do usuário que possam virar XSS sinks

**Médio prazo — reduzir superfície do `localStorage`:**

5. Eliminar `kindar-auth-backup` (duplicata) — manter apenas o canal SSR
6. Investigar se algum browser moderno (>2024) tem API mais restritiva que `localStorage` para o caso de uso ITP — `Storage Access API`, IndexedDB com encryption, ou Session Storage

**Longo prazo — decisão estratégica:**

7. Avaliar custo/benefício de migrar 100% para cookies `HttpOnly + Secure + SameSite=Lax` com refresh token rotation curta, aceitando que iOS PWA precisará re-login periódico. Decisão de produto.

#### Critério de aceitação

- Refresh Token Rotation ativada no painel Supabase (`Auth > Settings > JWT Settings`)
- Reuse Interval = 0
- JWT expiry = 900s
- CSP enforce com `connect-src` restrito ao Supabase + PostHog
- Telemetria de tentativas de uso de refresh_token revogado (Supabase logs)

---

### 4.2 [CRÍTICO] #2 — Cookies de auth sem HttpOnly

**OWASP A07**

#### Descrição

Os cookies `sb-jquaysfeeuwvoydsgssi-auth-token.0` e `.1` (chunks do JWT, Supabase divide quando excede ~4KB) estão acessíveis via `document.cookie` — `HttpOnly` desativado deliberadamente.

#### Evidência

[src/lib/supabase/middleware.ts:104-115](DEV/src/lib/supabase/middleware.ts:104):

```typescript
cookiesToSet.forEach(({ name, value, options }) =>
  supabaseResponse.cookies.set(name, value, {
    ...options,
    maxAge: 60 * 60 * 24 * 30,
    expires: thirtyDaysFromNow,
    httpOnly: false,           // <-- explícito
    sameSite: options?.sameSite ?? "lax",
    secure: true,
  })
);
```

#### Contexto arquitetural

`HttpOnly: false` é necessário para que o cliente Supabase no browser consiga executar `supabase.auth.getSession()` em Client Components e para que o fluxo `/session-recovery` consiga ler/escrever cookies via JS quando o Safari ITP os apaga.

#### Impacto

Mesmo do #1 por outra superfície. Mesmo se `localStorage` for limpo, o cookie é exfiltrável.

#### Recomendação

Esta correção **não pode ser aplicada isoladamente**. Requer:

1. Migrar todas as chamadas `supabase.auth.getSession()` em Client Components para receberem session via prop do Server Component pai (`@supabase/ssr` server client).
2. Refatorar `/session-recovery` para usar endpoint server-side autenticado por algum mecanismo intermediário (ex: token de recuperação assinado, válido por 60s).
3. Aceitar o trade-off de UX iOS PWA — testes A/B antes da decisão.

#### Critério de aceitação

- `document.cookie.includes('sb-')` retorna `false` no console em qualquer rota autenticada
- Fluxo iOS PWA permanece funcional após reabrir o app (teste manual obrigatório)
- Suite de testes E2E (Playwright) cobre login + reload + reabrir cenário

---

### 4.3 [ALTO → MÉDIO] #3 — user_id controlado pelo cliente em chamadas Supabase

**OWASP A01: Broken Access Control**

#### Descrição

O cliente realiza chamadas REST ao Supabase passando `user_id` na querystring. Defesa contra IDOR depende exclusivamente de RLS estar bem configurada em todas as tabelas.

#### Evidência

- [src/components/NotificationBadge.tsx:14-20](DEV/src/components/NotificationBadge.tsx:14) — SELECT com `.eq("user_id", userId)`
- Subscriptions Realtime com `filter: user_id=eq.${userId}` (linhas 42, 55)

#### Reclassificação

Verifiquei RLS de `notifications` em [supabase/migrations/00002_rls_policies.sql:143-148](DEV/supabase/migrations/00002_rls_policies.sql:143):

```sql
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());
```

Postgres aplica `auth.uid()` do JWT — ignora o `user_id` passado pelo cliente. **Defesa em profundidade existe para `notifications`.** O achado vira "validar paridade em TODAS as tabelas".

#### Recomendação

Auditoria white-box obrigatória. Executar no SQL Editor do Supabase:

```sql
-- 1. Listar TODAS as policies de tabelas públicas
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 2. Caçar tabelas SEM RLS habilitada (red flag absoluta)
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;

-- 3. Listar tabelas COM RLS mas SEM nenhuma policy (negam tudo silenciosamente)
SELECT t.schemaname, t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p
  ON t.schemaname = p.schemaname AND t.tablename = p.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND p.policyname IS NULL;
```

**Tabelas críticas a validar manualmente:** `children`, `child_activities`, `medical_appointments`, `vaccination_records`, `health_records`, `expenses`, `documents`, `messages`, `agreements`, `decisions`, `school_logs`, `family_members`, `notifications`.

**Para cada uma, validar:**

1. `USING` clause cobre SELECT
2. `WITH CHECK` clause cobre INSERT/UPDATE
3. Policy diferente por operação quando necessário (ex: `member` lê mas só `admin` deleta)
4. Joins de membership não introduzem recursão (`family_members` referenciando `groups` etc.)

#### Critério de aceitação

- Relatório markdown listando cada tabela pública × cada operação × policy aplicável
- Zero tabelas sem RLS habilitada (exceto tabelas de catálogo público como `vaccine_catalog`)
- Suite de testes pgTAP ou equivalente cobrindo cenário multi-tenant (família A não vê dados da família B)

---

### 4.4 [ALTO] #4 — Ausência total de headers de segurança

**OWASP A05: Security Misconfiguration · OWASP Secure Headers Project**

#### Descrição

Nenhum header de segurança defensivo está presente. Esta é a correção de **maior alavancagem** do relatório.

#### Headers ausentes

| Header | Mitiga | Severidade |
|---|---|---|
| `Content-Security-Policy` | XSS, exfiltração de tokens (#1, #2) | CRÍTICO |
| `X-Frame-Options` | Clickjacking | ALTO |
| `X-Content-Type-Options: nosniff` | MIME confusion | MÉDIO |
| `Referrer-Policy` | Vazamento de UUIDs (#10) em logs externos | MÉDIO |
| `Permissions-Policy` | Abuso de camera/mic/geo por XSS | MÉDIO |
| `Cross-Origin-Opener-Policy` | Spectre, popup tampering | BAIXO |

#### Recomendação

Implementar em duas fases no [next.config.ts](DEV/next.config.ts).

**Fase 1 — headers passivos + CSP Report-Only (zero risco operacional):**

```typescript
// next.config.ts
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://jquaysfeeuwvoydsgssi.supabase.co wss://jquaysfeeuwvoydsgssi.supabase.co https://*.sentry.io",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Fase 1: APENAS Report-Only (não bloqueia, só relata violações)
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // ... resto da config
};
```

**Endpoint para receber violações** (`src/app/api/csp-report/route.ts`):

```typescript
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const report = await req.json();
    Sentry.captureMessage("CSP Violation", {
      level: "warning",
      extra: { report },
    });
  } catch {
    // ignorar parse errors — relatórios mal-formados
  }
  return NextResponse.json({ ok: true }, { status: 204 });
}
```

**Fase 2 — promover Report-Only para enforce (após 1-2 semanas de coleta):**

- Substituir `Content-Security-Policy-Report-Only` por `Content-Security-Policy`
- Eliminar `'unsafe-inline'` em `script-src` usando nonces SSR (Next.js 15 suporta nativamente via `headers().get('x-nonce')`)
- Eliminar `'unsafe-eval'` se não houver dependência (verificar build pós-Turbopack)
- Substituir `'unsafe-inline'` em `style-src` por nonces ou refatorar styles inline

#### Critério de aceitação

- Headers visíveis em `curl -I https://kindar.com.br`
- CSP Report-Only coletando zero violações inesperadas por 7 dias
- CSP enforce ativo sem regressão funcional reportada em produção por 14 dias

---

### 4.5 [MÉDIO] #5 — Open Redirect em `?next=`

**OWASP A01 (Broken Access Control)**

#### Descrição

A página `/session-recovery` aceita `?next=<path>` e redireciona via `window.location.href = next` **sem qualquer validação**, permitindo redirecionamento para origem externa via link Kindar legítimo (vetor de phishing).

#### Evidência

[src/app/(auth)/session-recovery/page.tsx:11,19,55,61](DEV/src/app/(auth)/session-recovery/page.tsx:11):

```typescript
const next = searchParams.get("next") || "/dashboard";
// ...
window.location.href = next;       // linha 19 — sem sanitização
window.location.href = next;       // linha 55 — sem sanitização
window.location.href = "/login";   // linha 61 — esse OK
```

#### Exploração teórica

```
https://kindar.com.br/session-recovery?next=https://phishing.attacker.com/fake-login
https://kindar.com.br/session-recovery?next=//phishing.attacker.com
https://kindar.com.br/session-recovery?next=javascript:alert(document.cookie)
```

#### Recomendação

Adicionar função de sanitização que **permite apenas paths same-origin**:

```typescript
// src/lib/auth/sanitize-next.ts
export function sanitizeNext(raw: string | null, fallback = "/dashboard"): string {
  if (!raw) return fallback;

  // Rejeitar javascript:, data:, vbscript:, file:, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;

  // Rejeitar protocol-relative URLs (//evil.com)
  if (raw.startsWith("//") || raw.startsWith("\\\\")) return fallback;

  // Rejeitar URLs absolutas mesmo após codificação
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(decoded)) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  // Aceitar apenas paths começando com / único e que sejam parseáveis
  if (!raw.startsWith("/")) return fallback;

  try {
    const url = new URL(raw, "https://kindar.com.br");
    if (url.origin !== "https://kindar.com.br") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
```

Aplicar em todos os call sites de `?next=`:

- [src/app/(auth)/session-recovery/page.tsx:11](DEV/src/app/(auth)/session-recovery/page.tsx:11)
- [src/lib/supabase/middleware.ts:213](DEV/src/lib/supabase/middleware.ts:213) (validar lado server também)
- Qualquer redirect com `next` em Server Actions e auth callbacks

#### Critério de aceitação

- Teste unitário cobrindo: `null`, `""`, `"/dashboard"`, `"javascript:alert(1)"`, `"//evil.com"`, `"https://evil.com"`, `"\\\\evil.com"`, `"%2F%2Fevil.com"`, `"/dashboard?a=b#c"`
- Auditoria de todos os call sites confirmando uso

---

### 4.6 [MÉDIO] #6 — Mensagens de erro refletidas na URL

**OWASP A04: Insecure Design**

#### Descrição

Mensagens de erro humanas trafegam codificadas em `?error=...` em pelo menos 15 call sites (login, verify-email, auth/callback, ações de criança, vacinação, férias etc.).

#### Riscos

1. **Vazamento para logs externos** — Referer header expõe URL completa para PostHog, fontes, imagens
2. **Potencial XSS refletido** — se algum render usar `dangerouslySetInnerHTML` sobre a query param (não verifiquei todos os 15 sites)
3. **Telemetria poluída** — texto em português + acentos URL-encoded inflam volume de eventos

#### Recomendação

Substituir texto livre por **códigos opacos** com mapeamento i18n:

```typescript
// src/lib/auth/error-codes.ts
export type AuthErrorCode =
  | "ml_expired"
  | "ml_invalid"
  | "sess_timeout"
  | "verify_failed"
  | "oauth_denied"
  | "invitation_not_found"
  | "generic";

export const AUTH_ERROR_KEYS: Record<AuthErrorCode, string> = {
  ml_expired: "auth.error.magicLinkExpired",
  ml_invalid: "auth.error.magicLinkInvalid",
  sess_timeout: "auth.error.sessionTimeout",
  verify_failed: "auth.error.verifyFailed",
  oauth_denied: "auth.error.oauthDenied",
  invitation_not_found: "auth.error.invitationNotFound",
  generic: "auth.error.generic",
};
```

No call site:

```typescript
// antes
redirect(`/login?error=${encodeURIComponent("Link expirado ou já utilizado.")}`);

// depois
redirect("/login?e=ml_expired");
```

No componente cliente:

```typescript
const code = (searchParams.get("e") || "generic") as AuthErrorCode;
const message = t(AUTH_ERROR_KEYS[code] ?? AUTH_ERROR_KEYS.generic);
```

**Atende também a Regra Canônica 5** ("mensagem de erro com termo técnico vazado") e Regra 1 (i18n obrigatória para todo texto visível).

#### Critério de aceitação

- Zero ocorrências de `?error=` com texto livre — apenas `?e=<código>`
- Mapping em 5 locales (pt/en/es/fr/de) conforme Regras Canônicas
- Render sempre via `t(key)` — nunca via `dangerouslySetInnerHTML` da query

---

### 4.7 [MÉDIO] #7 — Source maps expostos em produção

**OWASP A05**

#### Descrição

Arquivos `.map` retornam HTTP 200 em produção, permitindo reconstrução completa do código TypeScript/JSX cliente. Combinado com `$ACTION_ID_*` (IDs de Server Actions), facilita engenharia reversa do backend.

#### Evidência

- [next.config.ts](DEV/next.config.ts) — sem `productionBrowserSourceMaps: false`
- [next.config.ts:51-55](DEV/next.config.ts:51) — Sentry config com `sourcemaps: { disable: false }` (necessário para Sentry, mas sem `hideSourceMaps: true`)

#### Recomendação

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,  // <-- adicionar
  // ...
};

export default withSentryConfig(nextConfig, {
  // ...
  sourcemaps: {
    disable: false,        // continuar gerando para Sentry
    // hideSourceMaps default true — confirmar com docs Sentry 8+
  },
  hideSourceMaps: true,    // <-- explícito, esconde do servidor público
  widenClientFileUpload: false,
  // ...
});
```

#### Validação

```bash
curl -I https://kindar.com.br/_next/static/chunks/<hash>.js.map
# Esperado: HTTP 404
```

#### Critério de aceitação

- `.map` retorna 404 em produção
- Sentry continua recebendo source maps no upload (issues mostram stack traces legíveis)

---

### 4.8 [MÉDIO] #8 — Polling agressivo + 503 intermitentes

**OWASP A05 (Reliability)**

#### Descrição

Auditoria observou múltiplas chamadas REST à `notifications` em cascata + 503 intermitentes.

#### Estado real

Verificação no código: [NotificationBadge.tsx:34-62](DEV/src/components/NotificationBadge.tsx:34) **já usa** Realtime via `postgres_changes` subscription. O polling REST observado é o `fetchCount()` inicial + re-fetches disparados por eventos Realtime. Padrão correto.

#### Risco residual

- 503 intermitentes em `_rsc` e `/auth/v1/user` — possível cold start Vercel ou rate limit Supabase
- Re-fetch sem debounce em janelas de muitas inserções simultâneas (notificação em lote)

#### Recomendação

1. Adicionar debounce no re-fetch:

```typescript
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedFetch = () => {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(fetchCount, 500);
};
```

2. Investigar 503: correlacionar `x-vercel-id` com logs Vercel + tabela `app_errors` para identificar padrão (rota específica? horário? cold start?).

3. Implementar circuit breaker em frontend para evitar amplificação:

```typescript
// Após 3 falhas consecutivas, pausar polling por 30s
```

#### Critério de aceitação

- Taxa de 503 abaixo de 0.1% em janela de 7 dias (medir via Sentry/Vercel Analytics)
- Re-fetches por sessão com p95 < 5/minuto

---

### 4.9 [ALTO] #9 — LGPD: session recording sobre dados de crianças

**LGPD art. 14 (dados de crianças) · art. 33 (transferência internacional)**

#### Descrição

PostHog está inicializado **sem qualquer configuração de privacidade**, e dados de crianças são tratados em rotas explícitas (`/criancas`, `/saude`, `/escola`). Se session recording estiver habilitado no painel PostHog (verificar), DOM screenshots de telas com informações de saúde de menores são enviados para `us.i.posthog.com` (EUA — sem decisão de adequação da ANPD).

#### Evidência

[src/lib/posthog.ts:11-22](DEV/src/lib/posthog.ts:11):

```typescript
posthog.init(key, {
  api_host: host,
  person_profiles: "identified_only",
  capture_pageview: false,
  capture_pageleave: true,
  respect_dnt: true,
  // FALTA: session_recording config — masking, blocking selectors etc.
});
```

#### Exigências LGPD

| Artigo | Exigência | Status atual |
|---|---|---|
| Art. 7º, I | Consentimento específico para dados pessoais | A validar onboarding |
| Art. 11 | Bases legais reforçadas para dados de saúde | A validar |
| Art. 14 §1º | "Melhor interesse" da criança + consentimento de pelo menos um responsável | A validar |
| Art. 18 | Direitos do titular (acesso, retificação, eliminação, portabilidade) | A validar |
| Art. 33 | Transferência internacional requer país adequado OU garantias contratuais | EUA sem adequação — exige garantias |
| Art. 41 | DPO designado e contato publicado | A validar |

#### Recomendação

**Imediata — código:**

```typescript
// src/lib/posthog.ts
posthog.init(key, {
  api_host: host,
  person_profiles: "identified_only",
  capture_pageview: false,
  capture_pageleave: true,
  respect_dnt: true,
  session_recording: {
    maskAllInputs: true,                    // mascarar TODOS os inputs por padrão
    maskTextSelector: "[data-sensitive], [data-child-info], input, textarea",
    blockSelector: "[data-no-record]",      // permitir opt-out por elemento
    recordCrossOriginIframes: false,
    sampleRate: 0.1,                        // gravar 10% das sessões, não 100%
  },
  loaded: (ph) => {
    // Desligar recording em rotas sensíveis no client-side
    if (typeof window !== "undefined") {
      const sensitive = /^\/(saude|criancas|documentos|despesas)/;
      if (sensitive.test(window.location.pathname)) {
        ph.stopSessionRecording();
      }
    }
  },
});
```

Adicionar hook global no app:

```typescript
// src/app/providers.tsx ou root layout client
useEffect(() => {
  const sensitive = /^\/(saude|criancas|documentos|despesas)/;
  if (sensitive.test(pathname)) {
    posthog.stopSessionRecording();
  } else {
    posthog.startSessionRecording();
  }
}, [pathname]);
```

**Imediata — produto/legal:**

1. Política de privacidade declarando explicitamente:
   - Que dados são coletados (lista exaustiva)
   - PostHog + Plausible/Umami como sub-operadores
   - Transferência internacional para EUA
   - Base legal (legítimo interesse para analytics anonimizado; consentimento explícito para dados de criança)
   - Direitos do titular (LGPD art. 18)
   - Contato do DPO

2. Onboarding com **consentimento granular** dos responsáveis para dados de criança (não basta checkbox geral de Termos).

3. Página de exercício de direitos: `/perfil/dados` com botões "exportar meus dados" e "excluir minha conta + dados das crianças".

**Médio prazo — infraestrutura:**

4. Avaliar PostHog Cloud EU (`eu.i.posthog.com`) — resolve transferência internacional do EUA mantendo o produto. Verificar contratualmente cláusulas standard (SCCs).

5. Alternativa mais radical: PostHog self-hosted em região BR (`sa-east-1`) ou EU. Custo operacional alto, mas elimina art. 33.

#### Critério de aceitação

- `posthog.init` com `session_recording.maskAllInputs: true`
- Telemetria confirma zero session recordings em rotas `/saude`, `/criancas`, `/documentos`
- Política de privacidade publicada em `/privacidade` referenciando art. 33
- DPO contato visível em footer + política

---

### 4.10 [ALTO] #10 — UUIDs em paths e querystrings

**OWASP A01 / A04**

#### Descrição

UUIDs internos de crianças e usuários aparecem em paths (`/criancas/<uuid>`) e querystrings (`?user_id=eq.<uuid>`). UUIDs v4 **não são adivinháveis**, mas **vazam**:

- Logs (Vercel, CDN, browser, Sentry, PostHog)
- Referer (sem `Referrer-Policy`, vide #4)
- Session recording PostHog (vide #9)
- Compartilhamento informal de links
- Histórico de browser sincronizado (Chrome, Safari)

#### Impacto

UUID vazado não é exploit imediato (RLS protege), mas reduz a "barreira de anonimato" — atacante com UUID + alguma outra falha (XSS, leak de RLS) consegue alvejar usuário específico em vez de fishing geral.

#### Recomendação em três níveis

**Imediata (já no #4):** `Referrer-Policy: strict-origin-when-cross-origin` — UUIDs param de vazar para origens externas.

**Curto prazo:** mascarar UUIDs nos logs PostHog/Sentry:

```typescript
// src/lib/posthog.ts
posthog.init(key, {
  // ...
  sanitize_properties: (props) => {
    if (props.$current_url) {
      props.$current_url = props.$current_url.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "<uuid>"
      );
    }
    return props;
  },
});
```

**Longo prazo:** migrar paths para slugs amigáveis:

```
/criancas/heitor-abc12        (slug = nome-normalizado + 5 chars hash)
/criancas/heitor-abc12/saude  (sub-rotas mantêm slug pai)
```

Implementação requer:

- Coluna `slug` em `children` (unique por group_id)
- Migration backfill de slugs para crianças existentes
- Redirects 301 de UUIDs antigos para slugs novos (preservar bookmarks)
- Mesmo padrão para `expenses`, `decisions`, `documents`, `vaccination_records`

#### Critério de aceitação

- Curto: `Referrer-Policy` ativo (parte do #4)
- Médio: UUIDs ausentes em URLs reportadas no PostHog
- Longo: 100% dos paths user-facing usando slugs

---

### 4.11 [MÉDIO] #11 — X-Powered-By: Next.js

**OWASP A05 (Security Misconfiguration)**

#### Descrição

Header `X-Powered-By: Next.js` em todas as respostas. Reduz custo de reconhecimento para atacante (versão do framework, ataques específicos).

#### Recomendação

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  poweredByHeader: false,  // <-- 1 linha
  // ...
};
```

#### Critério de aceitação

`curl -I https://kindar.com.br` não retorna `X-Powered-By`.

---

### 4.12 [BAIXO] #12 — HSTS sem includeSubDomains/preload

**OWASP A02**

#### Descrição

`Strict-Transport-Security: max-age=63072000` está configurado pela Vercel, mas sem `includeSubDomains` nem `preload`.

#### Recomendação

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Atenção:** `preload` é uma **decisão semi-irreversível** — sair da lista do Chrome demora 6-12 meses. Pré-requisitos:

1. Todos os subdomínios (`*.kindar.com.br`) devem servir HTTPS válido
2. Redirecionamento HTTP → HTTPS em todos eles
3. Submissão em `hstspreload.org` após confirmar (1)+(2)

#### Critério de aceitação

- Header presente com `includeSubDomains; preload`
- Submissão pendente em hstspreload.org (não exigir entrada efetiva — pode demorar semanas)

---

### 4.13 [BAIXO] #13 — 503 esporádicos em RSC

#### Descrição

Endpoints `_rsc` retornaram 503 em ocasiões esporádicas durante a auditoria. Provavelmente cold start de funções Vercel ou bug em Server Component não tratado.

#### Recomendação

1. Correlacionar `x-vercel-id` com logs Vercel
2. Adicionar `try/catch` defensivo em Server Components que fazem fetch externo
3. Configurar `dynamic = "force-dynamic"` ou `revalidate` apropriado para evitar SSG inadequado

#### Critério de aceitação

Taxa de 5xx em `/dashboard?_rsc=*` abaixo de 0.05% em janela de 7 dias.

---

### 4.14 [INFO] #14 — Inventário de endpoints REST

Mapeamento confirmado contra [src/lib/supabase/middleware.ts:141-200](DEV/src/lib/supabase/middleware.ts:141). Sem ação necessária — informativo.

**Recomendação operacional:** manter documentação OpenAPI/Swagger interna (não pública) dos endpoints `/api/*` para facilitar code review e onboarding.

---

### 4.15 [INFO] #15 — Analytics em path randomizado (Plausible/Umami via proxy)

Cumpre função técnica (anti-adblock) mas precisa estar declarado em política de privacidade — endereçado no #9.

---

## 5. Achados Verificados como Falsos Positivos ou Parcialmente Aplicáveis

| Achado original | Status após verificação |
|---|---|
| #3 "User_id no cliente" como ALTO universal | Reclassificado para MÉDIO — RLS validada em `notifications`; pendência é auditar outras tabelas |
| #5 "Middleware retorna 503" em `/admin` | O middleware faz redirect 302, não 503. Os 503 observados são fenômeno separado (provavelmente cold start) — vide #13 |
| #8 "Polling agressivo de notifications" | Já usa Realtime postgres_changes; comportamento observado é re-fetch reativo, não polling |

Recomendação ao auditor externo: tratar esses três pontos com nuance no relatório final entregue ao cliente.

---

## 6. Roadmap de Implementação

### Sprint 1 — Onda Zero-Risco (até 21-23 de maio de 2026)

| Tarefa | Achado | Esforço | Responsável | Critério |
|---|---|---|---|---|
| `poweredByHeader: false` | #11 | 1min | Backend | Header ausente |
| `productionBrowserSourceMaps: false` + `hideSourceMaps: true` | #7 | 30min | Backend | `.map` retorna 404 |
| Headers passivos (X-Frame, X-Content-Type, Referrer, Permissions) | #4 | 1h | Backend | Headers visíveis |
| CSP em `Report-Only` | #4 | 2h | Backend | Endpoint `/api/csp-report` recebendo violações |
| Confirmar Supabase: Refresh Rotation ON, Reuse Interval 0, JWT 900s | #1 | 15min | Backend | Painel Supabase |
| `sanitizeNext()` + aplicar em todos os call sites | #5 | 2h | Backend | Testes unitários verdes |
| PostHog `maskAllInputs` + `stopSessionRecording` em rotas sensíveis | #9 | 2h | Frontend | Inspeção no painel PostHog |

**Total Sprint 1:** ~1 dia útil. Sem risco operacional significativo.

### Sprint 2 — Mitigação Estrutural (até 7 de junho de 2026)

| Tarefa | Achado | Esforço | Critério |
|---|---|---|---|
| Auditoria white-box de RLS — todas as tabelas | #3 | 1-2 dias | Relatório markdown + testes pgTAP |
| Substituir `?error=` por códigos opacos | #6 | 1-2 dias | Zero call sites com texto livre |
| HSTS `includeSubDomains` + submissão preload | #12 | 1h + espera | Header ativo |
| CSP enforce (após coleta Report-Only) | #4 | 1 dia | Zero regressão por 14 dias |
| Política de privacidade + DPO + página de direitos | #9 | 2-3 dias (legal) | `/privacidade`, `/perfil/dados`, footer |
| Investigação de 503 esporádicos | #8, #13 | 1 dia | Issue Sentry resolvida |
| Mascaramento de UUIDs em telemetria | #10 | 4h | PostHog mostra `<uuid>` no `$current_url` |

### Sprint 3+ — Decisão Estratégica (até 30 de junho de 2026)

| Tarefa | Achado | Decisão necessária |
|---|---|---|
| Trade-off Safari ITP vs HttpOnly cookies | #1, #2 | Produto: aceitar re-login periódico iOS? |
| Migração UUIDs → slugs | #10 | Produto: vale o custo de migration + redirects? |
| MFA opt-in (TOTP via Supabase) | — | Defesa em profundidade — segmentar por usuário premium? |
| PostHog Cloud EU ou self-hosted | #9 | Custo vs conformidade LGPD art. 33 |

---

## 7. Processo de Segurança Contínua

### 7.1 Security SDLC integrado

| Etapa | Controle | Ferramenta sugerida |
|---|---|---|
| Pre-commit | Lint de secrets, SQL injection patterns | `gitleaks`, ESLint custom rules |
| PR review | Checklist de segurança obrigatório em PRs que tocam `auth`, `rls`, `api` | Template `.github/PULL_REQUEST_TEMPLATE.md` |
| CI | SCA (Software Composition Analysis), dependency audit | `npm audit`, Snyk, Dependabot |
| CI | SAST básico | `semgrep` com ruleset Next.js + React + Supabase |
| Deploy | Verificação de headers em smoke test | Script bash + `curl` no preview Vercel |
| Runtime | Coleta de violações CSP, falhas de RLS | Sentry + Supabase logs |
| Periódico | Auditoria white-box de RLS trimestral | Manual + pgTAP |
| Anual | Pentest com escopo de exploração | Empresa externa |

### 7.2 Métricas a monitorar

| Métrica | Limite saudável | Onde medir |
|---|---|---|
| Taxa de violações CSP em produção | < 5/dia após enforce | Sentry |
| 5xx em rotas autenticadas | < 0.1% | Vercel Analytics |
| Refresh tokens revogados em uso | 0 | Supabase Auth logs |
| Tentativas de uso de `next=` externo | < 1/dia | App logs |
| Sessões com user-agent mismatch (após Tier 3 device fingerprint) | < 0.5% | App logs |

### 7.3 Resposta a incidente

Para um incidente envolvendo sessão sequestrada ou dado vazado, ter procedimento documentado:

1. **Contenção** — revogar refresh_token do usuário afetado (`auth.admin.signOut(user_id, { scope: 'global' })`)
2. **Avaliação de impacto** — RLS logs + query history Supabase
3. **Comunicação ao titular** — LGPD art. 48 exige comunicação à ANPD e ao titular em prazo razoável
4. **Análise pós-incidente** — RCA + atualização de controles
5. **Documentação** — `docs/06-business/incidents/<data>-<slug>.md`

Sugestão: criar template `docs/08-security/incident-response-runbook.md` antes de precisar.

---

## 8. Anexos

### 8.1 Queries de verificação de RLS

Vide seção 4.3 — três queries para diagnosticar policies.

### 8.2 Configuração CSP completa (referência)

Vide seção 4.4 — Fase 1 com Report-Only.

### 8.3 Checklist LGPD aplicável

- [ ] Política de privacidade publicada em `/privacidade` em PT-BR
- [ ] Termos de uso publicados em `/termos`
- [ ] Onboarding com consentimento granular para dados de criança
- [ ] Página de exercício de direitos do titular (`/perfil/dados`)
- [ ] DPO designado, nome + email + endereço no footer
- [ ] Registro de operações de tratamento (Art. 37) — interno
- [ ] Avaliação de impacto à proteção de dados (DPIA) — para tratamento de dados de criança
- [ ] Contrato com PostHog/Plausible/Vercel/Supabase com cláusulas de operador (Art. 39)
- [ ] Garantias de transferência internacional documentadas (Art. 33)
- [ ] Procedimento de comunicação de incidente (Art. 48)
- [ ] Treinamento da equipe em LGPD (registrado)

### 8.4 Stack de auditoria assumida

| Componente | Versão | Notas |
|---|---|---|
| Next.js | 15+ | App Router + Turbopack |
| Vercel | — | Edge gru1::iad1 |
| Supabase | — | Project `jquaysfeeuwvoydsgssi` |
| PostHog | 1.374.2 | `phc_3ql7Oys5M1A8DCO4Szbnf1iWGqFleLb6nOYcRk5DQvp` |
| Sentry | @sentry/nextjs | Configurado em `next.config.ts` |

### 8.5 Referências

- OWASP Top 10 2021 — <https://owasp.org/Top10/>
- OWASP ASVS L2 — <https://owasp.org/www-project-application-security-verification-standard/>
- OWASP Secure Headers Project — <https://owasp.org/www-project-secure-headers/>
- OWASP API Security Top 10 — <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- Supabase Auth SSR Best Practices — <https://supabase.com/docs/guides/auth/server-side>
- Next.js Security Headers — <https://nextjs.org/docs/app/api-reference/next-config-js/headers>
- LGPD (Lei 13.709/2018) — <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>
- ANPD (Resoluções) — <https://www.gov.br/anpd/>
- CWE Top 25 — <https://cwe.mitre.org/top25/>

---

## 9. Encerramento

Este relatório consolida 15 achados identificados em auditoria externa, validados por revisão white-box do código-fonte. A postura de segurança do Kindar é **funcional mas insuficiente para a categoria de dados que trata** — dados de crianças e saúde exigem padrão elevado.

A boa notícia é que **a maior parte das correções de maior alavancagem é de baixo risco operacional** (headers, CSP Report-Only, sanitização de redirects) e cabe em um único sprint. Os trade-offs estratégicos (Safari ITP vs HttpOnly, slugs vs UUIDs) merecem decisão de produto deliberada, não fix mecânico.

**Próximos passos sugeridos:**

1. Revisar e aprovar o Roadmap (seção 6)
2. Atribuir responsáveis por Sprint 1
3. Agendar revisão pós-Sprint 1 para validar critérios de aceitação
4. Decidir sobre Sprint 3 (estratégico) em sessão dedicada com produto

---

*Documento técnico, sujeito a revisão à medida que mudanças são implementadas e novos achados são identificados. Atualizar versão no cabeçalho a cada revisão.*
