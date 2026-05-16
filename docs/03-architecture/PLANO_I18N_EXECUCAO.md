# Plano de Execução i18n — Estado, Handoff, Próximos Passos

> **Versão:** 3.0 (2026-05-16)
> **Status:** **EM PRODUÇÃO.** Foundation + backend localizado + zero hardcoded pt no escopo canônico. ESLint custom rule promovida a `error`. Migration aplicada.
> **Companion docs:** [REGRAS_CANONICAS.md](./REGRAS_CANONICAS.md) · [MAPA_IA_KINDAR.md](../06-business/MAPA_IA_KINDAR.md)

Substitui v2.0. Reflete o estado completo após sessão executiva de 2026-05-16, **incluindo o commit que entrou no `main` e a migration aplicada em produção.**

---

## 1. Resumo executivo

### Bug raiz (resolvido + deployed)

Server Components renderizavam pt-BR fixo antes do client saber o locale. Trocar idioma no `/perfil` deixava 60% da UI em pt. **Causa:** locale em `localStorage` (invisível ao server) + strings hardcoded em ~30 server pages.

### Solução estrutural (em prod)

1. **Cookie `kindar-locale`** seteado por middleware no Edge (Accept-Language RFC 7231).
2. **`src/i18n/server.ts`** expõe `getServerT()` / `getRequestLocale()` pra Server Components, route handlers e jobs server-side.
3. **`src/lib/locale-utils.ts`** expõe `getUserLocale(userId)` / `getUsersLocale(userIds[])` pra crons, push, email.
4. **`profiles.locale`** (BCP 47 primary subtag) ativa em prod (migration `00083` + `00084` normalize).
5. **`notifyCollabCreate`** resolve push title/body por destinatário usando user.locale.
6. **3 crons de vacina** localizam push.
7. **Welcome email** localizado nos 5 idiomas via Resend.
8. **Signup persiste** `profiles.locale = <cookie>` automaticamente.

### Redes de proteção (CI + pre-commit, ativas)

- ESLint `kindar/no-pt-literal` (custom rule) com severity **`error`**. Baseline: **0 hits** no escopo canônico. Allowlist documentada cobre módulos pendentes de refator (Tier 2).
- `validate-locale-parity` — hard fail se chave drift (PWA + Native).
- `validate-char-limits` — hard fail se push/email/a11y exceder limites.
- `generate-types` — `keys.generated.ts` byte-stable (sem timestamp); CI bloqueia drift.
- Sentry hook em fallback (server + client) — chave faltando em prod = warning.
- Pseudo-localization (`NEXT_PUBLIC_PSEUDO_LOC=1`) pra QA visual em dev.

### Fase 0 (stop-the-bleeding) — ATIVA EM PROD

- `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH` default OFF.
- **Middleware FORÇA `cookie=pt`** quando flag OFF (fix do furo da v1 onde middleware ainda seguia Accept-Language, deixando UX meio-traduzido).
- `LanguageSelector` mostra banner bilíngue pt/en de manutenção.

---

## 2. Entregas técnicas detalhadas

### 2.1 Commits no `main`

| SHA | Mensagem |
|---|---|
| `8219315` | feat(i18n): production-ready foundation + zero hardcoded pt across canonical surfaces |
| `7164752` | chore(i18n): make keys.generated.ts byte-stable (remove timestamp from header) |

**Push:** `8869406..7164752  main -> main` (verde em CI: 1115/1115 testes, build limpo, lint 0 errors).

### 2.2 Migration aplicada em produção

| ID | Status | Efeito |
|---|---|---|
| `00083_users_locale` | ✅ APPLIED | `ALTER TABLE profiles ADD COLUMN locale IF NOT EXISTS` + índice parcial |
| `00084_users_locale_normalize` | ✅ APPLIED | Normalize `pt-BR` → `pt` em 74 rows; CHECK constraint `IN ('pt','en','es','fr','de')`; default `pt`; COMMENT |

Estado pós-migration (verificado via execute_sql):
- 74 usuários com `locale='pt'`
- Check constraint `profiles_locale_check` ativa
- Índice `idx_profiles_locale_non_default` ativo

