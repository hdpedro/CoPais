# Plano de Replicação Native — Paridade 100% com PWA

**Objetivo original (Apr 22, 2026)**: app nativo iOS/Android com 100% das features do PWA + UX nativa premium.
**Data início**: 2026-04-22
**Status (24/04/2026)**: ✅ **CONCLUÍDO** — paridade funcional total + deploy em TestFlight (build 32+).

---

## Resultado final

### Paridade funcional: 100%
Todas as 20 feature-areas do PWA têm implementação native equivalente (seja nativa ou via WebView):

| Feature | Native | Abordagem |
|---------|--------|-----------|
| Dashboard | ✅ | Nativo — hero dark + child cards + pendingReports + grid acoes rapidas |
| Calendário | ✅ | Nativo — grid com pills, feriados BR, banner troca, legenda correta, CTA "Gerar escala" |
| Chat | ✅ | Nativo — tabs canal, "Hoje" divider, read checks, system cards, image attach |
| Saúde (9 subtelas) | ✅ | Nativo — consultas, vacinas, crescimento, doenças (+EvolutionQuickAction), medicamentos (+ConfirmDose + histórico), alergias, receita OCR, emergência, profissionais |
| Check-in diário | ✅ | Nativo — create flow completo com 7 categorias |
| Despesas / Financeiro | ✅ | Nativo — delete, receipt viewer, split ratio, aprovação inline |
| Atividades | ✅ | Nativo — edit modal, checklist modal, report modal |
| Decisões | ✅ | Nativo — votação com Votar inline no dashboard |
| Eventos | ✅ | Nativo — edit + delete + toggle dia inteiro + pedidos |
| Acordos | ✅ | Nativo — CRUD |
| Crianças | Lista ✅ / Detail **WebView** | `[id]` via WebView (964 LOC PWA) + `/native-bridge` pra escrever cookies SSR antes do middleware |
| Novo evento | **WebView** | `/calendario/novo` via WebView (1167 LOC PWA) + `/native-bridge` |
| Análise da semana | **WebView** | `/semana` via WebView (v1.1.21) — PWA WeeklySummaryClient muito mais rico |
| Escala guarda | ✅ | Nativo — pattern 14 dias, 4 modelos, gera custody_events. Load tolera schedule por child OU por grupo (parity com PWA) |
| Swap / Balance | ✅ | Nativo — SwapRequestModal, SwapBalanceCard, BalanceHistorySheet, ProposeBalanceAdjustmentSheet, respondToSwap materializa custody_events |
| Família | ✅ | Nativo — invite, remove, leave, cancel invitation |
| Escola | ✅ | Nativo — edit por criança com TimePickerField |
| Documentos | **WebView** | `/documentos` via WebView (v1.1.21) — PWA DocumentsDashboard mais completo (filtros, preview, analytics) |
| Notas | ✅ | Nativo — CRUD |
| Temas sensíveis | ✅ | Nativo — base de listagem |
| Perfil | ✅ | Nativo — edit inline, i18n seletor, WhatsApp link OTP, sign out |
| Notificações | ✅ | Nativo — inbox + push deep link |

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

## Métricas finais

| Métrica | Valor |
|---------|-------|
| Telas native | 56 rotas expo-router |
| Componentes reusáveis | 22 (`src/components/{ui,calendar,activities,profile}`) |
| Services | 14 (`src/services/`) |
| Hooks | 3 (`useDashboard`, `useCalendar`, `useHealth`) |
| Tabelas Supabase expostas | 45+ |
| Testes Vitest | 286 passando |
| iOS builds deployados | 32 (v1.0.1) |
| TestFlight testers ativos | 2 (Henrique + Angelino) |
| Paridade funcional com PWA | **100%** |

---

## Documentos relacionados

- [`DEPLOY-IOS.md`](../DEPLOY-IOS.md) — pipeline detalhado
- [`MANUAL_DEV.md`](../MANUAL_DEV.md) — seções 24 (Native) + 25 (CI/CD iOS)
- [`DOCUMENTACAO.md`](../DOCUMENTACAO.md) — schema Supabase completo
- [`RELATORIO-PWA.md`](../RELATORIO-PWA.md) — auditoria PWA original (68 telas, 30 APIs, 8 workflows)

---

> Este plano foi concluído. Para novas features, adicionar diretamente em `kindar-native/app/` e `kindar-native/src/`, seguindo padrões do [`MANUAL_DEV.md#24`](../MANUAL_DEV.md#24-kindar-native-iosandroid). Tags `v1.X.Y` automaticamente disparam o pipeline iOS.
