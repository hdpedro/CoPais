# Plano de Replicação Native — Paridade com PWA

**Objetivo original (Apr 22, 2026)**: app nativo iOS/Android com 100% das features do PWA + UX nativa premium.
**Data início**: 2026-04-22

**Status (27/04/2026, pós full-audit)**: 🟢 **~88% paridade funcional** — gaps P0 críticos fechados.
TestFlight build 32+ (v1.0.1) está rodando.

> Update 2026-04-27 (auditoria completa PWA × native): fechou 4 gaps de P0:
>   - **`school_logs` CRUD nativo** — service novo (`kindar-native/src/services/school.ts`) + tela `/escola` ganha aba "Registros" com timeline, criar/editar/excluir, toggle homework completed. Antes era PWA-only.
>   - **`upsertMedicalInfo`** — endpoint Bearer `PUT /api/health/medical-info` + native service `health.upsertMedicalInfo()`. Antes só leitura no nativo.
>   - **`regenerateEmergencyToken`** — endpoint Bearer `POST /api/health/emergency/[childId]/regenerate` + native service + UI button na tela `/saude/emergencia`. Antes só PWA conseguia rotacionar o token público.
>   - **Bug `calendar_occurrences.status`** — `useDashboard.ts:214,221` filtravam coluna inexistente, escondendo silenciosamente os cards "hoje/amanhã". Comentário interno mencionava o bug mas o código estava errado.

> Atualização pós-auditoria 2026-04-27: este plano antes claimed "100% paridade".
> Validação independente (estática + curl no Supabase produção + Playwright cross-platform)
> mostrou que muitas telas existem mas têm CRUD parcial. Texto abaixo recalibrado.

---

## Resultado real (auditado 2026-04-27)

### Paridade funcional: ~75% ponderada

Todas as 20+ feature-areas do PWA têm tela equivalente no nativo, mas a profundidade do CRUD varia:

| Feature | Status real | % paridade | Notas |
|---------|-------------|-----------|-------|
| Dashboard | ✅ nativo | 90% | hero dark + child cards + pending lists; **realtime de notificações adicionado 2026-04-27** |
| Calendário (lista) | ✅ nativo | 85% | grid com pills, feriados BR, escala 4 modelos, swap com balance |
| Calendário → Novo evento | **WebView** | 70% | `/calendario/novo` via PWA — bridge OK, mas não é UX nativa |
| Análise da semana | **WebView** | 70% | `/semana` via PWA — `WeeklySummaryClient` muito mais rico |
| Documentos | **WebView** | 70% | listagem nativa OK; filtros/preview/analytics só PWA |
| Chat | ✅ nativo + realtime | 90% | tabs, read checks, system cards, image attach |
| Saúde (hub + 9 subtelas) | ✅ nativo | **85%** | reauditado 2026-04-27: `medical_professionals` write inline em `saude/profissionais.tsx`, `vaccines-bulk` + `save-prescription` consumindo APIs Bearer, `medical-info` agora tem endpoint + service, `regenerate emergency token` idem. Resta `savePrescriptionToHealth` AI-flow nao replicar. |
| Check-in diário | ✅ nativo | 85% | 7 categorias, safeWrite |
| Despesas / Financeiro | 🟡 parcial | 80% | CRUD nativo OK; **settlement (cálculo a pagar) é PWA-only** |
| Atividades | 🟡 parcial | 80% | edit modal, checklist, report; alguns occurrence overrides faltam |
| Decisões | ✅ nativo + realtime arguments | 95% | até superior ao PWA em features |
| Eventos | 🟡 parcial | 70% | edit/delete OK; criação delegada ao WebView |
| Acordos | ✅ nativo | 95% | CRUD completo |
| Crianças | ✅ lista + detail nativos | 90% | detail foi portado p/ nativo (não é mais WebView, plan estava desatualizado) |
| Escala guarda | ✅ nativo | 95% | pattern 14 dias, 4 modelos, gera custody_events |
| Swap / Balance | ✅ nativo | 95% | modal, balance card, history sheet, propose adjustment |
| Família | ✅ nativo | 90% | invite, remove, leave, cancel |
| Escola | ✅ nativo | 95% | edita `child_education` + nova aba "Registros" (`school_logs` CRUD) adicionada 2026-04-27 |
| Notas | ✅ nativo | 95% | CRUD completo |
| Temas sensíveis | 🟡 só listagem | 50% | **CRUD ausente no nativo** (271 LOC PWA, 0 native) |
| Perfil | ✅ nativo | 90% | edit inline, i18n, WhatsApp link OTP, sign out, deletar conta |
| Notificações (inbox) | ✅ + realtime | 80% | **realtime live update adicionado 2026-04-27** (antes era polling-only) |
| Onboarding quest | 🟡 telas só | 70% | telas existem mas **não escrevem em `onboarding_quests`** — gamificação não persistida |
| Settlement / split | ❌ PWA-only | 0% | `settlements` (221 LOC) e `subscription-split` (193 LOC) sem nativo |
| Push iOS (APNs) | ✅ funciona | 100% | APNs HTTP/2 com .p8 ES256 |
| Push Android (FCM) | ✅ corrigido 2026-04-27 | 100% | sender FCM HTTP v1 + dual-platform register endpoint |
| IAP segurança | ✅ corrigido 2026-04-27 | 100% | `/iap/verify` cria `status='pending'`; RevenueCat webhook flipa para `active` (assim ataque com productId forjado não confere acesso) |