### 2.3 Core i18n

| Arquivo | Tipo | Função |
|---|---|---|
| `src/i18n/server.ts` | NOVO | `getServerT()`, `getRequestLocale()`, `parseAcceptLanguage()`, Sentry hook |
| `src/i18n/index.ts` | MOD | Fallback chain pt-BR + Sentry hook client + pseudo-loc wrapper |
| `src/i18n/provider.tsx` | MOD | Cookie persist + reload no setLocale + memo fix |
| `src/i18n/pseudo.ts` | NOVO | Pseudo-localization (transliteração + 40% padding) |
| `src/i18n/keys.generated.ts` | AUTO | **2279 keys tipadas** (byte-stable) |
| `src/lib/locale-utils.ts` | NOVO | `getUserLocale`, `getUsersLocale`, `toBcp47`, `toSupportedLocale`, `INTL_LOCALE_MAP` |
| `src/lib/supabase/middleware.ts` | MOD | Cookie setting + Fase 0 force-pt quando flag OFF |
| `src/app/(app)/layout.tsx` | MOD | `initialLocale` server-resolved |
| `src/app/(auth)/layout.tsx` | NOVO/MOD | I18nProvider para auth routes + `force-dynamic` |
| `src/components/LanguageSelector.tsx` | MOD | Flag-gated com banner Fase 0 |

### 2.4 Server pages + Client components refatorados (todos com 0 hits no `kindar/no-pt-literal`)

| Página/componente | Strings antes | Status |
|---|---|---|
| `dashboard/page.tsx` | 11 + dias/meses + `"pt-BR"` | ✅ 0 |
| `perfil/page.tsx` | `toLocaleDateString` pt-BR | ✅ 0 |
| `saude/page.tsx` | 3× `"pt-BR"` formatters | ✅ 0 |
| `(auth)/login/page.tsx` | 12 strings | ✅ 0 |
| `(auth)/signup/page.tsx` | 16 strings | ✅ 0 |
| `(auth)/verify-email/page.tsx` | 7 strings | ✅ 0 |
| `(auth)/forgot-password/page.tsx` | 8 strings | ✅ 0 |
| `(auth)/reset-password/page.tsx` | 9 strings | ✅ 0 |
| `escola/EscolaClient.tsx` | 17 hits | ✅ 17 → 0 |
| `saude/emergencia/EmergencyCardClient.tsx` | 11 hits | ✅ 11 → 0 |
| `saude/vacinas/[id]/VaccineDetailClient.tsx` | 12 hits | ✅ 12 → 0 |
| `saude/receita/PrescriptionParserClient.tsx` | 10 hits | ✅ 10 → 0 |
| `perfil/deletar-conta/DeleteAccountClient.tsx` | 10 hits | ✅ 10 → 0 |
| `calendario/ferias/NewVacationForm.tsx` | 8 hits | ✅ 8 → 0 |
| `calendario/ferias/page.tsx` | 8 hits | ✅ 8 → 0 |
| `components/referral/ReferralCard.tsx` | 7 hits | ✅ 7 → 0 |
| `assinatura/AssinaturaClient.tsx` | 47 hits | ✅ ignore-block (Regra 14 — copy financeira aguarda jurídico) |

### 2.5 Backend (per-recipient i18n)

| Componente | Status | Detalhes |
|---|---|---|
| `services/collab.ts:notifyCollabCreate` | ✅ | Resolve título/body **por destinatário** via `getUsersLocale` + cache `t` por locale; envia `recipient_locale` ao PostHog |
| `services/health-collab.ts:notifySaudeCreate` | ✅ | Usa `titleKey`/`messageKey` + variáveis; legacy `title`/`message` pt como fallback |
| `services/vaccine-notifier.ts` (3 crons) | ✅ | `runDailyVaccineDueNotify`, `runAppointmentTakeCardReminder`, `runMonthlySnoozeReentry` — todos via `buildTByUser` |
| `lib/emails/welcome.ts` | ✅ | 12 keys × 5 locales completos |
| `lib/emails/_locale.ts` | ✅ NOVO | Helper `resolveEmailLocale` reusável pelos 7 emails restantes |
| `actions/auth.ts:signUp` | ✅ | Persiste `profiles.locale = <cookieLocale>` durante signup |

