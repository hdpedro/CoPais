# Kindar — Estratégia de Monetização

> Documento alinhado com a implementação da Fase 1 (Abril/2026).
> Substitui a versão anterior de Março/2026 (que trabalhava com Premium R$29,90 / Elite R$49,90).

---

## ⚡ ATUALIZAÇÃO jun/2026 — Plano único + trial 30d com bloqueio

A estratégia abaixo (4 planos, trial 7d, freemium permanente) foi **simplificada**.
Modelo vigente para **novos cadastros** (coorte `coparenting_groups.paywall_enforced=true`,
migration `00105`):

- **Plano único visível: Harmonia.** Early Bird e Premium Jurídico ficam **ocultos** pra
  novos compradores (linhas `is_active=false` em `plans`, migration `00106`). Assinantes
  atuais desses planos seguem **grandfathered** (continuam renovando; produtos seguem nas lojas).
- **Preço Harmonia: R$19,90/mês** (já vigente desde `00060`) **+ anual R$226,80 (5% off)**
  — o anual subiu de R$199,90 → R$226,80 (menos desconto, a pedido).
- **Trial: 30 dias com o APP INTEIRO liberado**, sem cartão (`trial.ts` concede o tier
  topo `premium_juridico` = todas as features — "show the ceiling"; depois converte pra Harmonia).
- **Fim do trial = BLOQUEIO TOTAL** do app até assinar (`src/lib/billing/access.ts:getGroupAccessState`
  → `locked`; gate no PWA `(app)/layout.tsx` via `PaywallScreen` e no Native `BillingGate`).
  Fonte de verdade: `/api/billing/status` agora retorna `locked`/`paywallEnforced`.
- **Coorte antiga** (`paywall_enforced=false`): inalterada — freemium + gating por-feature de hoje.

**Promo "2 meses grátis" (60 dias) retirado pra novos cadastros**: flag
`PROMO_2M_FREE`/`NEXT_PUBLIC_PROMO_2M_FREE` → `false`. **Quem já está nos 60 dias mantém**
(o `trial_end` já está gravado por assinatura; nada encurta). Com o flag off, novos trials
são 30 dias, o banner some e o trial do Stripe cai pra 30d.

**Passos manuais de loja/config** (ver `MANUAL_OPERACIONAL.md`): **Vercel: `PROMO_2M_FREE` e
`NEXT_PUBLIC_PROMO_2M_FREE` = `false`**; Stripe novo Price anual R$226,80; Apple/Google subir
o preço anual (consentimento de aumento) — mensal já está R$19,90; RevenueCat Offering só com
Harmonia. O mensal NÃO precisa de mudança de preço nas lojas.

As seções abaixo são **históricas** (modelo de 4 planos / trial 7d).

---

## 1. POSICIONAMENTO

**Kindar atende pais separados (ICP principal) e estende para o universo familiar**.

- Slogan: "Organize a rotina de quem você cuida"
- ICP que paga: pais separados / divorciados (guarda compartilhada). É a feature pela qual baixam o app.
- Flag `custody_enabled` (em `coparenting_groups`) controla a UI de guarda — **default `true`** (revertido em 2026-05-05 após bug crítico de ativação iOS, ver MEMORY abaixo).
- Modo "universal" continua disponível: famílias nucleares, monoparentais, avós, cuidadores podem dispensar o card de configurar escala — não precisam mexer flag.
- Atende: famílias nucleares, separadas, homoafetivas, monoparentais, avós guardiões, cuidadores profissionais — mas guarda é o ímã principal.

> **2026-05-05 — Reposicionamento revertido em parte**: o "Progressive Disclosure" original (default `false`) escondia a feature core do ICP que paga. 2 usuários iOS reclamaram; backfill flipou 6 grupos para `true`. Lição: posicionamento universal é copy de marketing, não default técnico.

---

## 2. PRINCÍPIO DE COBRANÇA

**Uma assinatura por grupo familiar** — não por usuário, não por assento.

| Quem paga | Quem não paga |
|-----------|----------------|
| Responsáveis legais (`profiles.role = 'parent'`) | Avós (`grandparent`) |
|  | Cuidadores (`caregiver`) |
|  | Mediadores (`mediator`) |
|  | Advogados (`lawyer`) |

Enforcement server-side em `src/lib/billing/payer.ts` (`canStartSubscription`) + `/api/billing/status`.

---

## 3. PLANOS

