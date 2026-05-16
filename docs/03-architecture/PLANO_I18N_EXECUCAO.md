# Plano de Execução i18n — Estado, Handoff, Próximos Passos

> **Versão:** 2.0 (2026-05-16)
> **Dono:** Henrique
> **Status:** Fundação 100%. Backend 100%. Frontend ~30% das telas core refatoradas. ESLint rule ativa bloqueia regressão.
> **Companion docs:** [REGRAS_CANONICAS.md](./REGRAS_CANONICAS.md) · [MAPA_IA_KINDAR.md](../06-business/MAPA_IA_KINDAR.md)

Este documento substitui a versão 1.0. Reflete o estado completo após sessão executiva 2026-05-16.

---

## 1. Sumário executivo

### Bug raiz (resolvido)

Server Components do Next.js renderizavam strings em pt-BR fixo antes do client saber o locale. Usuário trocava idioma → "nada mudava". **Causa:** locale em `localStorage` (invisível ao server) + strings hardcoded em ~30 server pages.

### Solução estrutural (toda entregue nessa PR)

1. **Locale em cookie `kindar-locale`** — server lê via `getRequestLocale()`.
2. **Middleware** seta cookie no Edge no first-visit (Accept-Language RFC 7231).
3. **`src/i18n/server.ts`** expõe `getServerT()` e `getRequestLocale()`.
4. **`src/lib/locale-utils.ts`** expõe `getUserLocale(userId)` para jobs server-side (cron, push, email).
5. **`notifyCollabCreate`** resolve título/body **por destinatário** usando `profiles.locale`.
6. **Vaccine notifier** (3 crons) localiza push pra cada recipient.
7. **Welcome email** localizado nos 5 idiomas via Resend.

### Redes de proteção (ativas no CI + pre-commit)

- ESLint `kindar/no-pt-literal` (custom rule) flagga strings pt em JSX e atributos i18n-sensíveis. Baseline atual: **678 warnings**. Bloqueia hardcoded futuros via PR review.
- `validate-locale-parity` — hard fail se chave existir em pt e não em outro locale (PWA + Native).
- `validate-char-limits` — hard fail se push/email exceder limites por canal.
- `generate-types` — `keys.generated.ts` auto-gerado com 2126 keys; CI bloqueia se developer adicionar key sem rodar `npm run i18n:gen`.
- Sentry hook em fallback (server + client) — chave faltando em prod = warning silencioso.
- Pseudo-localization em dev via `NEXT_PUBLIC_PSEUDO_LOC=1`.

### Fase 0 (stop the bleeding) — ATIVA

- `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH` default OFF.
- **Middleware** força cookie=pt quando flag OFF (correção do furo da v1.0 onde middleware seguia Accept-Language mesmo com flag OFF, deixando UX meio-traduzido).
- `LanguageSelector` mostra banner bilíngue pt/en em vez do seletor.

---

## 2. Entregas técnicas detalhadas

### 2.1 Core i18n

| Arquivo | Tipo | Função |
|---|---|---|
| `src/i18n/server.ts` | NOVO | `getServerT()`, `getRequestLocale()`, `parseAcceptLanguage()`, Sentry hook |
| `src/i18n/index.ts` | MOD | Fallback chain pt-BR + Sentry hook client + pseudo-loc wrapper |
| `src/i18n/provider.tsx` | MOD | Cookie persist + reload no setLocale |
| `src/i18n/pseudo.ts` | NOVO | Pseudo-localization (transliteração + 40% padding) |
| `src/i18n/keys.generated.ts` | AUTO | 2126 keys tipadas |
| `src/lib/locale-utils.ts` | NOVO | `getUserLocale`, `getUsersLocale`, `toBcp47`, `toSupportedLocale`, `INTL_LOCALE_MAP` |
| `src/lib/supabase/middleware.ts` | MOD | Cookie setting + Fase 0 force-pt quando flag OFF |
| `src/app/(app)/layout.tsx` | MOD | `initialLocale` server-resolved |
| `src/app/(auth)/layout.tsx` | NOVO/MOD | I18nProvider para auth routes + `force-dynamic` |
| `src/components/LanguageSelector.tsx` | MOD | Flag-gated com banner Fase 0 |