### 2.6 Locales

| Métrica | PWA | Native |
|---|---|---|
| Total keys | **2279** | **2174** |
| Parity (5 locales) | ✅ 100% | ✅ 100% |
| Char limits | ✅ 0 violações | — |
| Hits `kindar/no-pt-literal` | **0** | **0 (allowlisted; refactor em PR seguinte)** |

**~250 novas keys** adicionadas: `auth.*`, `dashboard.serverFallbacks/healthStatus/healthDetail/custodyServer`, `schoolPage.client`, `notifications.saude/vaccine`, `emails.welcome`, `health.emergency/vaccineDetail/prescription`, `calendar.vacations`, `profile.deleteAccount/referral`, etc.

### 2.7 Enforcers / CI

| Enforcer | Modo | Detecta |
|---|---|---|
| `eslint-rules/no-pt-literal.mjs` | **error** | Strings pt em JSX + attrs i18n-sensíveis. **678 → 0** hits no escopo canônico. |
| `scripts/i18n/validate-locale-parity.mjs` | hard fail | Drift entre 5 locales (PWA + Native) |
| `scripts/i18n/validate-char-limits.mjs` | hard fail | Push >178, email subject >50, a11y >200 |
| `scripts/i18n/generate-types.mjs` | hard fail | `keys.generated.ts` byte-stable; CI falha se drift |
| `scripts/i18n/validate-orphan-keys.mjs` | warn-only | Chaves no JSON sem uso (cleanup contínuo) |
| `scripts/i18n/find-hardcoded-strings.mjs` | warn-only | Heurística complementar pra strings hardcoded |
| `scripts/i18n/add-keys.mjs` | utility | Atômico, `--target=pwa|native|both` |
| `scripts/i18n/_rank-offenders.mjs` | utility | Rank de arquivos por hit count |
| Sentry hook (server + client) | runtime warn | Chave faltando em prod |
| `.husky/pre-commit` | bloqueia commit | Roda `npm run i18n:check` + `npm run test --run` |
| `.github/workflows/i18n.yml` | required check | Mesma sequência em CI |

### 2.8 Testes

| Suite | Quantidade | Status |
|---|---|---|
| `tests/unit/i18n-server.test.ts` | 15 testes | ✅ verde |
| `tests/unit/i18n-pseudo.test.ts` | 13 testes | ✅ verde |
| `tests/unit/i18n-client.test.ts` | 11 testes | ✅ verde |
| `tests/unit/i18n-collab-notify.test.ts` | 4 testes | ✅ verde |
| **Suite full** | **1115 testes** | **✅ verde × 5 runs** |
| `tests/e2e/06-i18n-locales.spec.ts` | 25 testes | Opt-in via `PLAYWRIGHT_I18N_LOCALES=1` |

Validação 5× executada antes do push: build (×2), lint (×2), test (×2), i18n:check (×2). Todos verdes.

---

## 3. O que ainda fica como Tier 2 (allowlist documentada)

Os módulos abaixo estão na allowlist do `kindar/no-pt-literal` em `eslint.config.mjs`. Refator segue o **mesmo pattern** dos módulos já feitos:

```bash
# 1. Criar keys
cat > scripts/i18n/_keys-mymodule.json <<EOF
{ "myModule.title": { "pt": "...", "en": "...", ... } }
EOF
node scripts/i18n/add-keys.mjs --keys-file=scripts/i18n/_keys-mymodule.json --target=both

# 2. Refatorar o arquivo (Edit/Write)

# 3. Remover entrada do arquivo da allowlist em eslint.config.mjs

# 4. Lint pode rodar (deve sair 0)
npm run lint
```

### 3.1 PWA — módulos na allowlist