| Plano | Preço | Quem pode pagar | Limites | Plan ID |
|-------|-------|-----------------|---------|---------|
| **Grátis** | R$ 0 | Qualquer | 1 criança, 30d histórico | `free` |
| **Harmonia — Early Bird** 🎯 | **R$ 19,90/mês** para sempre | Só `parent` | Ilimitado, todas features de Harmonia | `harmonia_earlybird_monthly` |
| **Harmonia** | R$ 24,90/mês | Só `parent` | Ilimitado, IA, OCR, saúde completa | `harmonia_monthly` |
| **Premium Jurídico** | R$ 39,90/mês | Só `parent` | Tudo de Harmonia + export legal, audit trail | `premium_juridico_monthly` |

Anuais com 20% off: R$191 Early Bird · R$239 Harmonia · R$383 Premium Jurídico.

**Early Bird**: capado em 1.000 assinaturas (enforcement via trigger Postgres em `00056_early_bird_counter.sql`). Advisory lock garante que não há oversell cross-platform.

**Convidados ilimitados em todos os planos** (inclusive Grátis): avós, cuidadores, mediadores, advogados entram via `invitations` table e sempre têm acesso no plano do grupo.

---

## 4. DEGUSTAÇÃO DE 7 DIAS — "Show the ceiling"

Todo novo grupo ganha **7 dias de Premium Jurídico** automaticamente, sem cartão.

- Infra: coluna `subscriptions.trial_end` (migration 00039) + `payment_provider='trial'`
- Cria: `src/lib/billing/trial.ts` (`grantTrialIfEligible`) no `createGroup`
- Expiração: cron diário `/api/cron/trial-expiry` às 03:00 UTC
- Reminders: cron `/api/cron/trial-reminder` às 17:00 UTC — email dia 5, push dia 6

Uma trial por usuário, **para sempre** (não se repete em novos grupos).

### Onboarding Quest — 5 passos durante a degustação

Widget no dashboard correlaciona "tocou nas features premium" com conversão:

1. `add_child` — adicionar criança
2. `setup_calendar` — criar escala ou ativar sem escala
3. `invite_co` — convidar co-responsável
4. `ocr_prescription` — ler receita médica com IA
5. `ai_agreement` — usar IA assistente

Tabela `onboarding_quests` (migration 00057). Tracked via `src/actions/onboarding-quest.ts`.

---

## 5. SINCRONIA MULTI-PLATAFORMA

As 3 plataformas compartilham o mesmo backend Supabase. Lógica de billing é **server-side authoritative**.

| Plataforma | Provider | Coluna primária | Webhook |
|------------|----------|-----------------|---------|
| PWA (Next.js) | Stripe + PIX | `stripe_subscription_id` | `/api/stripe/webhook` |
| iOS Nativo | Apple IAP via RevenueCat | `apple_original_transaction_id` | RevenueCat webhook (a implementar) |
| Android Nativo | Google Play via RevenueCat | `google_purchase_token` | RevenueCat webhook (a implementar) |

Fonte única de verdade: `GET /api/billing/status?groupId=X` — clients (PWA / iOS / Android) consultam antes de mostrar features premium.

View `v_group_active_subscription` resolve "qual sub está ativa para este grupo" priorizando `active > trialing > past_due`.

---

## 6. SPLIT AUTOMÁTICO (mata a briga de "quem paga") — **Fase 2: implementado**

Quando o primeiro responsável assina, aparece um botão **"Dividir custo com co-responsável"** na página `/assinatura` que usa o módulo de Despesas existente:

- **Migração 00058** adiciona `auto_split`, `auto_split_co_user_id`, `auto_split_co_share` em `subscriptions`, + valor `subscription` no enum `expense_category`, + idempotência via `source_subscription_id` + `source_period_start` em `expenses`
- **Server actions**: `enableSubscriptionSplit` e `disableSubscriptionSplit` em `src/actions/subscription-split.ts` — só o payer pode ativar
- **Renovação automática**: Stripe webhook `invoice.payment_succeeded` com `billing_reason='subscription_cycle'` cria nova despesa split a cada renovação (idempotente)
- **Biblioteca**: `src/lib/billing/split.ts` expõe `createSplitExpenseForPeriod`, `computeCoShareAmount`, `buildSplitRatio` — compartilhado entre action e webhook
- **UI**: seletor de co-responsável + slider de percentual (10-90) + desativar inline
- **Notificação**: push + chat system message ao co-responsável ("X está dividindo o Kindar com você — R$12,45/mês")
- **Dashboard financeiro**: categoria `subscription` com label "Assinatura Kindar 💛" aparece automática em `EXPENSE_CATEGORIES`