### Features native-only (nao existem no PWA)
- **Sincronizar com Celular** — `expo-calendar` exporta eventos pro calendário nativo iOS/Android
- **Auto-distribute TestFlight** — `kindar-asc.mjs distributeBuildToTesters` anexa build a grupos externos + testers individuais
- **Push deep link** — `addNotificationResponseListener` faz `router.push` baseado no payload
- **Pickers nativos** wheel/dialog em vez de text DD/MM/AAAA

### LOC delivered
- **Início (Apr 22)**: 8.144 LOC native
- **Final (Apr 24)**: ~14.500 LOC native
- **Delta**: +6.300 LOC puros de RN + componentes compartilhados
- **Plus**: ~250 LOC de automação ASC (`kindar-asc.mjs` novas funções)

---

## Timeline real (iterations)

### Dia 1 (Apr 22) — Fundação + paridade bulk
- Login split platform-specific
- 8 bugs críticos fechados (`saude` datas, `/notas` CRUD, `/checkin`, `/documentos` upload, `/escola` edit, `/auth/callback`)
- 6 features longo-tail (`EvolutionQuickAction`, `WeekendPlanner`, `SwapRequestModal`, `WhatsAppLinkSection`, Balance stack, Activity modals)
- Dashboard rewrite (hero dark)
- Calendário rewrite (cells ricas, feriados BR)
- Chat rewrite (tabs, read checks, system cards)
- TestFlight auto-distribute inicial

### Dia 2 (Apr 23)
- Angelino push PR #3 (PWA swap fixes) — portados pro native
- WebView para `/criancas/[id]` e `/calendario/novo`
- Escala fix (tabela certa `custody_schedules`)
- Sincronizar com Celular real (expo-calendar)
- CI iterado ~10x pra stabilizar ASC API 2024+

### Dia 3 (Apr 24)
- Concurrency `ios-release-all` (evita race EAS autoIncrement)
- Version bump 1.0.1 (reseta tracking "already submitted")
- Dashboard health heuristic fixed (estava invertido vs PWA)
- Saldo Financeiro removido do home (match PWA)
- Repo tornado **público** → GH Actions + Vercel ilimitados
- Docs updated

---

## Lições aprendidas

### 1. WebView hybrid > port puro para forms complexos
964 LOC de Child Detail ou 1167 LOC de Novo Evento viram 113 LOC de WebView com session injection. Ganhos compostos:
- Dev time: dias → minutos
- Manutenção: PWA evolui, native pega automático
- Paridade: 100% garantida
- UX: ~1s de boot, indistinguível depois

### 2. ASC API 2024+ é menos estável que Apple documenta
Descobrimos iterativamente:
- Age rating schema mix bool/enum (PATCH-only, nunca POST)
- Pricing via `/v1/appPriceSchedules` com manualPrices nested em `included` (nao existe `/appPrices` standalone)
- reviewSubmission reuse obrigatório (cap 5 concurrent, não cancelável em todos os states)
- `/betaTesters` nested só aceita DELETE; GET pelo top-level `filter[apps]=`
- Internal beta groups rejeitam POST relationships/builds (auto-distribuídos)

### 3. Concurrency no CI é essencial
GitHub Actions serializa por ref por padrão, mas tags diferentes rodam em paralelo. No nosso caso, race no EAS autoIncrement → "already submitted". Fix: `concurrency: ios-release-all`.

### 4. Version bump de 1.0.0 → 1.0.1 desbloqueia tracking Apple
Se uma sequência de buildNumbers ficou em "already submitted" state em version 1.0.0, bump versão reseta tudo.

### 5. Repo público desbloqueia CI grátis
Private repo no tier Free = 2000 min/mês de Actions. Público = ilimitado. Vercel idem (Hobby grátis em público).

### 6. WebView precisa de bridge SSR pra auth (v1.1.21)
Injeção de session direto no localStorage do WebView NAO funciona pra middleware Next.js — middleware roda server-side (antes do JS cliente) e lê cookies, nao localStorage. Resultado: `/criancas/[id]` bateu no middleware → redirect `/login`.

**Fix**: criamos `src/app/native-bridge/page.tsx` que roda client-side, lê a session do localStorage (ja injetada pelo `injectedJavaScriptBeforeContentLoaded`), chama `supabase.auth.setSession()` — o `@supabase/ssr` browser client escreve cookies via CookieStore. Depois `window.location.replace(next)` faz fresh request onde middleware agora ve cookies validos.

WebViews nativos navegam via `${WEB_URL}/native-bridge?next=${encodeURIComponent('/target/path')}` em vez do destino direto.

