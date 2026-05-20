# Tier A Auth Foundations — Relatório completo e manual operacional

**Data:** 2026-05-20
**PR:** [#17](https://github.com/hdpedro/CoPais/pull/17)
**Branch:** `auth/signup-tier-a-foundations`
**Migration:** `00085_auth_signup_tier_a`

---

## 🎯 TL;DR

Em ~6h foi:

1. **Identificada e eliminada** a causa raiz de 5 testers travadas nos últimos 4 dias (PKCE cross-device do Supabase quebrando em WebView Gmail/Outlook).
2. **Liberadas as 5 testers** (UPDATE no banco) e enviado e-mail humanizado pra cada uma via Resend.
3. **Migrado o fluxo** de confirmação de e-mail/magic link/reset/troca de e-mail pro `token_hash` flow do Supabase (cross-device safe).
4. **Adicionadas 4 camadas Tier A** que separam o Kindar de SaaS BR média: rescue cron automático, Cloudflare Turnstile, alerta de novo dispositivo, ToS/Privacy versionado (LGPD).
5. **Configurado tudo manualmente** nos dashboards (Supabase, Cloudflare, Vercel) via navegação automatizada.

**Status: pronto pra receber pagantes definitivos assim que o PR for merged.**

---

## 1. O que aconteceu (contexto)

Você reportou que **hlustosa.fono@gmail.com** confirmou o e-mail 2 vezes e não conseguia logar. Investigação mostrou:

- O usuário tinha `email_confirmed_at = NULL` em `auth.users`
- Auth logs do Supabase mostravam o pedido de re-envio mas **zero eventos de `verify`**
- O clique no link nunca chegava a executar `verifyOtp`
- **Mais 4 testers (andreiacorquiola, barbararitto, crikacast, fcaraujo) estavam travadas no mesmo padrão**

### Causa raiz: PKCE cross-device

O Supabase Auth (via `@supabase/ssr`) usa **PKCE flow por default** — gera um `code_verifier` em cookie httpOnly do browser onde o `signUp` foi feito.

Fluxo que quebrava:

1. Usuário faz signup no Safari/Chrome do celular → cookie `sb-*-auth-token-code-verifier` salvo nesse browser
2. E-mail chega no Gmail → toca a notificação → Gmail abre WebView interno
3. WebView **não compartilha cookies** com Safari/Chrome
4. GET para `/auth/callback?code=XXX` → `exchangeCodeForSession(code)` falha por falta de verifier
5. Server redireciona `/login?error=Link expirado ou já utilizado`
6. **`email_confirmed_at` continua NULL** — usuário trava

OAuth (Google/Apple) não passa por PKCE confirmation, então nunca travava. Email/senha com clique do mesmo browser do signup funcionava. Email/senha com clique do app de e-mail (90% dos celulares) **sempre falhava**.

---

## 2. O que foi entregue

### Camada 1 — Causa raiz eliminada (PKCE → token_hash)

| Arquivo | O que faz |
|---|---|
| `src/app/auth/confirm/route.ts` | Server route que processa `verifyOtp({type, token_hash})` — funciona cross-device. Idempotente. |
| `src/app/auth/confirm/layout.tsx` | Wrapper com `I18nProvider` + estética coerente com `(auth)/layout` |
| `src/app/auth/confirm/error/page.tsx` | UI premium em falha: 5 causas humanas (expired, already_used, invalid, network, unknown) + 3 botões (reenviar, login, suporte) |
| `src/actions/auth.ts` (extendido) | `resendConfirmation`, `sendMagicLink`, `signUp` com Turnstile+ToS, `signIn` com login alert, `resetPassword` com `/auth/confirm` |
| `src/app/api/auth/resend/route.ts` | Wrapper REST pro `resendConfirmation` (usado por forms HTML) |
| **`docs/03-architecture/SUPABASE-EMAIL-TEMPLATES.md`** | **HTML pronto pra colar dos 4 templates Supabase. Já foi aplicado.** |

### Camada 2 — UX premium na confirmação

| Arquivo | O que faz |
|---|---|
| `src/app/(auth)/verify-email/page.tsx` (server) + `VerifyEmailClient.tsx` (client) | Polling realtime `/api/auth/status` a cada 4s → auto-redirect quando o user confirmar em qualquer device. Botão "Abrir Gmail/Outlook/iCloud/Yahoo" (detecção por domínio). Countdown reenviar 60s. Magic link inline. OAuth Google fallback. "Mudar e-mail" + "Falar com suporte". |
| `src/app/api/auth/status/route.ts` | Endpoint público que retorna `{confirmed: boolean}` pro polling. Rate-limited best-effort por IP. |
| `src/app/(auth)/login/page.tsx` | + botão "Entrar sem senha" (magic link) como segunda opção abaixo de e-mail+senha |
| `src/app/(auth)/signup/page.tsx` | + Turnstile widget invisível antes do botão de criar conta |

### Camada 3 — Safety net automático

| Arquivo | O que faz |
|---|---|
| `src/app/api/cron/signup-rescue/route.ts` | Cron hourly @ minuto 15: identifica users `email_confirmed_at IS NULL` há >1h e <7d, **auto-confirma**, envia e-mail humanizado, captura `signup_rescued` no PostHog, audit em `app_errors`. Idempotente. |
| `src/lib/emails/signup-rescue.ts` | Template Resend humanizado i18n 5 locales: "Identificamos um problema técnico no nosso sistema de confirmação… Já corrigimos. Time Kindar." |
| `vercel.json` | + schedule `15 * * * *` |
| `src/app/admin/metrics/page.tsx` | + tile "Saúde do funil de signup" com semáforo (started/confirmed/stuck 24h+7d, alerta visual quando stuck rate > 5%) |
| Migration → `public.v_signup_funnel_health` | View Postgres consumida pelo tile |

### Camada 4 — Controles Tier A pra pagantes

| Arquivo | O que faz |
|---|---|
| `src/components/auth/TurnstileWidget.tsx` | Widget invisível (managed mode). Fail-open em dev se sem env. |
| `src/lib/turnstile.ts` | Server validation contra `/siteverify`. Fail-closed em token inválido, fail-open em rede. |
| `src/lib/auth-fingerprint.ts` | SHA256(UA normalizado + IP /24). `/24` evita falsos positivos por troca de operadora. |
| `src/lib/auth-login-device.ts` | Insere/atualiza `auth_login_devices`. Dispara e-mail **só na primeira ocorrência** do device (skip se for o primeiro device ever — é signup). |
| `src/lib/emails/login-alert.ts` | "Novo dispositivo entrando no seu Kindar" — factual, padrão Stripe/Github |
| Migration → `public.terms_acceptances` | LGPD audit trail append-only (triggers bloqueiam UPDATE/DELETE mesmo via service role) |
| Migration → `public.auth_login_devices` | Fingerprint UNIQUE por (user_id, device_hash) |
| `src/actions/auth.ts` constantes | `APP_TERMS_VERSION="1.0"` + `APP_PRIVACY_VERSION="1.0"`. INSERT em `terms_acceptances` após signUp com IP+UA+versões. |

### i18n

`scripts/i18n-tier-a-keys.mjs` — script idempotente. **+71 keys × 5 locales = 355 strings novas**.

Categorias:
- `auth.verifyEmail.*` (atualizado): countdown, abrir provedor, alternatives, realtime status
- `auth.confirm.*` (novo): causas de erro humanas + 3 ações
- `auth.login.magicLink.*` (novo): toggle, send, sent, back, error
- `auth.signup.*` (novo): turnstileError, tosVersionedNote
- `emails.signupRescue.*` (novo): subject, greeting, intro, ctaButton, signature ("Time Kindar")
- `emails.loginAlert.*` (novo): factual layout com device/location/when
- `admin.funnel.*` (novo): tile labels

Validações:
- ✅ Parity OK em 5 locales (PWA 2459 + Native 2514 keys)
- ✅ Char limits OK
- ✅ 0 hardcoded literals no escopo canônico

### Liberação manual

- **SQL direto** em `auth.users` confirmou 5 contas
- `scripts/dispatch-rescue-now.mjs` disparou 5 e-mails via Resend
- Todos enviaram com sucesso (Resend IDs registrados)

### Configurações externas executadas via navegador

- ✅ 4 templates Supabase substituídos (PKCE → token_hash)
- ✅ SMTP Resend já estava configurado (verificado)
- ✅ Widget Turnstile criado (modo Managed, 2 hostnames)
- ✅ 2 env vars adicionadas na Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`)

---

## 3. Como funciona agora (fluxo completo)

### Signup → primeira sessão

```
1. User abre /signup, preenche e-mail + senha + nome + LGPD checkbox
2. TurnstileWidget já carregou em background (invisível 99% dos casos)
3. Submit → /signup server action:
   - verifyTurnstileToken(token) — bloqueia bot
   - supabase.auth.signUp() — cria user em auth.users
   - INSERT em terms_acceptances (LGPD audit, IP+UA+versões)
   - captureServerEvent("signup_completed")
   - sendWelcomeEmail() (Resend, transacional, locale do user)
   - redirect("/verify-email?email=<email>")

4. /verify-email mostra:
   - "Enviamos um link para joao@gmail.com"
   - Botão grande "Abrir Gmail" (deeplink)
   - Banner "Estamos verificando automaticamente" (polling /api/auth/status a cada 4s)
   - Botão "Reenviar e-mail" (countdown 60s pós-clique)
   - Expandível "Prefere outra forma?" → Magic Link + OAuth Google
   - Discreto "Mudar e-mail" + "Falar com suporte"

5. User abre e-mail no Gmail mobile, toca "Confirmar e-mail":
   - Link: https://www.kindar.com.br/auth/confirm?token_hash=XXX&type=signup&next=/dashboard
   - WebView interno do Gmail abre essa URL
   - /auth/confirm/route.ts roda verifyOtp({type:'signup', token_hash}) — SEM precisar de cookie do browser de origem
   - Sucesso: estabelece sessão (cookies SSR), redirect /dashboard
   - Captura "signup_confirmed" no PostHog

6. Em paralelo, a aba /verify-email que ficou aberta detecta confirmação via polling:
   - GET /api/auth/status?email=<email> retorna {confirmed: true}
   - Mostra check verde "Confirmado! Redirecionando..." (1.2s)
   - Auto-navega pra /dashboard

7. Primeira sessão = primeiro device → recordLoginDevice() insere row mas NÃO envia alert
   (skip primeiro device pra evitar e-mail "novo dispositivo" logo após signup)
```

### Login subsequente

```
1. /login com e-mail + senha
2. signIn server action chama supabase.auth.signInWithPassword
3. Em paralelo (fire-and-forget): recordLoginDevice()
   - Calcula fingerprint = SHA256("v1" + UA_normalizado + IP_/24)
   - Procura row em auth_login_devices(user_id, device_hash)
   - Se existe: UPDATE last_seen → NÃO alerta
   - Se não existe + total devices > 1: INSERT + envia login-alert email
4. Redirect /dashboard
```

### Magic Link

```
1. User no /login clica "Entrar sem senha"
2. sendMagicLink → supabase.auth.signInWithOtp
3. Template "Magic Link" do Supabase envia:
   https://www.kindar.com.br/auth/confirm?token_hash=XXX&type=magiclink&next=/dashboard
4. Mesmo /auth/confirm/route.ts processa via verifyOtp({type:'magiclink', ...})
5. Cross-device safe (mesma rota usada pelo signup)
```

### Recovery (esqueci senha)

```
1. /forgot-password envia e-mail via resetPassword action
2. Template Reset Password manda link com type=recovery
3. /auth/confirm/route.ts detecta type=recovery → redireciona /reset-password
4. User define nova senha, /reset-password chama updatePassword
```

### Rescue automático (safety net)

```
A cada hora @ minuto 15 (Vercel cron):
1. GET /api/cron/signup-rescue (Bearer ${CRON_SECRET})
2. Query v_signup_funnel_health → stuck_current
3. Lista users com email_confirmed_at NULL, created_at entre 1h-7d, não SSO
4. Filtra os que já foram resgatados (idempotência via app_errors)
5. Pra cada um:
   - admin.auth.admin.updateUserById(id, {email_confirm: true})
   - sendSignupRescueEmail("Time Kindar")
   - INSERT em app_errors severity='info' (audit)
   - captureServerEvent("signup_rescued")
```

---

## 4. Como você usa (operador)

### Cenário A: usuário pagante reclama que não conseguiu confirmar e-mail

**1. Abra /admin/metrics** → veja tile "Saúde do funil de signup":
- Se `stuck_current > 0`: existe gente travada
- O cron rescue roda no próximo @ :15

**2. Ação imediata (não esperar 1h):**

```sql
-- via Supabase SQL Editor ou MCP
UPDATE auth.users SET email_confirmed_at = now()
WHERE lower(email) = 'usuario@gmail.com'
  AND email_confirmed_at IS NULL
RETURNING email, email_confirmed_at;
```

Depois rode o script de rescue email (ou peça pra ele tentar logar — já vai funcionar):

```bash
cd DEV
# edite scripts/dispatch-rescue-now.mjs adicionando o email
node scripts/dispatch-rescue-now.mjs
```

### Cenário B: usuário diz "recebi e-mail de novo dispositivo, fui eu mesmo"

Ignore. O alerta é informativo. Foi disparado pela primeira ocorrência do device hash dele. Se ele logar de novo do mesmo device, **não vai receber outro alerta** — `last_seen` é atualizado mas `alert_sent_at` continua marcado.

Se ele troca de operadora e o IP/24 muda, vai receber outro alerta (raro). Se isso virar problema (>2 alertas/mês), aí ajusta o fingerprint pra ignorar IP — só UA — em `src/lib/auth-fingerprint.ts` linha 75.

### Cenário C: bot tentando criar 1000 contas

Turnstile bloqueia silenciosamente. Você verá em `app_errors` event `signup_blocked_bot` se algum passar do widget. PostHog rastreia.

Se subir muito, ajustar:
- Turnstile dashboard → trocar mode de "Managed" pra "Non-interactive" ou "Invisible"
- Adicionar rate limit no /signup por IP (não tem hoje, é Tier S)

### Cenário D: pagante de plano de R$ 1000/mês quer auditoria LGPD da conta

```sql
-- Vê quando aceitou ToS, com IP e UA, e qual versão
SELECT terms_version, privacy_version, ip_address, user_agent, accepted_at
FROM terms_acceptances
WHERE user_id = '<UUID>'
ORDER BY accepted_at DESC;
```

Append-only — triggers bloqueiam UPDATE/DELETE. Você pode mostrar a linha como prova de aceite.

### Cenário E: usuário quer ver dispositivos logados

```sql
SELECT device_hash, user_agent, ip_address, country, city, first_seen, last_seen
FROM auth_login_devices
WHERE user_id = '<UUID>'
ORDER BY last_seen DESC;
```

UI pra mostrar isso pro user é Tier S (próxima sprint se virar diferencial).

### Cenário F: pivot de produto requer mudar Termos de Uso

```ts
// src/actions/auth.ts
export const APP_TERMS_VERSION = "2.0";  // bump
export const APP_PRIVACY_VERSION = "1.0"; // pode ficar
```

Toda conta nova vai gravar "2.0" em `terms_acceptances`. Pra forçar re-aceite de quem já tem conta (com 1.0), é outra história — exige UI bloqueante na primeira tela após login que detecta versão < APP_TERMS_VERSION e mostra modal "Termos atualizados, leia e aceite". Não está incluído (próxima sprint).

### Cenário G: testar tudo end-to-end depois do merge

1. Merge PR #17 na main
2. Espera Vercel deployar (~2 min)
3. **Crie conta teste** com gmail seu (não Google sign-in — email/senha)
4. **Abra o e-mail no app Gmail do celular**
5. **Clica "Confirmar e-mail"**:
   - ✅ Deve cair em `/dashboard` direto
   - ✅ Sem erro "Link expirado"
6. Em outra aba do desktop: abre `/verify-email?email=seu+test@gmail.com`
   - ✅ Vê banner "verificando automaticamente"
   - ✅ Quando confirmar pelo celular, essa aba auto-redireciona pra /dashboard
7. Logout, /login, clica "Entrar sem senha"
   - ✅ Recebe magic link, clica, entra
8. Loga de outro device (ex: outro browser)
   - ✅ Recebe e-mail "Novo dispositivo entrando"
9. `/admin/metrics`:
   - ✅ Tile "Saúde do funil" mostra contagens corretas
10. Trigger manual do cron rescue:
    ```bash
    curl -H "Authorization: Bearer $CRON_SECRET" https://www.kindar.com.br/api/cron/signup-rescue
    # Deve retornar {ok:true, rescued:0} se ninguém travado
    ```

---

## 5. Como debugar quando algo quebrar

### "Usuário diz que não recebeu o e-mail de confirmação"

```sql
-- 1. Existe a conta?
SELECT id, email, email_confirmed_at, confirmation_sent_at, created_at
FROM auth.users WHERE lower(email) = 'usuario@gmail.com';

-- 2. Resend tem registro do envio?
-- Login no Resend dashboard → Logs → busca o e-mail
```

Se Supabase tem `confirmation_sent_at` mas Resend não tem registro → SMTP config quebrou. Verifique Supabase → Auth → SMTP Settings.

### "Usuário diz que clicou no link e nada acontece"

```bash
# auth logs do Supabase últimas 24h
# busca por email do user ou auth_event
```

Via Supabase MCP:
```ts
mcp_get_logs({ project_id: 'jquaysfeeuwvoydsgssi', service: 'auth' })
```

Procure por eventos `user_signedup_with_verified_email` ou erros do verifyOtp. Se o clique nem chega ao Supabase, problema é o template — verifique se `{{ .TokenHash }}` está sendo usado (não `{{ .ConfirmationURL }}`).

### "Turnstile está bloqueando users reais"

PostHog event `signup_blocked_bot` com `reason`. Se subir muito:
1. Dashboard Cloudflare → Turnstile → Analytics
2. Veja taxa de challenge solve. Se < 95%, mode atual é muito agressivo
3. Pode mudar widget pra mode "Non-interactive" no Cloudflare

### "Cron rescue não está rodando"

Vercel Dashboard → kindar → Cron Jobs → veja last run do `/api/cron/signup-rescue`. Se falhou, abre logs.

### "Login alert mandou e-mail errado pro user que sou eu mesmo"

Esperado quando você loga de um device novo. Se você troca muito de browser/computador, pode ficar barulhento. Pra você (admin), pode adicionar exceção:

```ts
// src/lib/auth-login-device.ts:90 (recordLoginDevice)
if (args.email === 'henrique.de.pedro@gmail.com') return { isNewDevice:false, alertSent:false };
```

Ou tornar configurável via env var.

---

## 6. Métricas pra acompanhar (dia-a-dia)

| Métrica | Onde | Threshold OK |
|---|---|---|
| Taxa de signup completion | PostHog funnel: signup_started → signup_completed → signup_confirmed | >70% |
| Stuck rate 24h | `/admin/metrics` tile | <5% |
| Stuck current | `/admin/metrics` tile | <3 |
| Rescue cron — rescued count diário | `app_errors` severity='info' file_path like 'signup-rescue%' | 0 idealmente |
| Login alerts disparados/dia | PostHog `login_device_new` | Acompanhar baseline |
| Turnstile challenges/solves | Cloudflare Turnstile Analytics | Solve rate >95% |
| Resend bounce rate | Resend dashboard | <2% |

**Alerta crítico:** se `stuck_current` ficar > 5 por mais de 2h, alguma coisa quebrou no caminho. Provavelmente o template Supabase voltou pra PKCE (alguém editou no dashboard), ou o cron parou.

---

## 7. Arquitetura — o que vive onde

```
Browser
  ├─ /signup ──[Turnstile invisível]──> action signUp ──> Supabase signUp
  │                                            │
  │                                            └──> INSERT terms_acceptances (LGPD)
  │
  ├─ /verify-email ──polling──> /api/auth/status ──> admin.listUsers
  │
  └─ click no email link
        │
        ▼
  /auth/confirm?token_hash=XXX&type=signup&next=/dashboard
        │
        └──> verifyOtp({type, token_hash}) ──> sessão estabelecida
                                                   │
                                                   └──> /dashboard

Supabase Auth
  ├─ auth.users           (PK user account)
  ├─ auth.identities      (OAuth + email/senha)
  └─ auth.flow_state      (PKCE — não usado mais pra email confirm)

Public schema (nosso)
  ├─ terms_acceptances    (LGPD audit, append-only)
  ├─ auth_login_devices   (fingerprint per device, alerta primeira vez)
  ├─ app_errors           (rescue audit, signup_rescued events)
  └─ v_signup_funnel_health (view do admin tile)

Cron Vercel (hourly @ :15)
  └─ /api/cron/signup-rescue
        │
        ├──> identifica stuck >1h
        ├──> auto-confirma
        ├──> sendSignupRescueEmail (Resend)
        └──> log app_errors + PostHog

External
  ├─ Resend SMTP (Supabase Auth) ──> templates customizados Confirm/Magic/Reset/Email
  ├─ Resend API (transacionais) ──> welcome, signup-rescue, login-alert
  ├─ Cloudflare Turnstile ──> /siteverify validação
  └─ PostHog ──> signup_*, login_*, magic_link_*, signup_rescued
```

---

## 8. Próximos passos (roadmap pra Tier S quando precisar)

**Pode esperar até primeiro cliente B2B/enterprise pedir:**

- MFA TOTP (1 dia de trabalho com Supabase Auth nativo)
- Pwned password check (haveibeenpwned API, 2-3h)
- Account recovery "perdi acesso ao email" (fluxo identidade ou suporte humano)
- Audit log SOC2-lite (tabela `auth_audit_log` append-only com login/logout/password reset/email change)
- Passkeys (Apple WebAuthn + Android, ~1 sprint)
- UI "Dispositivos logados" com botão "Revogar"
- Re-aceite obrigatório de Termos quando versão muda
- Rate limit por IP no /signup além do default Supabase

**Curiosidades não-bloqueantes:**

- Dashboard PostHog dedicado pra funil de signup (~1h)
- Alerta no Slack/Discord quando `stuck_current > 5` via cron (~30min)
- A/B test do botão "Continuar com Google" vs "Entrar sem senha" no /login (~2h)

---

## 9. Liberações executadas (registro)

### Antes da execução (descoberta)
- `haillabarros@gmail.com` → user_id `fd87671d-5c8a-4a19-9835-cdb682050520` → premium_juridico_monthly
- `gustaneves@gmail.com` → user_id `38014981-5a6e-47db-8093-d4cf3154b542` → premium_juridico_monthly
- `barbararitto@gmail.com` → user_id `68795c9c-505c-4300-bb20-709b30793e7e` → premium_juridico_monthly
- `hlustosa.fono@gmail.com` → user_id `c5c3511e-769d-4035-b159-c0089dbf17e0` → premium_juridico_monthly

### Auto-confirmadas (5)
- `hlustosa.fono@gmail.com` (Heloisa Lustosa)
- `andreiacorquiola@gmail.com` (Andreia Pereira)
- `barbararitto@gmail.com` (Bárbara Ritto)
- `crikacast@gmail.com` (Cristiane Maria da Silva)
- `fcaraujo@gmail.com` (Felipe Costa Araujo)

### Rescue emails enviados (Resend IDs)
- `fef73acd-1570-4045-8e56-5a916bea5c4d`
- `34f952c3-c6b0-4ae3-838b-f5910076de9d`
- `c1aed14d-5d0d-49d7-b6bf-badeab546f5f`
- `5987257c-1915-4910-99e0-9baeec15abbd`
- `dee5783b-7606-49f5-92b6-e9b9055d0afc`

### Pendentes (sem conta criada)
- `analuisapinho@yahoo.com.br` — nunca fez signup
- `crrpao@gmail.com` — nunca fez signup

---

## 10. Configurações que estão ativas em produção

### Supabase Project `jquaysfeeuwvoydsgssi` (CoPais)
- **Migration `00085_auth_signup_tier_a`** aplicada
- **4 templates Auth** customizados pra token_hash (Confirm sign up, Magic Link, Reset Password, Change Email)
- **Custom SMTP** Resend (smtp.resend.com:465, user `resend`, sender `noreply@kindar.com.br`)

### Cloudflare Turnstile (account `ef2a0fffa353c6d990bff2bf734f15de`)
- Widget "Kindar" criado, modo Managed
- Hostnames: `www.kindar.com.br`, `kindar.com.br`
- Site Key: `0x4AAAAAADTGRqCizjxCoGwH` (público)

### Vercel project `kindar`
- **Env var** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production + Preview)
- **Env var** `TURNSTILE_SECRET_KEY` (Sensitive, Production + Preview)

### GitHub
- **PR #17** `feat(auth/tier-a): elimina bug PKCE cross-device + tier-A foundations pra pagantes`
- 30 arquivos, +3592/-129 linhas
- 1144/1144 tests verde, lint 0 errors, typecheck verde
