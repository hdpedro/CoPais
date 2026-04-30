# Manual Operacional — Monetização Kindar

> Passo a passo do que fazer **manualmente** para ativar em produção o que foi implementado em código (Fases 1-3).
> Siga na ordem. Cada seção tem **pré-requisitos** e **validação** (como saber que funcionou).

Última atualização: Abril/2026 · cobre migrations 00054–00059.

---

## Índice

1. [Rodar migrations no Supabase](#1-rodar-migrations-no-supabase)
2. [Variáveis de ambiente (.env / Vercel)](#2-variaveis-de-ambiente)
3. [Stripe — criar produtos e preços](#3-stripe-criar-produtos-e-precos)
4. [Stripe — webhook](#4-stripe-webhook)
5. [Stripe — PIX e cupom de desconto](#5-stripe-pix-e-cupom-de-desconto)
6. [Apple App Store Connect — produtos IAP](#6-apple-app-store-connect-produtos-iap)
7. [Google Play Console — produtos IAP](#7-google-play-console-produtos-iap)
8. [RevenueCat — offerings + webhook](#8-revenuecat-offerings-e-webhook)
9. [Vercel Cron — validar trial-expiry e trial-reminder](#9-vercel-cron-validar)
10. [Validação end-to-end](#10-validacao-end-to-end)
11. [Monitoramento + PostHog](#11-monitoramento-posthog)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Rodar migrations no Supabase

**Pré-requisitos**: acesso ao projeto Supabase via CLI ou dashboard.

### Opção A — Supabase CLI (recomendado)

```bash
cd DEV
npx supabase db push
```

Isso aplica todas as migrations pendentes em ordem: 00054 → 00055 → 00056 → 00057 → 00058 → 00059.

### Opção B — Dashboard Supabase (se CLI não estiver configurada)

Vá em **SQL Editor** e cole cada arquivo, na ordem, rodando um por vez:

1. `supabase/migrations/00054_subscriptions_per_group.sql`
2. `supabase/migrations/00055_plans_reprice_and_rename.sql`
3. `supabase/migrations/00056_early_bird_counter.sql`
4. `supabase/migrations/00057_onboarding_quest.sql`
5. `supabase/migrations/00058_subscription_split.sql`
6. `supabase/migrations/00059_pix_payment_method_hint.sql`

### Validação

No SQL Editor:

```sql
-- Deve retornar 6 plan IDs ativos (free, harmonia_monthly, harmonia_annual,
-- harmonia_earlybird_monthly, harmonia_earlybird_annual, premium_juridico_monthly, premium_juridico_annual)
SELECT id, name, price_brl, max_subscribers, is_active
FROM plans
WHERE is_active = true
ORDER BY sort_order;

-- Deve retornar 1 linha por Early Bird plan com slots_remaining = 1000 (zero assinantes ainda)
SELECT * FROM v_early_bird_slots_remaining;

-- Deve existir
SELECT COUNT(*) FROM onboarding_quests;
```

---

## 2. Variáveis de ambiente

Adicione **no Vercel** (e localmente em `.env.local` se for testar):

```bash
# Já existiam (conferir):
STRIPE_SECRET_KEY=sk_live_...           # ou sk_test_... em dev
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://kindar.com.br
CRON_SECRET=<string aleatoria 32+ chars>
SUPABASE_SERVICE_ROLE_KEY=<service-role>

# NOVAS — Fase 3:
STRIPE_PIX_COUPON_ID=                   # preencher após §5.2
NEXT_PUBLIC_PIX_ENABLED=false           # mudar para true após §5.1 liberar PIX Automatico

# Promo "2 meses grátis" (lançamento — desligar quando saturar):
PROMO_2M_FREE=true                      # estende trial in-app + Stripe checkout pra 60d
NEXT_PUBLIC_PROMO_2M_FREE=true          # exibe banner "🎁 2 meses grátis" no UI
```

**Onde cada uma é lida**:
- `STRIPE_PIX_COUPON_ID` → `src/app/api/stripe/checkout/route.ts` (aplica desconto)
- `NEXT_PUBLIC_PIX_ENABLED` → `src/app/(app)/assinatura/AssinaturaClient.tsx` (mostra toggle PIX vs Card) + `src/lib/billing/pix.ts` (`isPixSubscriptionEnabled()`)
- `CRON_SECRET` → `src/app/api/cron/trial-expiry/route.ts` e `trial-reminder/route.ts`
- `PROMO_2M_FREE` → `src/lib/billing/promo.ts` (helpers `trialDaysInApp()` + `trialDaysStripeCheckout()`) usados em `lib/billing/trial.ts:grantTrialIfEligible()` e `app/api/stripe/checkout/route.ts`
- `NEXT_PUBLIC_PROMO_2M_FREE` → `assinatura/AssinaturaClient.tsx` (banner) + `landing/LandingFaq.tsx` + `landing/LandingPricingPreview.tsx`

**Como ligar/desligar a promo:**
- **Ligar**: setar ambos pra `true` no Vercel + criar intro offers Apple via `node scripts/asc-iap-intro-offer.mjs`
- **Desligar**: setar pra `false` ambos no Vercel + remover intro offers Apple via `node scripts/asc-iap-intro-offer.mjs --delete`
- Subscriptions Stripe já criadas mantêm seu trial original; só novos checkouts sentem a mudança.

---

## 3. Stripe — criar produtos e preços

Acesse https://dashboard.stripe.com/products > **+ Add product** para cada um dos planos abaixo. Cole o `price_id` gerado na coluna `stripe_price_id` da tabela `plans`.

### 3.1. Produtos a criar

| Plano (nome Stripe) | Plan ID (nossa tabela) | Preço BRL | Intervalo | Observações |
|---------------------|------------------------|-----------|-----------|-------------|
| Harmonia — Early Bird | `harmonia_earlybird_monthly` | R$ 19,90 | mensal | Produto novo — não reutilizar o do `premium_monthly` |
| Harmonia — Early Bird Anual | `harmonia_earlybird_annual` | R$ 191,00 | anual | — |
| Harmonia | `harmonia_monthly` | R$ 24,90 | mensal | — |
| Harmonia Anual | `harmonia_annual` | R$ 239,00 | anual | — |
| Premium Jurídico | `premium_juridico_monthly` | R$ 39,90 | mensal | — |
| Premium Jurídico Anual | `premium_juridico_annual` | R$ 383,00 | anual | — |

**Configurações importantes** ao criar cada preço:
- **Currency**: BRL
- **Pricing model**: Standard / Recurring
- **Payment behavior**: default
- Marque "tax behavior" = inclusive (para clareza do consumidor BR)

### 3.2. Atualizar a tabela `plans` com os price IDs

No Supabase SQL Editor:

```sql
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'harmonia_earlybird_monthly';
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'harmonia_earlybird_annual';
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'harmonia_monthly';
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'harmonia_annual';
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'premium_juridico_monthly';
UPDATE plans SET stripe_price_id = 'price_XXXXX' WHERE id = 'premium_juridico_annual';
```

Troque `price_XXXXX` pelos valores reais do Stripe.

### Validação

```sql
SELECT id, name, price_brl, stripe_price_id
FROM plans
WHERE is_active = true AND price_brl > 0;
```

Nenhum `stripe_price_id` pode estar NULL entre os planos pagos.

---

## 4. Stripe — webhook

### 4.1. Configurar endpoint

1. Dashboard Stripe > **Developers** > **Webhooks** > **+ Add endpoint**
2. **Endpoint URL**: `https://kindar.com.br/api/stripe/webhook`
3. **Eventos a escutar** (marque todos):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded` ← **novo, Fase 2 (renovação do split)**
   - `invoice.payment_failed`
4. Salve e copie o **signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` no Vercel.

### Validação

Em **Webhooks > seu endpoint > Send test webhook**, dispare um `invoice.payment_succeeded` com modo de teste. Confira nos logs do Vercel (`kindar.com.br/api/stripe/webhook`) que chegou status 200.

---

## 5. Stripe — PIX e cupom de desconto

### 5.1. Habilitar PIX (+ PIX Automático para recorrência)

**PIX one-time** já funciona com a Stripe — basta ativar o método em **Settings > Payment methods > PIX**.

**PIX Automático (recorrência)** — beta em 2024/2025. Para habilitar:

1. Dashboard Stripe > **Settings > Payment methods > Brazil**
2. Localize **PIX** e clique em **Set up** / **Enable recurring**
3. Se não aparece a opção, abra ticket em https://support.stripe.com pedindo acesso ao PIX Automático ("Request access to PIX recurring payments for my account")
4. Após aprovação (geralmente 2-7 dias), marque `NEXT_PUBLIC_PIX_ENABLED=true` no Vercel e faça redeploy

**Enquanto o PIX Automático não for liberado**: deixe `NEXT_PUBLIC_PIX_ENABLED=false` — o toggle não aparece para o usuário e todos entram no fluxo de cartão. O código já trata esse caso.

### 5.2. Criar cupom de desconto R$5

1. Dashboard Stripe > **Products > Coupons > + New**
2. Configurar:
   - **Name**: `Desconto PIX`
   - **ID**: `PIX_5_FOREVER` (ou qualquer string estável — você vai usar em env var)
   - **Type**: Amount off
   - **Amount**: 500 (cent = R$ 5,00)
   - **Currency**: BRL
   - **Duration**: Forever (aplica em todas as renovações)
   - **Redemption limits**: Limit to first-time customers = false (deixe ilimitado)
3. Salve e copie o **coupon ID** para `STRIPE_PIX_COUPON_ID` no Vercel.

### Validação

Teste um checkout via `/assinatura` com PIX selecionado. Na tela do Stripe, o valor deve aparecer `R$ 19,90` em vez de `R$ 24,90` (para Harmonia monthly). O cupom `PIX_5_FOREVER` aparece no detalhe.

---

## 6. Apple App Store Connect — produtos IAP

**Pré-requisitos**: conta Apple Developer + App Store Connect com acesso ao app Kindar.

### 6.1. Criar produtos IAP

Acesse App Store Connect > seu app > **Features > In-App Purchases > + New**. Crie:

| Reference Name | Product ID | Type | Price (USD) |
|----------------|------------|------|-------------|
| Harmonia Early Bird Monthly | `com.kindar.harmonia.earlybird.monthly` | Auto-Renewable Subscription | $3.99 |
| Harmonia Early Bird Annual | `com.kindar.harmonia.earlybird.annual` | Auto-Renewable Subscription | $37.99 |
| Harmonia Monthly | `com.kindar.harmonia.monthly` | Auto-Renewable Subscription | $4.99 |
| Harmonia Annual | `com.kindar.harmonia.annual` | Auto-Renewable Subscription | $47.99 |
| Premium Juridico Monthly | `com.kindar.juridico.monthly` | Auto-Renewable Subscription | $7.99 |
| Premium Juridico Annual | `com.kindar.juridico.annual` | Auto-Renewable Subscription | $76.99 |

**Grupo de Subscription**: crie um único "Subscription Group" chamado `Kindar Family` e inclua todos. Isso permite upgrade/downgrade entre planos.

**⚠️ Apple arredonda**: R$19,90 não existe exato no tier Apple. Use o **Tier mais próximo** e aceite o preço arredondado. A Apple converte automaticamente USD → BRL pelo tier.

### 6.2. Atualizar tabela `plans` com Apple product IDs

```sql
UPDATE plans SET apple_product_id = 'com.kindar.harmonia.earlybird.monthly' WHERE id = 'harmonia_earlybird_monthly';
UPDATE plans SET apple_product_id = 'com.kindar.harmonia.earlybird.annual' WHERE id = 'harmonia_earlybird_annual';
UPDATE plans SET apple_product_id = 'com.kindar.harmonia.monthly' WHERE id = 'harmonia_monthly';
UPDATE plans SET apple_product_id = 'com.kindar.harmonia.annual' WHERE id = 'harmonia_annual';
UPDATE plans SET apple_product_id = 'com.kindar.juridico.monthly' WHERE id = 'premium_juridico_monthly';
UPDATE plans SET apple_product_id = 'com.kindar.juridico.annual' WHERE id = 'premium_juridico_annual';
```

### 6.3. Review e aprovação

- Apple revisa IAPs separadamente do app (pode levar 24-48h)
- Envie junto com um novo build do app Kindar Native que referencie esses product IDs
- Status: **Ready to Submit → In Review → Approved**

---

## 7. Google Play Console — produtos IAP

Análogo ao Apple. Em **Play Console > seu app > Monetize > Products > Subscriptions**, crie:

| Product ID | Price BRL | Billing period |
|------------|-----------|----------------|
| `com.kindar.harmonia.earlybird.monthly` | R$ 19,90 | 1 month |
| `com.kindar.harmonia.earlybird.annual` | R$ 191,00 | 1 year |
| `com.kindar.harmonia.monthly` | R$ 24,90 | 1 month |
| `com.kindar.harmonia.annual` | R$ 239,00 | 1 year |
| `com.kindar.juridico.monthly` | R$ 39,90 | 1 month |
| `com.kindar.juridico.annual` | R$ 383,00 | 1 year |

Google Play permite o preço exato (sem arredondamento como Apple).

**Subscription Offer**: crie uma base offer sem introdução (trial já é gerenciado pelo nosso servidor) — deixe "Free trial" desabilitado.

---

## 8. RevenueCat — offerings e webhook

RevenueCat é a camada que unifica Apple + Google + (opcional) Stripe. Configurar:

### 8.1. Conectar apps

1. Dashboard RevenueCat > **Projects > Apps > + New**
2. iOS: **+ iOS app** → cole o Bundle ID `com.kindar.app` e a App Store Connect shared secret
3. Android: **+ Android app** → cole o Package name + JSON da service account (Play Console > Setup > API access)

### 8.2. Criar Entitlement

- **Entitlements > + New**
- Nome: `premium` (nossa feature-gate usa tier, mas RevenueCat exige uma entitlement)
- Descrição: "Acesso a features pagas do Kindar"

### 8.3. Criar Offerings

- **Offerings > + New > Default**
- Adicione os 6 produtos (Apple + Google) mapeados:
  - `monthly_earlybird` → iOS `com.kindar.harmonia.earlybird.monthly` + Android idem
  - `annual_earlybird` → anuais
  - `monthly_harmonia` → Harmonia mensal
  - `annual_harmonia` → Harmonia anual
  - `monthly_juridico` → Premium Jurídico mensal
  - `annual_juridico` → Premium Jurídico anual

### 8.4. Webhook para Supabase

1. **Integrations > + Add integration > Webhook**
2. URL: `https://kindar.com.br/api/revenuecat/webhook` **(⚠️ endpoint ainda não existe — ver §12 "Pendente")**
3. Copie a **Authorization header** (`Bearer rc_wh_...`) para a env `REVENUECAT_WEBHOOK_SECRET`
4. Eventos: **all** (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE)

---

## 9. Vercel Cron — validar trial-expiry e trial-reminder

**Pré-requisitos**: `vercel.json` já registra as crons (verificado). Faça deploy uma vez para ativar.

### 9.1. Confirmar

1. Vercel Dashboard > seu projeto > **Settings > Cron Jobs**
2. Deve listar:
   - `/api/cron/activity-reminders` — diário 23:00 UTC
   - `/api/cron/custody-change` — diário 10:00 UTC
   - `/api/cron/retention` — diário 14:00 UTC
   - `/api/cron/trial-expiry` — diário 03:00 UTC ← **Fase 1**
   - `/api/cron/trial-reminder` — diário 17:00 UTC ← **Fase 1**

### 9.2. Testar manualmente

No terminal local ou Vercel CLI:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://kindar.com.br/api/cron/trial-expiry
# Espera: {"ok":true,"expired":0,"timestamp":"..."}

curl -H "Authorization: Bearer $CRON_SECRET" https://kindar.com.br/api/cron/trial-reminder
# Espera: {"ok":true,"emailsSent":0,"pushesSent":0,"timestamp":"..."}
```

(Com zero trials vencidos é normal retornar 0/0.)

---

## 10. Validação end-to-end

Cenários que você deve rodar manualmente ao menos uma vez antes de liberar para usuários reais:

### 10.1. Trial de 7 dias (sem cartão)
1. Crie uma conta nova em `/signup`
2. Crie o primeiro grupo → deve receber trial de 7 dias automático
3. Confirme em `/assinatura`: badge "Premium Jurídico ativo por 7 dias"
4. Verifique acesso a IA (`/chat`) e OCR (`/saude/receita`) — deve funcionar
5. No Supabase SQL Editor, force o trial como expirado:
   ```sql
   UPDATE subscriptions SET trial_end = now() - interval '1 day'
   WHERE user_id = '<seu user id>' AND payment_provider = 'trial';
   ```
6. Rode o cron manualmente (§9.2): `/api/cron/trial-expiry`
7. Refresh no app → trial deve aparecer como expirado, acesso a IA cai

### 10.2. Early Bird + counter
1. No navegador anônimo, abra `/` (landing) — deve mostrar badge "Restam 1000/1000 vagas Early Bird"
2. Crie conta + grupo + assine `harmonia_earlybird_monthly` via Stripe (use cartão de teste `4242 4242 4242 4242`)
3. Depois do checkout, recarregue a landing — counter deve cair para 999/1000

### 10.3. Split automático (Fase 2)
1. Como Pai A, assine `harmonia_monthly`
2. Convide o Pai B via `/convite/enviar` e aceite o convite com outra conta (role=parent)
3. Em `/assinatura`, escolha Pai B no seletor de co-responsável e clique "Ativar divisão"
4. Pai B deve receber notificação push + mensagem no chat do grupo
5. Em `/despesas`, deve existir 1 despesa categoria "Assinatura Kindar" R$24,90 split 50/50
6. Simule renovação Stripe (dashboard > Events > Send test `invoice.payment_succeeded` com `billing_reason=subscription_cycle`) — nova despesa do mês seguinte deve aparecer automaticamente

### 10.4. PIX (Fase 3, após §5)
1. Em `/assinatura`, ative o toggle PIX (só aparece se `NEXT_PUBLIC_PIX_ENABLED=true`)
2. Preço mostrado deve cair de R$24,90 → R$19,90 (com strike-through no original)
3. Clique "Assinar Harmonia" → checkout Stripe deve abrir com PIX (QR code) e cupom aplicado (`R$ -5,00 off`)
4. Complete o checkout (use QR code teste do Stripe)
5. Após sucesso, `/assinatura` deve mostrar "Economizando R$5/mês via PIX"

### 10.5. Sincronia cross-platform
1. Assine no PWA (navegador web)
2. Abra o app iOS Native (TestFlight) → faça login com mesmo usuário
3. `/assinatura` no iOS deve mostrar o mesmo plano (consumindo `/api/billing/status`)
4. Feature premium (IA, OCR) deve funcionar imediatamente em ambos

---

## 11. Monitoramento + PostHog

Eventos que o código emite automaticamente (verifique em PostHog > Events):

| Evento | Quando dispara |
|--------|----------------|
| `group_created` | Usuario cria primeiro grupo |
| `trial_started` | Junto com group_created, se elegível |
| `trial_expired` | Cron marca expirado |
| `trial_reminder_email_sent` | Cron D-5 |
| `trial_reminder_push_sent` | Cron D-6 |
| `quest_step_completed` | Cada um dos 5 passos completados |
| `quest_all_completed` | 5/5 completados |
| `subscription_started` | checkout.session.completed |
| `subscription_split_enabled` | Payer ativa split |
| `subscription_split_disabled` | Payer desativa split |

Dashboards recomendados para criar em PostHog:
- **Funil de conversão**: `group_created` → `quest_step_completed` (3+) → `subscription_started`
- **Churn de trial**: `trial_started` → `trial_expired` (sem subscription_started entre os dois)
- **Adoção PIX**: contagem de `subscription_started` com `payment_method_hint=pix` vs `card`
- **Saúde Early Bird**: consulta SQL no Supabase
  ```sql
  SELECT slots_remaining FROM v_early_bird_slots_remaining
  WHERE plan_id = 'harmonia_earlybird_monthly';
  ```

---

## 12. Troubleshooting

### "Plano XXX não tem stripe_price_id configurado" ao clicar em Assinar
→ Você pulou §3.2. Rode os UPDATEs da tabela `plans`.

### Trial não aparece para novos usuários
→ Verifique logs do servidor em `createGroup`. A função `grantTrialIfEligible` retorna `{granted: false, reason: 'user_had_prior_subscription'}` se o user já tinha qualquer sub. Em dev, limpe:
```sql
DELETE FROM subscriptions WHERE user_id = '<user id>';
```
e crie o grupo de novo.

### Early Bird não decrementa
→ A view `v_early_bird_slots_remaining` conta `status IN ('active','trialing','past_due')`. Subs com status `expired/canceled` não contam. Se você testou e cancelou, o slot volta — isso é intencional (não "queimamos" slots em dropouts).

### Cron trial-expiry retorna 401
→ `CRON_SECRET` não está setado no Vercel ou o Authorization header está sem `Bearer `. Verifique §2.

### Stripe webhook invoice.payment_succeeded não cria split expense
→ Verifique:
1. Subscription tem `auto_split = true` e `auto_split_co_user_id` + `auto_split_co_share` preenchidos
2. `billing_reason` no invoice é `subscription_cycle` (não `subscription_create` — a primeira cobrança não dispara split porque a action já criou a despesa inicial)
3. Unique index `(source_subscription_id, source_period_start)` não está bloqueando duplicata

### PIX não aparece no checkout
→ `NEXT_PUBLIC_PIX_ENABLED=true` foi setado? Redeploy rodou? Stripe PIX Automático foi liberado na conta (§5.1)?

### Apple IAP "produto não encontrado"
→ Product ID no RevenueCat ≠ Product ID no App Store Connect. Compare letra por letra. E aguarde 2-6h após criar o produto na Apple — eles demoram para sincronizar com o sandbox.

---

## 13. Fase 4 — Nativo iOS/Android (implementado em código)

Tudo o que está abaixo precisa ser configurado **manualmente** em Stripe, App Store, Google Play e RevenueCat antes do nativo funcionar em produção.

### 13.1. Env vars adicionais (Vercel + EAS)

Vercel (PWA / backend):
```bash
REVENUECAT_WEBHOOK_SECRET=<string aleatoria 32+ chars>
```

EAS (`kindar-native/eas.json` ou Expo dashboard):
```bash
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_...
EXPO_PUBLIC_WEB_URL=https://kindar.com.br
```

Obtenha as API keys em RevenueCat Dashboard > Project settings > API keys.

### 13.2. Configurar RevenueCat

**Pré-requisito**: §6 (App Store Connect IAP) e §7 (Google Play IAP) já executados, com produtos ativos.

1. **Criar projeto** em https://app.revenuecat.com > **+ New project** → "Kindar"
2. **Apps** > **+ Add app**:
   - iOS: Bundle ID `com.kindar.app`
   - Android: Package name `com.kindar.app` + service account JSON
3. **App Store Connect Shared Secret**:
   - Em ASC > Users & Access > Integrations > In-App Purchase Keys, gere a shared secret
   - Cole em RevenueCat > Project settings > Apple App Store integration
4. **Entitlements > + New**:
   - `premium` — "Acesso às features pagas"
5. **Products** (deve aparecer automaticamente após passo 2):
   - Verifique que os 12 produtos (6 Apple + 6 Android) foram importados
6. **Offerings > + New > Default**:
   - Adicione os 6 packages mapeando Apple + Google do mesmo plano
   - Nomes sugeridos: `monthly_earlybird`, `annual_earlybird`, `monthly_harmonia`, `annual_harmonia`, `monthly_juridico`, `annual_juridico`
7. **Entitlement attach**: em cada produto, marque `premium` como entitlement

### 13.3. RevenueCat webhook

1. Dashboard RevenueCat > **Integrations > + Add integration > Webhook**
2. **URL**: `https://kindar.com.br/api/revenuecat/webhook`
3. **Authorization header**: `Bearer <valor de REVENUECAT_WEBHOOK_SECRET>` (mesmo valor da env var em §13.1)
4. **Events**: marque todos — `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `UNCANCELLATION`
5. **Sandbox** e **Production**: habilite ambos

**Testar**: em RevenueCat > seu projeto > Customers > selecione um tester > "Send test event". Confira nos logs do Vercel (`/api/revenuecat/webhook`) que chegou 200.

### 13.4. Bundle + submit do app nativo

1. **Incrementar versão** em `kindar-native/app.json` (versão + build number)
2. **EAS build iOS**:
   ```bash
   cd kindar-native
   eas build --platform ios --profile production --non-interactive --wait
   eas submit --platform ios --profile production --latest
   ```
3. **EAS build Android**:
   ```bash
   eas build --platform android --profile production --non-interactive --wait
   eas submit --platform android --profile production --latest
   ```
4. **Review Apple**: submeta o build com a nova tela `/assinatura` + os 6 IAPs para review simultâneo. Tempo típico: 24-48h.
5. **Review Google**: análise em review curta (~4h em média para updates).

### 13.5. Validação end-to-end (nativo)

1. Instale a build de produção em um device real (não simulator — IAP não funciona em simulador).
2. Logue com uma conta de teste (App Store sandbox tester para iOS; closed testing track para Android).
3. Abra a tela `/assinatura` via navegação do app:
   - Deve listar os 6 packages vindos do RevenueCat offering `default`
   - Counter Early Bird deve aparecer ao vivo
   - Banner de trial (se conta tem trial ativo)
4. Toque em **Garantir Early Bird** → StoreKit sheet abre → use cartão sandbox → deve:
   - Fechar sheet
   - Mostrar alerta "Seu plano Harmonia — Early Bird está ativo"
   - Refresh automático da tela mostra `Plano atual: Harmonia`
5. Abra o PWA (`https://kindar.com.br/dashboard`) com o MESMO user:
   - Features premium devem funcionar (IA, OCR, saúde completa)
   - `/assinatura` deve mostrar o plano Harmonia ativo
6. **Restore**:
   - Desinstale o app
   - Reinstale e logue
   - Toque em **Restaurar compra** → deve detectar a sub Apple/Google e reativar sem cobrar
7. **Cancel**: abra Ajustes > Apple ID > Assinaturas > Kindar > Cancelar. O webhook `CANCELLATION` dispara; `cancel_at_period_end=true` na tabela. No período final, `EXPIRATION` dispara e status vira `canceled`.

### 13.6. Email de boas-vindas

Implementado. Template: `src/lib/emails/subscription-welcome.ts`.
Disparo: Stripe webhook `checkout.session.completed` + RevenueCat `INITIAL_PURCHASE`.

**Nada manual a configurar além do Resend** já existente (`RESEND_API_KEY`). Teste rodando o fluxo de compra end-to-end.

### 13.7. Stripe Customer Portal (PWA)

O endpoint `/api/stripe/portal` já existia. A Fase 4 adiciona um link visível em `/assinatura` ("Gerenciar cartão · cancelar · ver notas fiscais").

**Setup manual Stripe** (uma vez):
1. Dashboard Stripe > **Settings > Billing > Customer portal**
2. **Enable**
3. Marque as features:
   - Cancel subscriptions
   - Update payment method
   - View billing history
4. Branding: suba o logo Kindar + cores (`#C07055` primária)
5. Save

---

## 14. Fase 5 — Admin, cupons e lembrete de renovação (implementado em código)

### 14.1. Env var para admin (Vercel)

```bash
ADMIN_EMAILS=henrique@kindar.com.br,socio@kindar.com.br
```

Lista separada por vírgulas. Sem nenhum email configurado, `/admin/*` fica inacessível (fail-safe).

### 14.2. Acesso ao painel

- URL: `https://kindar.com.br/admin`
- Só emails listados em `ADMIN_EMAILS` conseguem entrar; outros são redirecionados para `/dashboard` sem mensagem de erro (não revela que a rota existe).
- Seções:
  - `/admin/metrics` — MRR, conversão trial→pago, Early Bird counter, adoção PIX, churn 30d, quest completion
  - `/admin/coupons` — criar/desativar cupons (sincroniza com Stripe via API)

### 14.3. Cupons — fluxo automático

**O que o admin faz**:
1. Entra em `/admin/coupons`
2. Preenche: código, tipo (% ou R$), duração (1ª cobrança / X meses / para sempre), limites
3. Clica "Criar"

**O que o código faz sozinho**:
1. Chama `stripe.coupons.create()` com a matemática do desconto
2. Chama `stripe.promotionCodes.create()` com o código user-facing
3. Salva em `coupons` (DB) com ambos IDs Stripe

**O que o usuário vê**: input "Código promocional" em `/assinatura`, valida ao aplicar, checkout carrega com o preço descontado.

**Tracking**: webhook grava `coupon_code` em `subscriptions` + incrementa `current_redemptions`. Visível em `/admin/coupons`.

Nenhum setup manual no Stripe — tudo via painel interno.

### 14.4. Cron de renovação (D-3)

- Path: `/api/cron/renewal-reminder`
- Horário: 12:00 UTC (09:00 BRT) diário
- Envia email + push 3 dias antes de `current_period_end`
- Só Stripe (card/PIX) — Apple/Google têm seus próprios avisos nativos
- Pula subs com `cancel_at_period_end=true` (usuário já cancelou, não atormenta)

Nenhum setup manual — já registrado em `vercel.json`.

### 14.5. Dashboard de métricas

Abre em `/admin/metrics`. Sem setup — lê direto do Supabase via `getAdminMetrics()`.

**KPIs no topo**:
- MRR + assinantes ativos
- Early Bird (vagas ocupadas / total)
- Conversão trial → pago (30d)
- Crescimento líquido (novos - churn)

**Breakdowns**:
- Por tier (Harmonia vs Premium Jurídico)
- Por plan_id (Early Bird vs regular)
- Método de pagamento (card, PIX, Apple, Google)
- Distribuição de quest completion (0 / 1-2 / 3-4 / 5 passos)
- Split automático (enabled / eligible)
- Cupons (ativos + resgates totais)

### 14.6. Validação

1. Logue com email listado em `ADMIN_EMAILS` → `/admin` deve abrir
2. Crie um cupom de teste (ex: `TESTE10` 10% off, 1ª cobrança)
3. Em outra janela (usuário não-admin), abra `/assinatura`
4. Digite `TESTE10` no campo → deve aparecer `✓ TESTE10 · 10% off`
5. Clique em Assinar → Stripe checkout mostra R$22,41 (10% off de R$24,90)
6. Volte em `/admin/coupons` → `current_redemptions` do TESTE10 agora é 1

---

## 15. Próximas fases (ainda não implementadas)

| Item | O que falta |
|------|-------------|
| **Downgrade com prorate** | Se usuário faz downgrade de Premium Jurídico → Harmonia, creditar o diff proporcional. Hoje o plano novo só vigora na próxima renovação |
| **Revenue Sharing com parceiros** | Rastreio via referral code → split da receita com pediatra/advogado parceiro que indicou |
| **Cohort analysis** | Dashboard admin mostrando retenção por mês de signup (usuários que assinaram em março ainda estão ativos em junho?) |
| **A/B test de preço** | Mostrar R$19,90 ou R$24,90 para metade dos usuários e medir conversão diferencial |

---

*Criado em Abril/2026 após Fases 1-3 implementadas. Atualizado em Abril/2026 com Fase 4 (nativo iOS/Android). Atualize este arquivo sempre que adicionar configuração manual nova.*

---

## ESTADO REAL CONFIGURADO 2026-04-29

Setup feito autonomamente via API (Apple ASC + RevenueCat V2 + Stripe + Vercel CLI). Os valores abaixo são os reais em produção, capturados durante a configuração.

### Apple App Store Connect
- **App ID:** 6762701916 (`com.kindar.app`)
- **Subscription Group:** `Kindar Premium` (id `22043850`)
- **6 IAPs criados** (`MISSING_METADATA` aguardando preenchimento manual no painel):
  - `com.kindar.harmonia.monthly` (id `6764693892`) — Harmonia Mensal
  - `com.kindar.harmonia.annual` (id `6764693944`) — Harmonia Anual
  - `com.kindar.harmonia.earlybird.monthly` (id `6764693945`) — Harmonia Mensal Early Bird
  - `com.kindar.harmonia.earlybird.annual` (id `6764693916`) — Harmonia Anual Early Bird
  - `com.kindar.juridico.monthly` (id `6764694011`) — Premium Juridico Mensal
  - `com.kindar.juridico.annual` (id `6764693946`) — Premium Juridico Anual
- **App-Specific Shared Secret:** gerado em ASC → App Information → cola no RC + Vercel.
- **In-App Purchase Key (.p8):** 3HX2NW8698 — uploaded no RC.
- **App Store Connect API Key (.p8):** 736GBBC4YY (mesmo issuer `52e31db4-ca31-4a2c-b99d-86b8b599b29e`) — usado tanto pelo CI (`kindar-asc.mjs`) quanto pelo RevenueCat.
- **Pricing Schedule:** Free (tier 0) em todos os países, base USA. Configurado via `POST /v1/appPriceSchedules` com placeholder `${price1}` (formato novo Apple 2026).

### RevenueCat
- **Project:** `projf45716c3` (Kindar)
- **iOS App:** `appa941929a86` (type=`app_store`, bundle=`com.kindar.app`)
- **Android App:** `app4904159955` (type=`play_store`, package=`com.kindar.app`)
- **Entitlement:** `entl3727af8851` (lookup_key `Kindar Pro`) — vinculado aos 6 products iOS
- **Offering:** `ofrng956af1b391` (lookup_key `default`, is_current=true) com 2 packages: `$rc_monthly` + `$rc_annual`
- **Webhook:** `whintgrc84a974a74` → `https://kindar.com.br/api/revenuecat/webhook`
- **Apple Server Notification URL:** copiada do RC e colada em ASC → App Information → Notificações do servidor (produção + sandbox)

### Stripe
- **Account:** `acct_1TIgIBPn762kMKC9` (kindar, BRL)
- **Webhook:** `we_1TRgfgPn762kMKC9z6Liz65F` → `https://kindar.com.br/api/stripe/webhook`
- **6 products + prices** (lookup_key = `plan_id` do código):

| Product | Price ID | Lookup Key | Valor BRL |
|---|---|---|---|
| Harmonia Mensal | `price_1TRgfNPn762kMKC9YhOEWtA0` | `harmonia_monthly` | R$ 19,90/mês |
| Harmonia Anual | `price_1TRgfPPn762kMKC9bJ3W0XLj` | `harmonia_annual` | R$ 199,90/ano |
| Harmonia EB Mensal | `price_1TRgfRPn762kMKC9qNOODcCJ` | `harmonia_earlybird_monthly` | R$ 14,90/mês |
| Harmonia EB Anual | `price_1TRgfTPn762kMKC93nYLZkkt` | `harmonia_earlybird_annual` | R$ 149,90/ano |
| Juridico Mensal | `price_1TRgfVPn762kMKC9GfNJ3Giw` | `premium_juridico_monthly` | R$ 39,90/mês |
| Juridico Anual | `price_1TRgfYPn762kMKC99QamCn6R` | `premium_juridico_annual` | R$ 399,90/ano |

Para criar checkout session no código, use o `lookup_key` (sobrevive a mudanças de price_id):

```ts
const session = await stripe.checkout.sessions.create({
  line_items: [{ price: undefined, quantity: 1 }],
  // ...
  // OU lookup
  lookup_keys: ['harmonia_monthly'],
});
```

### Vercel env vars (production)

```bash
# Valores reais NÃO são commitados — capturados em vercel env ls production.
# Estão setados em produção. Os tipos:

STRIPE_SECRET_KEY=<sk_live_*>            # Stripe API restricted/secret (kindar live mode)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_live_*>  # Stripe public key (client-safe)
STRIPE_WEBHOOK_SECRET=<whsec_*>          # validar signature do webhook em /api/stripe/webhook
APPLE_SHARED_SECRET=<32-char hex>        # ASC App Information → Shared Secret. Validar receipts StoreKit 1.
GOOGLE_OAUTH_IOS_CLIENT_ID=<num-id>.apps.googleusercontent.com  # iOS OAuth (Google Cloud Console)
APNS_BUNDLE_ID=com.kindar.app            # bundle id, não-secret
```

Setado via `vercel env add NAME production` (CLI). Cada `vercel deploy --prod` ou push no main pega automaticamente. **Nunca commite os valores reais** — GitHub Push Protection bloqueia.

### Login social Google nativo iOS — config

`kindar-native/app.json` → `ios.infoPlist.CFBundleURLTypes` tem o reversed Google OAuth Client ID:

```json
"CFBundleURLTypes": [
  {
    "CFBundleURLSchemes": [
      "com.googleusercontent.apps.<reversed-ios-oauth-client-id>"
    ]
  }
]
```

Sem isso, `expo-auth-session` não consegue retornar pro app após o user logar com Google. Precisa rebuild binário (não OTA).

---

*Atualizado em 2026-04-29 às 23:00 BRT após sessão de configuração total via API: Apple IAPs, RevenueCat, Stripe, Vercel envs, login social GripFlow-style.*

---

## DEEP API SETUP 2026-04-29 (sessão 2)

Depois de testes exaustivos descobri o que mais é automatizável via Apple ASC API.
Os scripts ficam em `scripts/asc-*.mjs` e são idempotentes (re-rodáveis).

### O que ficou 100% via API (zero painel)

1. **Apple Server-to-Server Notification URL** (`PATCH /apps/{id}`)
   ```
   subscriptionStatusUrl              = https://api.revenuecat.com/v1/incoming/apple_server_to_server_notification (V2)
   subscriptionStatusUrlForSandbox    = mesma URL (V2)
   ```
   Esse era o item "ASC → App Information → Notificações do servidor" que eu pensei que era manual.
   Script: `scripts/asc-autonomous-setup.mjs`

2. **`usesIdfa = false` em appStoreVersion** (`PATCH /appStoreVersions/{id}`)
   Evita o questionário "Does your app use the IDFA?" no painel para cada nova versão.
   Apenas estados editáveis: `PREPARE_FOR_SUBMISSION`, `METADATA_REJECTED`, `DEVELOPER_REJECTED`.

3. **Subscription Review Screenshots** (asset upload via S3)
   Fluxo: `POST /subscriptionAppStoreReviewScreenshots` → `PUT` no URL S3 retornado → `PATCH commit` com checksum MD5.
   PNG **DEVE** ter dimensão de iPhone (1290×2796 ou similar) — Apple rejeita 1024×1024 com `IMAGE_INCORRECT_DIMENSIONS`.
   Os 6 IAPs receberam screenshot placeholder — pode trocar pela tela real do paywall depois.

4. **Subscription Localizations pt-BR + en-US** (`POST /subscriptionLocalizations`)
   Apple exige `name` ≤ 30 chars, `description` ≤ 45 chars (HARD limits, retornam `ATTRIBUTE.INVALID.TOO_LONG` se exceder).
   Como o subscription group tem pt-BR + en-US, cada IAP precisa das duas localizações pra avançar.

5. **Subscription Availability** (`POST /subscriptionAvailabilities`)
   PRECISA vir ANTES de `subscriptionPrices` — sem availability, prices retorna `ENTITY_ERROR.RELATIONSHIP.INVALID` com pointer enganoso pra `subscriptionPricePoint/id`.
   Era a peça que faltava pra autonomização total de pricing.

6. **Subscription Prices em BRA** (`POST /subscriptionPrices`)
   Shape mínimo: só subscription + subscriptionPricePoint. Territory vai embedado no pricePoint id (base64 JSON `{s, t, p}`).
   Apple aceita re-POST do mesmo subscription pra "atualizar" o price (substitui in-place).

### O que tentei mas Apple bloqueou via API

| Item | Endpoint tentado | Erro | Workaround |
|---|---|---|---|
| App Privacy questionário | `/v1/appDataUsages` | 404 PATH_ERROR (endpoint removido) | Manual: ASC → Distribuição → Privacidade |
| DSA / Trader Status | `/marketplaceWebhookConfiguration`, `/eulas` | 404 — relationship não existe | Manual: ASC → Distribuição → Trader Status |
| Encryption declaration full | `/appEncryptionDeclarations` | 404 | `usesIdfa=false` cobre IDFA; ITSAppUsesNonExemptEncryption já no Info.plist |
| Equalização de pricing pra todos territórios | painel ASC web "Equalize" | sem endpoint API (só POST 1 por 1) | Script `scripts/asc-iap-equalize.mjs` itera 175+ territórios |
| `subscriptionAvailabilities` UPDATE | `PATCH /subscriptionAvailabilities/{id}` | 403 (só CREATE, GET, GET_INSTANCES) | Tem que CREATE de novo (mas Apple não deixa criar duas) — efetivamente imutável |

### Comando para rodar setup autônomo Apple (idempotente)

```bash
cd DEV
node scripts/asc-iap-metadata.mjs       # localizations + availability + price BRA pra 6 IAPs
node scripts/asc-iap-equalize.mjs       # propaga pricing pra todos os ~175 territórios
node scripts/asc-autonomous-setup.mjs   # S2S URL + usesIdfa + review screenshots
```

Os 3 scripts são idempotentes e detectam state existente — re-rodar é seguro.

### Limites finais — só resta 1 item manual

Depois desse setup, o ÚNICO bloqueante manual no ASC é:

1. **App Privacy** (Distribuição → Privacidade do App): preencher questionário de coleta de dados

   Apple removeu o endpoint público `/v1/appDataUsages` e isso não é mais automatizável.
   O script `asc-recovery.mjs` lista as 12 categorias a marcar (15 minutos no painel web).

DSA (Trader Status) só fica obrigatório quando você quer disponibilizar pra UE — pra TestFlight não bloqueia.
A submissão de IAPs via `subscriptionSubmissions` retorna `FIRST_SUBSCRIPTION_MUST_BE_SUBMITTED_ON_VERSION` — então a primeira vez precisa ser feita junto com a app version (Apple anexa automaticamente). Depois disso, IAPs futuros podem ser submetidos isoladamente via API.

### Scripts autônomos disponíveis

| Script | O que faz |
|---|---|
| `asc-recovery.mjs` | Setup inicial: privacidade (lista), pricing app, beta loc, attach build, submit Beta Review |
| `asc-iap-metadata.mjs` | IAPs: localizações pt-BR + en-US, availability BRA, price base BRA |
| `asc-iap-equalize.mjs` | Equaliza pricing dos 6 IAPs em todos os 175 territórios (sequencial, c/ retry 429) |
| `asc-autonomous-setup.mjs` | App: S2S URL, usesIdfa, screenshots dos 6 IAPs |
| `asc-app-screenshots.mjs` | App version: cria appScreenshotSets + uploads iPhone 6.5" PNG por locale |
| `asc-iap-submit.mjs` | Tenta `subscriptionSubmissions` para os 6 IAPs (precisa app version submetida primeiro) |
| `asc-deep-probe.mjs` | Probe de descoberta — testa endpoints "in dúvida" e reporta status |
| `asc-diagnose-testers.mjs` | Diagnóstico: por que tester X não recebe build Y |

Todos idempotentes — re-rodar é seguro.