Validação: Vitest cobre `getPlanAmountBrl`, `computeCoShareAmount`, `buildSplitRatio`.

---

## 6.5. PIX + OTIMIZAÇÃO DE MARGEM — **Fase 3: implementado**

**Estratégia**: incentivar pagamento via PIX (taxa ~1-2%) vs cartão (~4%) ou IAP (~15%). Preservar card/IAP como opção para quem prefere comodidade.

- **Migração 00059** adiciona `payment_method_hint` em `subscriptions` (`card | pix | apple_iap | google_iap | trial`) — backfill automático a partir de `payment_provider`
- **Biblioteca**: `src/lib/billing/pix.ts` expõe `getPixPrice(planId)` (preço com e sem desconto de R$5) e `isPixSubscriptionEnabled()` (flag `NEXT_PUBLIC_PIX_ENABLED`)
- **Stripe checkout** (`src/app/api/stripe/checkout/route.ts`):
  - Aceita `paymentMethod: 'card' | 'pix' | 'auto'` no payload
  - Para `pix`: `payment_method_types: ['pix']` + aplica cupom `STRIPE_PIX_COUPON_ID` (provisionado manualmente na Stripe)
  - Para `auto`: mostra ambos, cliente decide
  - Resolve `stripe_price_id` via tabela `plans` (server-side, não confia em client)
- **Webhook** registra `payment_method_hint` vindo do metadata do checkout
- **UI `/assinatura`**: toggle PIX vs Cartão acima dos cards; preços com strike-through ("R$24,90 → R$19,90 via PIX, economize R$5")
- **PIX Automático (recorrência)**: depende da Stripe ter liberado para a conta. Enquanto não estiver: desconto vale para o primeiro mês, depois cobra preço cheio. Após liberação, altera `NEXT_PUBLIC_PIX_ENABLED=true` e PIX vira padrão

**Economia de margem estimada** (1.000 assinantes Harmonia):
- 100% cartão: R$24.900 brutos × ~4% = R$996 taxa → **R$23.904 líquidos**
- 40% PIX + 60% cartão: receita R$22.900 (400 × R$19,90 + 600 × R$24,90), taxa média ~3% = R$687 → **R$22.213 líquidos**

PIX reduz receita bruta em R$2k mas o efeito competitivo (mercado BR adora PIX, muitos sem cartão) deve compensar via volume. Medir via PostHog `payment_method_chosen` após 60 dias.

---

## 7. TAXAS DAS LOJAS

| Loja | Taxa base | Small Business (<US$1M/ano) |
|------|-----------|-----------------------------|
| Apple | 30% | **15%** |
| Google | 30% | **15%** |
| Stripe Brasil | ~4% | 4% |
| PIX via Stripe | ~1-2% | 1-2% |

Estratégia de margem: incentivar PIX via web (ex.: desconto de R$5). App (iOS/Android) mantém IAP via RevenueCat por conveniência.

---

## 8. CONVERSÃO ESPERADA (metas realistas)

| Métrica | Conservador | Realista | Otimista |
|---------|-------------|----------|----------|
| Trial → pago | 10% | 15% | 25% |
| Free → pago (sem trial) | 5% | 10% | 15% |
| Split ativado (grupos 2+ pais) | 30% | 40% | 60% |
| Early Bird esgotar em | 12 meses | 6 meses | 3 meses |

Hipóteses a testar pós-launch via PostHog:
- Usuários que completam ≥3 passos da onboarding quest convertem 3× mais
- Early Bird drive ≥20% a mais sign-ups vs. preço único R$24,90

---

## 9. PROJEÇÕES

### Cenário realista com 1.000 famílias pagantes

| Mix | Receita bruta/mês | Taxa média | Receita líquida/mês |
|-----|-------------------|------------|---------------------|
| 500 Early Bird + 500 Harmonia | R$ 22.400 | ~12% | **R$ 19.700** |
| 300 Early Bird + 600 Harmonia + 100 P.Jurídico | R$ 24.960 | ~12% | **R$ 21.960** |

"Custo" do desconto Early Bird: 1.000 × R$5 = R$5.000/mês "investidos" em acquisition para sempre. Compensa se Early Bird drive ≥20% de volume extra.

---

## 10. IMPLEMENTAÇÃO — arquivos críticos