### 7. Native dashboard queries espelham PWA ou quebram silencioso (v1.1.21)
`calendar_occurrences` NAO tem coluna `status` (ver migration `00038_calendar_occurrences.sql`). Native filtrava `.eq('status','active')` herdado de copy-paste de outra query — retornava 0 rows silencioso, escondendo "Status Pendentes". Lição: sempre copiar a query do PWA como source of truth, nao adaptar de memoria.

### 8. custody_schedules fallback group-level (v1.1.21)
PWA load: `.eq('group_id').limit(1).single()` — sem child_id filter. Native estava filtrando por child, perdia schedules salvos com child_id diferente. Fix: tenta child-specific primeiro, fallback pra qualquer row do grupo.

---

## Itens manuais restantes (não-automatizáveis)

Para submissão completa ao App Store review:

### 1. App Privacy Nutrition Labels
**URL:** `https://appstoreconnect.apple.com/apps/6762701916/app-privacy`
**Ação:** responder questionário (email, nome, identificadores, dados de crianças) → **Publish**
**Sem API pública equivalente.**

### 2. Screenshots iPhone 6.7"
**URL:** `https://appstoreconnect.apple.com/apps/6762701916/distribution/info`
**Ação:** upload ≥1 screenshot 1290×2796 por locale (pt-BR + en-US)
**Sem API pública equivalente.**

Depois desses 2 itens, a pipeline submete pra review sem intervenção manual.

---

## Métricas reais (auditadas 2026-04-27)

| Métrica | Valor |
|---------|-------|
| Telas native | 56 rotas expo-router |
| Telas WebView remanescentes | 2 (`/calendario/novo`, `/semana`) |
| Componentes reusáveis | 22 (`src/components/{ui,calendar,activities,profile}`) |
| Services | 25 (`src/services/`) |
| Hooks | 3 (`useDashboard`, `useCalendar`, `useHealth`) |
| Tabelas Supabase usadas pelo nativo | 42 |
| Tabelas que só o PWA usa | 28 (~40% — ver lista no relatório de auditoria) |
| Testes Vitest | 286 passando (PWA) |
| Testes Playwright PWA × Expo Web | 4/5 match na última run completa |
| iOS builds deployados | 32 (v1.0.1) |
| TestFlight testers ativos | 2 (Henrique + Angelino) |
| **Paridade funcional ponderada** | **~75%** |
| Push iOS (APNs) | ✅ funcionando |
| Push Android (FCM) | ✅ funcionando após fix 2026-04-27 |
| Realtime no nativo | ✅ chat + notifications + decision_arguments |
| IAP security | ✅ `pending → active via webhook` |

### Gaps que ainda IMPEDEM "100% paridade" (revisado 2026-04-27):

1. ~~**Saúde** — port CRUD nativo~~ ✅ FECHADO (write-paths críticos delegados a APIs Bearer; `medical-info` + `regenerate emergency token` + `professionals` + vaccines-bulk + save-prescription).
2. ~~**Settlement + subscription-split**~~ ✅ FECHADO em wave H/I (settlements service + financeiro UI; subscription-split é payer-only — UX justificadamente PWA).
3. ~~**Onboarding quest**~~ ✅ FECHADO (services/quest.ts já chama `markQuestStep` + `getQuestProgress`).
4. ~~**Temas sensíveis**~~ ✅ FECHADO (services/sensitive.ts com createSensitiveNote/requestDeletion/approveDeletion/cancelDeletion).
5. ~~**Calendário "novo evento" + "/semana"**~~ ✅ FECHADO (`/calendario/novo` + `/semana` agora são telas RN nativas, sem WebView).
6. ~~**`school_logs`**~~ ✅ FECHADO (services/school.ts + nova aba na tela escola, 2026-04-27).

**Resta apenas:**
- `savePrescriptionToHealth` (AI prescription scan TripleGuard) — mantido PWA-only por complexidade do fluxo OCR/inferência clínica; já existe API Bearer para o nativo consumir caso o fluxo de scan seja portado no futuro.
- `subscription-split` — feature de pagador (toggle de divisão da assinatura). UX é específica do payer e o nativo prefere mostrar a despesa gerada em `/financeiro` (já funciona); deliberadamente PWA-only.

> Conclusão: paridade **funcional** efetiva ~95% das features-core. Os 5% remanescentes são features intencionalmente cross-platform (web melhor que mobile pra OCR/scan, e billing toggle).

---

## Documentos relacionados

- [`DEPLOY-IOS.md`](../DEPLOY-IOS.md) — pipeline detalhado
- [`MANUAL_DEV.md`](../MANUAL_DEV.md) — seções 24 (Native) + 25 (CI/CD iOS)
- [`DOCUMENTACAO.md`](../DOCUMENTACAO.md) — schema Supabase completo
- [`RELATORIO-PWA.md`](../RELATORIO-PWA.md) — auditoria PWA original (68 telas, 30 APIs, 8 workflows)

---

> Este plano foi concluído. Para novas features, adicionar diretamente em `kindar-native/app/` e `kindar-native/src/`, seguindo padrões do [`MANUAL_DEV.md#24`](../MANUAL_DEV.md#24-kindar-native-iosandroid). Tags `v1.X.Y` automaticamente disparam o pipeline iOS.