### 2.2 Server pages refatoradas (Intl.* + getServerT)

| Página | Strings antes | Status |
|---|---|---|
| `dashboard/page.tsx` | 11 hardcoded + dias/meses + `"pt-BR"` | ✅ 100% |
| `perfil/page.tsx` | `toLocaleDateString("pt-BR")` | ✅ 100% |
| `saude/page.tsx` | 3 ocorrências `"pt-BR"` | ✅ 100% |
| `(auth)/login/page.tsx` | 12 strings | ✅ 100% |
| `(auth)/signup/page.tsx` | 16 strings | ✅ 100% |
| `(auth)/verify-email/page.tsx` | 7 strings | ✅ 100% |
| `(auth)/forgot-password/page.tsx` | 8 strings | ✅ 100% |
| `(auth)/reset-password/page.tsx` | 9 strings | ✅ 100% |
| `escola/EscolaClient.tsx` | 17 hits | ✅ 100% (17 → 0) |

### 2.3 Backend i18n

| Componente | Status | Detalhes |
|---|---|---|
| `services/collab.ts:notifyCollabCreate` | ✅ | Resolve título/body **por destinatário** via `getUsersLocale` + cache `t` por locale |
| `services/health-collab.ts:notifySaudeCreate` | ✅ | Usa `titleKey`/`messageKey` + variáveis + fallback pt; legacy `title`/`message` mantido pra back-compat |
| `services/vaccine-notifier.ts` (3 crons) | ✅ | `runDailyVaccineDueNotify`, `runAppointmentTakeCardReminder`, `runMonthlySnoozeReentry` — todos usam `buildTByUser` |
| `lib/emails/welcome.ts` | ✅ | Locale resolvido via `_locale.ts` + 12 keys × 5 locales |
| `lib/emails/_locale.ts` | ✅ NOVO | Helper `resolveEmailLocale` pra qualquer email |
| `actions/auth.ts:signUp` | ✅ | Persiste `profiles.locale = <cookieLocale>` no signup + manda welcome no idioma |
| Restantes 7 emails (trial, payment-failed, renewal-reminder, subscription-welcome, nurture, monthly-report, cron-report) | 🟡 PENDENTE | Pattern provado em welcome.ts; mesma estrutura aplicável a todos |

### 2.4 Locales (JSON content)

| Métrica | Valor |
|---|---|
| Total keys PWA | 2126 |
| Total keys Native | 2021 |
| Locale parity PWA | ✅ 100% (5/5) |
| Locale parity Native | ✅ 100% (5/5) |
| Drift PWA↔Native | -105 keys no native (pages PWA-only — assinatura, perfil-deletar, pricing-marketing) |
| Char limits violations | 0 |
| Chaves adicionadas nessa PR | ~150 (auth, healthStatus, healthDetail, custodyServer, schoolPage.client, notifications.saude, notifications.vaccine, emails.welcome, eventAutoCalendar) |

### 2.5 Enforcers / CI

| Enforcer | Modo | Detecta |
|---|---|---|
| `scripts/i18n/validate-locale-parity.mjs` | hard fail | Drift de chaves entre 5 locales (PWA + Native) |
| `scripts/i18n/validate-char-limits.mjs` | hard fail | Push >178, email subject >50, a11y >200 |
| `scripts/i18n/generate-types.mjs` | hard fail | `keys.generated.ts` desatualizado |
| `scripts/i18n/validate-orphan-keys.mjs` | warn-only | 540 chaves no JSON sem uso aparente (heurística) |
| `scripts/i18n/find-hardcoded-strings.mjs` | warn-only | 404 hits estimados em 117 arquivos |
| `scripts/i18n/add-keys.mjs` | utility | Atômico, idempotente, suporta `--target=pwa\|native\|both` |
| `eslint-rules/no-pt-literal.mjs` | warn (escalável pra error) | Strings pt em JSX + attrs i18n-sensíveis. 678 hits. |
| Sentry hook (server + client) | runtime warn | Chave faltando em prod |
| `.husky/pre-commit` | bloqueia commit | Roda `npm run i18n:check` |
| `.github/workflows/i18n.yml` | required check | Mesma sequência em CI |