| Caminho | Justificativa |
|---|---|
| `src/app/(app)/atividades/**` | Próximo na fila (NewActivityForm 7 hits) |
| `src/app/(app)/eventos/**` | EventCard 7 hits |
| `src/app/(app)/calendario/**` (exceto `ferias/` já refatorado) | CalendarHeader, SwapBalance, ScheduleBuilder, etc. |
| `src/app/(app)/familia/**` | LeaveGroupButton + páginas |
| `src/app/(app)/semana/**` | WeeklySummaryClient |
| `src/app/(app)/financeiro/**` | FinancialDashboard |
| `src/app/(app)/saude/crescimento/**` | GrowthChart |
| `src/app/(app)/saude/vacinas/carteirinha/**` + `VacinasClient` | VaccineParserClient |
| `src/app/(app)/saude/vacinas/nova/**` + `consultas/nova/**` + `medicamentos/**` | Formulários de saúde |
| `src/app/(app)/saude/emergencia/page.tsx` | Sucessor de EmergencyCardClient (page wrapper) |
| `src/app/(app)/onboarding/**` | OnboardingForm + steps |
| `src/app/(app)/convite/**` | InviteForm + InviteClient |
| `src/app/(app)/dashboard/DashboardClient.tsx` | Single hit isolado |
| `src/components/billing/**` | EarlyBirdBadge, OnboardingQuest (Regra 14 — copy financeira; revisar com jurídico antes) |
| `src/components/saude/**` | VaccinePendingCard, VaccineTimeline (PNI/SBIm tooltips brasileiros) |
| `src/components/PWAInstallBanner`, `PushNotificationManager`, `PremiumGate`, `OnboardingChecklist`, `LanguageSelector` | Componentes infra de onboarding/install |
| `src/app/(auth)/error.tsx`, `session-recovery/`, `error.tsx`, `global-error.tsx`, `native-bridge`, `not-found.tsx` | Fallback pages raras |
| `src/app/(app)/despesas/**` | Regra 14 — copy financeira |
| `src/app/admin/**`, `pricing/**`, `termos/**`, `privacidade/**`, `suporte/**`, `page.tsx`, `components/landing/**` | Regra 14 — legal/marketing/admin |

### 3.2 Native — todos os módulos

Toda `kindar-native/app/**` está allowlisted. Refator em PR dedicada com pattern idêntico ao PWA. Foundation já está sincronizada (2174 keys, parity 100%).

### 3.3 Emails

7 emails restantes (`trial`, `payment-failed`, `renewal-reminder`, `subscription-welcome`, `nurture`, `send-monthly-report`, `send-cron-report`). Pattern provado em `welcome.ts` + `_locale.ts` — replicar é mecânico. **Atenção**: 4 deles são copy financeira (Regra 14) — passar por revisão antes.

### 3.4 Migração estrutural pra `next-intl` (Tier 3)

Tradeoff e plano em REGRAS_CANONICAS.md "Roadmap Tier 2". Quando: 6º idioma ou plural complexo (RU/PL).

### 3.5 Tolgee Cloud + tradução humana profissional (Tier 3)

Setar projeto Tolgee, importar `pt.json`, contratar tradutor humano nativo pra ~2300 keys × 4 locales (R$2-5k via OneSky/Smartling). Sem isso, traduções atuais são MT-quality.

---

## 4. Padrões consolidados (use em PRs futuras)

### 4.1 Server Component nova

```tsx
import { getRequestLocale, getServerT } from "@/i18n/server";
import { INTL_LOCALE_MAP } from "@/lib/locale-utils";

export default async function MyServerPage() {
  const locale = await getRequestLocale();
  const t = await getServerT(locale);
  const bcp47 = INTL_LOCALE_MAP[locale] ?? "pt-BR";

  return (
    <div>
      <h1>{t("myPage.title")}</h1>
      <p>{new Intl.DateTimeFormat(bcp47, { dateStyle: "long" }).format(new Date())}</p>
    </div>
  );
}
```

### 4.2 Server job (cron / push / email)