### Schema
- `supabase/migrations/00054_subscriptions_per_group.sql` — coluna `coparenting_group_id`, RLS, view `v_group_active_subscription`
- `supabase/migrations/00055_plans_reprice_and_rename.sql` — novos plan IDs (Harmonia, Premium Jurídico, Early Bird)
- `supabase/migrations/00056_early_bird_counter.sql` — trigger de capacity + advisory lock + view pública
- `supabase/migrations/00057_onboarding_quest.sql` — tabela `onboarding_quests`
- `supabase/migrations/00058_subscription_split.sql` — auto_split fields + enum `subscription` + idempotência
- `supabase/migrations/00059_pix_payment_method_hint.sql` — coluna `payment_method_hint`

### Backend
- `src/lib/billing/` — tiers, group-subscription, payer, early-bird, feature-gate, trial, **split, pix** (módulo completo)
- `src/app/api/billing/status/route.ts` — fonte de verdade cross-platform
- `src/app/api/cron/trial-expiry/route.ts` — marca trials expirados
- `src/app/api/cron/trial-reminder/route.ts` — email D-5 + push D-6
- `src/app/api/stripe/webhook/route.ts` — renovações criam despesas split automaticamente + rastreia `payment_method_hint`
- `src/app/api/stripe/checkout/route.ts` — aceita `paymentMethod: card|pix|auto` + aplica cupom PIX
- `src/actions/group.ts` — `createGroup` agora concede trial automático
- `src/actions/onboarding-quest.ts` — `markQuestStep`, `getQuestProgress`
- `src/actions/subscription-split.ts` — `enableSubscriptionSplit`, `disableSubscriptionSplit`

### UI (PWA)
- `src/app/(app)/assinatura/page.tsx` + `AssinaturaClient.tsx` — página de assinatura com detecção de payer
- `src/components/billing/TrialBanner.tsx` — banner no dashboard durante trial
- `src/components/billing/OnboardingQuest.tsx` — widget quest no dashboard
- `src/components/billing/EarlyBirdBadge.tsx` — badge live counter (variants: hero, inline, pill)
- `src/app/page.tsx` — landing com counter Early Bird (revalidate 30s)
- `src/app/pricing/page.tsx` + `PricingClient.tsx` — pricing page com Early Bird highlight

### UI (Nativo) — a implementar na Fase 1.1
- `kindar-native/src/app/configuracoes/assinatura.tsx` — página com RevenueCat `purchasePackage`
- Tela "Restaurar compra" (requisito Apple)

### i18n
- `src/i18n/locales/{pt,en,es,fr,de}.json` — seções `subscription`, `trial`, `onboardingQuest`
- `kindar-native/src/i18n/locales/{pt,en,es,fr,de}.json` — mesmas chaves espelhadas (subset)

### Crons (registrados em `vercel.json`)
- `/api/cron/trial-expiry` — diário 03:00 UTC
- `/api/cron/trial-reminder` — diário 17:00 UTC

---

## 11. RESUMO EXECUTIVO

| Item | Decisão |
|------|---------|
| **Modelo** | 1 assinatura por grupo — só responsáveis legais pagam |
| **Free tier** | Permanente: 1 criança, 30d histórico, sem IA |
| **Trial** | 7 dias de Premium Jurídico automático, sem cartão |
| **Early Bird** | R$19,90 para sempre, primeiras 1.000 famílias |
| **Preço base (pós Early Bird)** | Harmonia R$24,90 / Premium Jurídico R$39,90 |
| **Mensagem central** | "Assine uma vez. Família toda acessa." |
| **Split** | 50/50 automático via módulo Despesas |
| **Meta** | 1.000 pagantes em 12-18 meses |

---

---

## 12. STATUS DE IMPLEMENTAÇÃO

| Fase | Escopo | Status |
|------|--------|--------|
| **Fase 1** | Per-group, Early Bird, Trial 7d, Onboarding Quest, UI PWA | ✅ Completa |
| **Fase 2** | Split automático via Despesas + webhook de renovação | ✅ Completa |
| **Fase 3** | PIX (checkout, desconto, UI toggle, hint tracking) | ✅ Completa |
| **Fase 4** | RevenueCat webhook + UI nativa iOS/Android + Restore + Email welcome + Portal | ✅ Completa |
| **Fase 5** | Dashboard admin de métricas + notificação de renovação + cupons customizados | ✅ Completa |

**Passos manuais pós-merge**: ver `MANUAL_OPERACIONAL.md` (Stripe config, migrations, env vars, Apple/Google product IDs, RevenueCat, PIX Automático, validação end-to-end).

---

*Documento atualizado em: Abril/2026 · alinhado com migrations 00054–00059 (Fases 1-3 completas)*