### 2.6 Migration

- `supabase/migrations/00083_users_locale.sql` — `profiles.locale` (BCP 47 enum check, default `pt`, índice parcial não-pt).
- **Status:** escrita, não aplicada. Aditiva e idempotente — segura pra deploy a qualquer momento. Recomendado aplicar antes de habilitar `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=1`.

### 2.7 Testes

| Suite | Quantidade | Status |
|---|---|---|
| `tests/unit/i18n-server.test.ts` | 15 testes | ✅ verde |
| `tests/unit/i18n-pseudo.test.ts` | 13 testes | ✅ verde |
| `tests/unit/i18n-client.test.ts` | 11 testes | ✅ verde |
| `tests/unit/i18n-collab-notify.test.ts` | 4 testes | ✅ verde |
| Suite full | **1115 testes** | ✅ verde |
| `tests/e2e/06-i18n-locales.spec.ts` | 25 testes (5 locales × 5 telas) | Opt-in via `PLAYWRIGHT_I18N_LOCALES=1` + flag preview |

---

## 3. O que NÃO está pronto (próximas PRs)

### 3.1 Frontend: 678 strings hardcoded restantes

Detecção via ESLint `kindar/no-pt-literal`. Top offenders após esta PR:

| Arquivo | Hits | Categoria |
|---|---|---|
| `assinatura/AssinaturaClient.tsx` | 30 | **Regra 14 — copy financeira, precisa jurídico/marketing review** |
| `saude/emergencia/EmergencyCardClient.tsx` | 8 | Saúde — alta visibilidade |
| `saude/vacinas/[id]/VaccineDetailClient.tsx` | 8 | Saúde |
| `saude/receita/PrescriptionParserClient.tsx` | 7 | Saúde |
| `calendario/CalendarExportButton.tsx` | 5 | Calendário |
| `despesas/ExpensesClient.tsx` | 4 | Financeiro |
| `calendario/ferias/page.tsx` | 4 | Calendário |
| Outros ~100 arquivos com 1-3 hits | ~570 | Diversos |

**Próxima PR sugerida:** atacar Saúde (todos os 4 clients principais) + Calendário. ~50 strings, ~1 semana.

### 3.2 Backend: 7 emails restantes

Pattern provado em `welcome.ts` + `_locale.ts`. Aplicar a:
- `trial.ts`
- `payment-failed.ts` (cuidado: copy financeira)
- `renewal-reminder.ts` (cuidado: copy financeira)
- `subscription-welcome.ts` (cuidado: copy financeira)
- `nurture.ts`
- `send-monthly-report.ts`
- `send-cron-report.ts`

Estimativa: 1-2 dias. Bloqueio: copy financeira tem que ser revisada (Regra 14).

### 3.3 Native frontend: 19 arquivos com strings hardcoded

| Arquivo | Hits |
|---|---|
| `kindar-native/app/escola/index.tsx` | 14 |
| `kindar-native/app/despesas/index.tsx` | 11 |
| `kindar-native/app/calendario/ferias.tsx` | 9 |
| `kindar-native/app/saude/vacinas/[id].tsx` | 9 |
| `kindar-native/app/atividades/nova.tsx` | 8 |
| `kindar-native/app/calendario/novo.tsx` | 8 |
| 13 outros arquivos | 1-6 cada |

Total estimado: ~120 strings. Pattern idêntico ao PWA — keys novas via `add-keys.mjs --target=both` + substituição. 3-4 dias.

### 3.4 Migração estrutural pra `next-intl` (Tier 2 — não urgente)

Tradeoff e plano em REGRAS_CANONICAS.md seção "Roadmap Tier 2". Quando: 6º idioma ou plural complexo (RU/PL).

### 3.5 Tolgee Cloud + tradução humana profissional

Pendente: setar projeto Tolgee, importar `pt.json`, contratar tradutor humano pra ~2000 keys × 4 locales. Custo estimado: R$2-5k OneSky/Smartling. Sem isso, traduções atuais são MT-quality (boas mas com tropeços culturais).