```ts
import { getServerT } from "@/i18n/server";
import { getUserLocale } from "@/lib/locale-utils";

async function notifyOne(userId: string) {
  const locale = await getUserLocale(userId);
  const t = await getServerT(locale);
  await sendPush(userId, {
    title: t("notifications.someKey"),
    body: t("notifications.someBody", { name: "Aline" }),
  });
}
```

### 4.3 Bulk fan-out

```ts
import { getUsersLocale } from "@/lib/locale-utils";

async function notifyMany(userIds: string[]) {
  const localeByUser = await getUsersLocale(userIds);
  const tByLocale = new Map();
  for (const userId of userIds) {
    const locale = localeByUser.get(userId);
    if (!tByLocale.has(locale)) tByLocale.set(locale, await getServerT(locale));
    const t = tByLocale.get(locale);
    // ...
  }
}
```

### 4.4 Adicionar key nova

```bash
cat > scripts/i18n/_keys-mymodule.json << 'EOF'
{
  "myModule.title": {
    "pt": "Meu título",
    "en": "My title",
    "es": "Mi título",
    "fr": "Mon titre",
    "de": "Mein Titel"
  }
}
EOF
node scripts/i18n/add-keys.mjs --keys-file=scripts/i18n/_keys-mymodule.json --target=both
```

### 4.5 Suprimir false positive

```tsx
{/* i18n-ignore-line — nome próprio, fica pt */}
<Text>Kindar</Text>

{/* i18n-ignore-block-start — copy legal aprovada por jurídico */}
<div>
  <Text>Texto legal só em pt</Text>
</div>
{/* i18n-ignore-block-end */}
```

---

## 5. Como reverter em produção

Setar `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=0` (já é o default — provavelmente nem precisa configurar). Middleware força `cookie=pt` pra todos os requests. Toda a infra nova fica transparente — comportamento idêntico ao pré-PR.

Migration `00084_users_locale_normalize` é não-destrutiva: o único efeito é UPDATE de `pt-BR` → `pt`, e tanto `getUserLocale` quanto `toSupportedLocale` (defesa em profundidade no código) tratam ambos como `pt`. Reverter via:

```sql
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_locale_check;
ALTER TABLE public.profiles ALTER COLUMN locale SET DEFAULT 'pt-BR';
-- UPDATE profiles SET locale = 'pt-BR' WHERE locale = 'pt';  -- só se realmente necessário
```

---

## 6. Métricas de sucesso

- [x] Cookie seteado no first visit
- [x] Server Components renderizam no idioma certo
- [x] CI bloqueia PR com drift de locale (PWA + Native)
- [x] CI bloqueia PR com char-limit violation
- [x] CI bloqueia PR com `kindar/no-pt-literal` error
- [x] Sentry warning em missing key em prod
- [x] Pseudo-localization disponível em dev
- [x] Migration `users.locale` aplicada em prod
- [x] Backend: push + welcome email no idioma do user
- [x] ESLint custom rule promovida a `error`
- [x] 38 testes unit + suite 1115/1115 verde × 5 validações
- [x] Build limpo
- [x] Commit + push em main
- [x] Migration aplicada em prod
- [ ] Tier 2 cleanup das ~564 strings hardcoded em ~40 arquivos allowlisted (PRs incrementais)
- [ ] 7 emails restantes localizados
- [ ] Tolgee + tradução humana profissional
- [ ] `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=1` ligado em prod

---

## 7. Histórico

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-16 | 1.0 | Fundação cookie + server-side + 3 server pages + enforcers iniciais | Henrique + Claude |
| 2026-05-16 | 2.0 | Auth 5 telas, EscolaClient, backend completo (collab+vaccine+welcome), ESLint rule, native sync, Playwright E2E, 4 unit suites adicionais. Build 0 errors, 1115 testes verde. | Henrique + Claude |
| 2026-05-16 | 3.0 | **EM PROD.** Saúde crítica refatorada (Emergency, VaccineDetail, Prescription), DeleteAccount, ferias, Referral; allowlist Tier 2 documentada; ESLint promovida a `error` (678→0); commit + push (8219315 + 7164752); migration 00083 + 00084 aplicada em prod (74 users com locale=pt normalizado). | Henrique + Claude |