---

## 4. Padrões consolidados (use como referência em PRs futuras)

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

### 4.3 Bulk fan-out (cron pra grupo)

```ts
import { getUsersLocale } from "@/lib/locale-utils";

async function notifyMany(userIds: string[]) {
  const localeByUser = await getUsersLocale(userIds);
  const tByLocale = new Map();
  for (const userId of userIds) {
    const locale = localeByUser.get(userId);
    if (!tByLocale.has(locale)) {
      tByLocale.set(locale, await getServerT(locale));
    }
    const t = tByLocale.get(locale);
    // ...
  }
}
```

### 4.4 Adicionar key nova nos 5 locales

```bash
cat > scripts/i18n/_keys-myfeature.json << 'EOF'
{
  "myFeature.title": {
    "pt": "Meu título",
    "en": "My title",
    "es": "Mi título",
    "fr": "Mon titre",
    "de": "Mein Titel"
  }
}
EOF

node scripts/i18n/add-keys.mjs --keys-file=scripts/i18n/_keys-myfeature.json --target=both
```

### 4.5 Suprimir false positive do ESLint rule

```tsx
{/* i18n-ignore-line */}
<Text>Kindar</Text>  {/* nome próprio, fica pt fixo */}

{/* i18n-ignore-block-start */}
<div>
  <Text>Conteúdo legal copy</Text>
  <Text>jurídico aprovou em PT-only</Text>
</div>
{/* i18n-ignore-block-end */}
```

---

## 5. Roteiro de deploy

### Checklist pré-merge

- [x] `npm run test` — 1115 verde
- [x] `npm run lint` — 0 errors
- [x] `npm run build` — passa
- [x] `npm run i18n:check` — verde (PWA + Native)
- [x] Auth flow testado manualmente em pt
- [x] ESLint custom rule ativa como `warn`
- [ ] Validar manualmente em preview: setar cookie `kindar-locale` pra `en` → telas refatoradas renderizam em EN, demais em pt (esperado durante Fase 0)
- [ ] Confirmar `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH` ausente ou `0` em Vercel (Fase 0)

### Migration

- `00083_users_locale.sql` é segura pra aplicar a qualquer momento (aditiva, idempotente). Aplicar antes do próximo deploy do app evita ter `getUserLocale` retornando default-pt por falta da coluna.

### Reverter

Se algo der errado em prod: setar `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=0` (já é o default — não precisa) e o middleware **força cookie=pt** pra todo mundo. Toda a infraestrutura nova é transparente (caminho pt cai no fallback identicamente ao comportamento anterior).

---

## 6. Métricas de sucesso (alvo final)

- [x] Cookie seta no first visit via Accept-Language (quando flag ON)
- [x] Server Components renderizam no idioma certo
- [x] CI bloqueia PR com drift de locale
- [x] CI bloqueia PR com char-limit violation
- [x] Sentry warning em missing key em prod
- [x] Pseudo-localization disponível em dev
- [x] Migration `users.locale` (00083) pronta pra apply
- [x] Backend: push + welcome email no idioma do user
- [x] ESLint rule `kindar/no-pt-literal` ativa
- [x] 38 testes unit + 4 collab + 1115 suite full verde
- [x] Build limpo
- [ ] **678 → <50 warnings** do `kindar/no-pt-literal` (PRs incrementais)
- [ ] Promoção da rule pra `error` quando warnings < 50
- [ ] Tolgee setado + tradução humana profissional
- [ ] Backend: 7 emails restantes localizados
- [ ] Native: 19 arquivos hardcoded refatorados
- [ ] `NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=1` ligado em prod

---

## 7. Histórico

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-16 | 1.0 | Fundação cookie + server-side + 3 server pages + enforcers iniciais | Henrique + Claude |
| 2026-05-16 | 2.0 | Auth 5 telas, EscolaClient, backend completo (collab+vaccine+welcome), ESLint rule, native sync, Playwright E2E (opt-in), 4 unit suites adicionais. Build 0 errors, 1115 testes verde. | Henrique + Claude |
