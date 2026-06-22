# Kindar - Documentacao Tecnica Completa

## Visao Geral

**Kindar** e um aplicativo de coparentalidade que ajuda pais separados a organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa. O nome "Kindar" representa os dois lares da crianca.

**URL de producao:** https://kindar.com.br
**iOS App:** Kindar Native (Expo) — TestFlight + App Store
**Android App:** Kindar Native (Expo) — Internal App Sharing / Play Store (alpha)
**Dominio:** kindar.com.br
**Repositorio:** https://github.com/hdpedro/CoPais (**PUBLICO** desde 24/04/2026 para CI grátis)
**Ultima atualizacao:** 14/05/2026 (PWA pos-v1.1.19 + Native v1.0.5)

> **Arquitetura dual**: este monorepo tem 2 apps compartilhando o mesmo backend Supabase:
> - `src/` → **PWA** (Next.js)
> - `kindar-native/` → **Kindar Native** (Expo SDK 54 / React Native 0.76)

---

## Stack Tecnologica

### PWA (Next.js)
| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.1.7 |
| UI | React | 19.2.3 |
| Linguagem | TypeScript | ^5 |
| Estilizacao | Tailwind CSS | ^4 |
| Backend/BaaS | Supabase (PostgreSQL) | ^2.99.2 |
| Auth | Supabase Auth + SSR | ^0.9.0 |
| IA | Multi-provider Router: Groq → Together → Gemini + Tesseract.js (OCR) | Cloud API / local |
| i18n | Custom (I18nProvider + useI18n) | 5 idiomas, ~1488 chaves, 40 secoes |
| Analytics | PostHog | 30+ eventos, cross-platform com super-property `platform` |
| Error Tracking | Sentry | — |
| Deploy | Vercel (Hobby, gratis para repo publico) | — |
| Mobile legado | Capacitor | ^7 (deprecado) |

### Kindar Native (Expo)
| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Expo SDK | 54 |
| Runtime | React Native (New Architecture) | 0.76 |
| Router | expo-router | ^4 (file-based) |
| Pickers | @react-native-community/datetimepicker | ~8.4 |
| WebView | react-native-webview | ~13.14 (para `criancas/[id]` e `calendario/novo`) |
| Calendar export | expo-calendar | ~14.1 |
| Image | expo-image-picker + expo-document-picker | ~16/14 |
| Push | expo-notifications | ~0.30 |
| Build | EAS Build (production profile) | cli 18.x |
| Submit | EAS Submit + ASC API (via `kindar-asc.mjs`) | custom |
| CI | GitHub Actions (`ios-release.yml`), concurrency `ios-release-all` | — |

### Testes
| Tipo | Tecnologia | Qtd |
|------|-----------|-----|
| Unitarios | Vitest | **36 arquivos de teste** (~286+ casos, contagem exata varia por execucao) |
| E2E | Playwright | 34 testes |
| Lint | ESLint --max-warnings 0 | — |
| Typecheck | tsc --noEmit | — |

### Repositorio
| Campo | Valor |
|-------|-------|
| Host | GitHub |
| URL | https://github.com/hdpedro/CoPais |
| Visibilidade | **PUBLICA** (Actions ilimitadas, Vercel grátis) |

---

## Arquitetura

```
src/
├── actions/          # Server Actions (30 arquivos, 126 funcoes — inclui admin-coupons, balance-operations, birthdays, onboarding-quest, subscription, subscription-split, whatsapp)
├── app/
│   ├── (auth)/       # Rotas publicas (login, signup, etc.) — 6 paginas
│   ├── (app)/        # Rotas protegidas (dashboard, calendario, etc.) — 54 paginas
│   └── api/          # API Routes (74 endpoints — IA, auth, billing, cron, health, push, stripe, whatsapp, native shell, etc.)
├── components/       # Componentes globais (36 arquivos, inclui subpastas: analytics/, billing/, landing/, referral/, ui/)
│   ├── BottomNav.tsx, Sidebar.tsx, ResponsiveShell.tsx, NativeShellGuard.tsx
│   ├── GroupSelector.tsx, LanguageSelector.tsx, QuickActionsModal.tsx
│   ├── NotificationBadge.tsx, AIAssistant.tsx, KindarLogo.tsx, PageSkeleton.tsx
│   ├── PushNotificationManager.tsx, PWAInstallBanner.tsx
│   ├── PostHogProvider.tsx, PostHogAnonymousInit.tsx, AuthSessionProvider.tsx
│   ├── SubscriptionProvider.tsx, PremiumGate.tsx, SocialLoginButtons.tsx
│   ├── CustodyActivationCard.tsx, EnableCustodyLink.tsx, FeatureTooltip.tsx
│   ├── OnboardingChecklist.tsx, ShareActivityButton.tsx
│   ├── analytics/PageViewTracker.tsx
│   ├── billing/  # EarlyBirdBadge, OnboardingQuest, TrialBanner
│   ├── landing/  # AppStoreBadges, ExperimentHeadline, LandingFaq, LandingPricingPreview, LandingSocialProof, LandingWhatsAppHero
│   ├── referral/ReferralCard.tsx
│   └── ui/ChildAvatarWeb.tsx
├── i18n/             # Sistema de internacionalizacao
│   └── locales/      # pt.json, en.json, es.json, fr.json, de.json (~1982 chaves em pt.json)
├── lib/
│   ├── supabase/     # Client, Server, Middleware, Admin (service role)
│   ├── ai/                # Modulo AI centralizado
│   │   ├── core/          # types, config, logger, usage tracking, service (generateAIResponse)
│   │   ├── providers/     # Groq, Together, Gemini providers
│   │   ├── router.ts      # Multi-provider router (Groq → Together → Gemini fallback)
│   │   ├── image-utils.ts # Compressao de imagem para vision APIs
│   │   ├── assistant-shared.ts # Logica compartilhada entre AI assistant in-app e WhatsApp
│   │   ├── ai-actions.ts, ai-cache.ts, ai-context.ts, ai-local-parser.ts, ai-rate-limit.ts, ai-tools.ts
│   │   └── parser/        # Invite Parser modular (types, interface, ocr, groq-event-parser, pilot-parser, index)
│   ├── services/          # Camada canonica de regra de negocio (chamada por actions, api e tools)
│   │   ├── swap.ts        # createSwapRequest, respondToSwapRequest, listPendingSwapsForUser
│   │   ├── expenses.ts    # createExpense, updateExpenseStatus, deleteExpense + notifications
│   │   ├── notes.ts       # createNote, updateNote, deleteNote
│   │   ├── checkin.ts     # createCheckin com chat broadcast
│   │   └── decisions.ts   # createDecision, castVote, addArgument + auto-resolution
│   ├── whatsapp/          # Modulo WhatsApp IA (Kindar Assistente)
│   │   ├── types.ts       # Tipos do payload Meta Cloud API + WASessionState (incl. receipt_step para G4)
│   │   ├── client.ts      # Cliente Meta API (enviar texto, botoes, templates, download midia)
│   │   ├── signature.ts   # Verificacao HMAC-SHA256 do webhook
│   │   ├── identity.ts    # Resolucao phone → profile + selecao de grupo
│   │   ├── session.ts     # Estado da conversa (confirmacoes pendentes + receipt multi-step)
│   │   ├── processor.ts   # Pipeline central (identity → session → approvals → receipt → parser → tools)
│   │   ├── approvals.ts   # Codec do protocolo approve:swap:<uuid> | reject:swap:<uuid>
│   │   ├── notify.ts      # notifyGroupViaWhatsApp + notifyApprovalRequest (botoes aprovar/recusar)
│   │   ├── formatter.ts   # Formatacao de resposta (markdown → WhatsApp, limite 4096 chars)
│   │   └── media.ts       # Download de midia + OCR de recibos/receitas via vision AI
│   ├── constants.ts  # Constantes do app (cores, categorias, checklist items)
│   ├── calendar-utils.ts  # Utilidades de data/calendario + computeSwapBalance()
│   ├── recurrence-utils.ts # Motor de recorrencia (diario, semanal, etc.)
│   ├── push.ts       # Push notifications (web-push VAPID + APNs nativo)
│   ├── payments.ts   # Sistema de pagamento unificado (Apple IAP + Stripe)
│   ├── payment-platform.ts # Deteccao de plataforma (apple_iap vs stripe)
│   ├── native-init.ts # Init centralizado do native shell (StatusBar, Push, Keyboard)
│   ├── auth-utils.ts # Verificacao de grupo
│   ├── ical.ts       # Gerador iCalendar (RFC 5545)
│   ├── chat-notify.ts # Notificacoes automaticas no chat
│   ├── group-utils.ts # getActiveGroup() para multi-grupo
│   ├── capacitor.ts   # Bridge para Capacitor (haptics, status bar, splash screen)
│   ├── haptics.ts     # Haptic feedback (Capacitor nativo + Web Vibration fallback)
│   ├── posthog.ts, posthog-server.ts # Analytics PostHog
│   ├── tone-moderator.ts # Analise de tom para chat
│   ├── health-constants.ts, sbp-vaccine-calendar.ts, who-growth-data.ts
│   └── brazilian-holidays.ts # Feriados nacionais BR (fixos + moveis)
├── capacitor.config.ts # Configuracao do Capacitor (iOS/Android)
└── middleware.ts      # Auth middleware
```

### Padrao Server/Client Split

O app segue um padrao consistente em **36+ paginas**:

1. **`page.tsx` (Server Component)**: busca dados via Supabase Server Client, verifica autenticacao com `getUser()`
2. **`*Client.tsx` (Client Component)**: recebe dados serializados via props, usa `useI18n()` para traducoes, gerencia interatividade

Exemplos: `DashboardClient`, `SaudeClient`, `ProfileContent`, `FinancialDashboard`, `CalendarClient`, `ChatRoom`, `CheckinClient`, `AcordosClient`, `DecisionsClient`, etc.

### Queries sem FK Joins

Todos os PostgREST FK joins (ex: `expenses(*, profiles(*))`) foram **removidos** e substituidos por queries separadas com joins manuais em JavaScript. Isso evita problemas com RLS e melhora a previsibilidade das queries.

### Fluxo de Autenticacao

1. Middleware intercepta todas as requisicoes
2. Atualiza sessao Supabase via cookies
3. Redireciona usuarios nao autenticados para `/login`
4. Redireciona usuarios autenticados de `/login` para `/dashboard`
5. Rotas publicas: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/convite`
6. **Todas as Server Actions usam `getUser()`** (nao `getSession()`) para verificacao segura de autenticacao
7. **Remember-me**: checkbox "Lembrar-me" no login — se marcado (padrao), sessao persiste 30 dias via cookie `maxAge`; se desmarcado, cookie expira ao fechar o navegador (fix Safari/iOS)
8. **Middleware usa `getUser()`** em vez de `getSession()` (`src/lib/supabase/middleware.ts`): `getSession()` apenas le o JWT localmente sem chamada de rede, entao nunca renova access tokens expirados. Em Safari, ao fechar e reabrir o navegador apos o access token expirar (~1h), o middleware via `getSession()` via sessao expirada e redirecionava para login. `getUser()` faz chamada de rede ao Supabase Auth, valida a sessao e dispara refresh do token quando o access token expirou mas o refresh token ainda e valido
9. **Safari ITP Session Recovery** (pagina `/session-recovery` + localStorage backup):
   - Safari ITP pode limpar cookies de autenticacao ao fechar o navegador
   - `AuthSessionProvider` (`src/components/AuthSessionProvider.tsx`) faz backup dos tokens no localStorage a cada mudanca de auth e a cada visibilitychange
   - Quando middleware nao encontra sessao nos cookies, redireciona para `/session-recovery?next=/pagina-original` (nao para `/login`)
   - `/session-recovery` verifica localStorage, restaura sessao via `setSession()`, e redireciona para a pagina original
   - Se tokens invalidos/expirados, redireciona para `/login`
   - Usuario ve spinner "Restaurando sua sessão..." em vez do formulario de login
   - No logout, localStorage backup e limpo automaticamente

---

## Internacionalizacao (i18n)

### Visao Geral
- **5 idiomas**: Portugues (BR), Ingles, Espanhol, Frances, Alemao
- **~1488 chaves** de traducao por locale
- **40 secoes** tematicas

### Arquitetura
- Arquivos JSON em `src/i18n/locales/{pt,en,es,fr,de}.json`
- `I18nProvider` envolve o layout do app em `src/app/(app)/layout.tsx`
- Hook `useI18n()` disponivel em todos os Client Components
- `LanguageSelector` na pagina `/perfil` permite troca de idioma
- Preferencia salva no perfil do usuario (campo `locale` em `profiles`)

### Como Usar

```typescript
// Em qualquer Client Component:
import { useI18n } from "@/i18n";

function MeuComponente() {
  const { t } = useI18n();
  return <h1>{t("dashboard.welcome")}</h1>;
}
```

### Secoes de Traducao (38 total)

common, nav, dashboard, calendar, chat, checkin, expenses, financial, health, children, documents, agreements, events, activities, sensitive, school, profile, family, invitations, onboarding, more, notifications, settlements, swap, schedule, export, appointments, medications, illnesses, allergies, vaccines, growth, professionals, decisions, newForm, notes, ai, activityReport, inviteParser, symptomDiary.

---

## Seguranca

### Correcoes Aplicadas (65 total)

**13 fixes de autorizacao:**
- Verificacao de autorizacao em events, expenses, calendar
- Validacao de input com `Number.isFinite` para valores numericos
- `revalidatePath` em todas as actions para invalidar cache corretamente

**38 arquivos migrados de `getSession()` para `getUser()`:**
- `getUser()` valida o token JWT no servidor (seguro)
- `getSession()` apenas le o token do cookie (pode ser falsificado)
- Todos os Server Actions e Server Components agora usam `getUser()`

**Chat:**
- Fix de atualizacao otimista (duplicacao de mensagens)
- Fix de memory leak no listener Realtime
- Read receipts com `Promise.allSettled` (nao falha se um receipt der erro)
- Exportacao com filtro por canal

---

## Performance

### Otimizacoes Aplicadas

**Calendario:**
- `Promise.all()` para executar 8 queries em paralelo (members, custody_events, activities, events, appointments, swaps, reports, checklist_completions)
- Resiliencia: cada query tem `.then(r => r, () => ({ data: [] }))` — falha individual nao derruba a pagina
- Range reduzido de 6 meses para 3 meses (1 atras + 1 a frente) para evitar timeout
- `.limit()` em todas as queries: activities(100), events(200), activity_reports(500), checklist_completions(1000)
- `useMemo` no grid mensal para evitar recalculos desnecessarios
- `useCallback` nos handlers de click/navegacao
- Fix de timezone: `getBrazilNow()` para horario correto no fuso BR

**Dashboard:**
- 5 queries de `custody_events` consolidadas em 1 unica query
- Todas as queries do dashboard executam em paralelo
- Resiliencia: cada query nas 3 batches paralelas tem `.then(r => r, () => ({ data: [] }))` — falha individual nao derruba a pagina

**Chat:**
- Cache LRU em memoria (ate 5 canais) para troca instantanea de canais
- Client-side channel switching sem reload de pagina

**Modulo Saude:**
- `select("*")` substituido por colunas especificas em todas as paginas de saude (medicamentos, consultas, doencas, profissionais, crescimento, vacinas)
- `.limit()` adicionado em todas as queries sem cap de seguranca (50-500 conforme contexto)
- Queries independentes paralelizadas com `Promise.all()` (ex: symptom_entries + illness_episodes em sintomas)
- Dados pre-computados no server (progressMap em medicamentos) em vez de funcoes passadas ao client — Next.js 16 proibe funcoes como props de Client Components
- Interfaces TypeScript tipadas (Medication, Dose) substituem `any` em MedicamentosClient

**Check-in:**
- 3 queries sequenciais convertidas em `Promise.all()` paralelo
- Prop `children` renomeada para `childrenList` (regra React `react/no-children-prop`)

**Despesas:**
- `select("*")` substituido por colunas especificas + `.limit(200)`
- Type casts `as any` substituidos por `as unknown as Type` (strict TypeScript)

**Criancas:**
- `select("*")` substituido por colunas especificas (id, full_name, birth_date, gender, photo_url, blood_type, notes, allergies)

**Financeiro:**
- `.limit(10000)` reduzido para `.limit(500)` nas queries de despesas

**Chat:**
- `select("*")` substituido por colunas especificas em 3 queries de chat_channels

**Decisoes:**
- `select("*")` substituido por colunas especificas + `.limit(100)`

**Geral:**
- Dynamic imports para 6 componentes pesados (AIAssistant, GrowthChart, etc.)
- `React.memo` em ChatRoom MessageBubble
- `useMemo` em DashboardClient, FinancialDashboard, CalendarGrid e `useCallback` em componentes frequentemente re-renderizados
- i18n lazy loading (apenas locale padrao carregado, demais sob demanda)
- Performance indexes no banco (migration 00025)
- PostHog: 30+ eventos rastreados em todas as actions
- Sentry: error tracking em producao
- Calendar API otimizada (range reduzido + queries paralelas, sem timeout)
- Landing page otimizada (cookie check antes de `getUser()`)
- Regra geral: todas as queries usam colunas especificas (nunca `select("*")`), `.limit()` de seguranca, e `Promise.all()` para queries independentes

---

## Banco de Dados (PostgreSQL via Supabase)

### Enums

| Enum | Valores |
|------|---------|
| user_role | parent, grandparent, caregiver, mediator, lawyer |
| member_role | admin, member, readonly |
| custody_type | regular, holiday, swap, vacation, special |
| expense_category | education, health, food, clothing, transport, leisure, housing, other |
| approval_status | pending, approved, rejected, disputed |
| health_log_type | fever, medication, mood, screen_time, food, sleep, weight, height, vaccine, other |
| document_category | personal, health, education, legal, other |
| swap_status | pending, approved, rejected, cancelled |
| notification_type | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system, activity, activity_reminder, event_request, event_response, event_changed, birthday_reminder |
| invitation_status | pending, accepted, expired, revoked |

### Tabelas (~68 em origin/main, 14/05/2026)

> Aos numeros desta secao: este indice cobre o nucleo historico (47 numeradas no schema original). As tabelas adicionadas pos-24/04/2026 estao listadas na sub-secao "Tabelas Pos-Foundation" no final desta secao.

#### 1. profiles
Extensao da tabela `auth.users` do Supabase. Criado automaticamente via trigger no signup.
- `id`, `full_name`, `display_name`, `email`, `phone`, `role` (user_role), `avatar_url`, `locale`, `lgpd_consent_at`
- `quick_actions` (jsonb, nullable) — preferencia de botoes de acao rapida do usuario. Formato: `{ "primary": "<action_id>", "secondary": ["<id>", ...] }`. `NULL` = usar padroes do app. Atualizado via `updateQuickActions` em `src/actions/profile.ts`.

#### 2. coparenting_groups
Grupo familiar que conecta os responsaveis.
- `id`, `name`, `created_by` (FK profiles), `custody_enabled` (BOOLEAN, default false para novos, true para existentes)

#### 3. group_members
Associacao usuario-grupo com papel.
- `group_id`, `user_id`, `role` (member_role), `joined_at`
- Constraint UNIQUE em (group_id, user_id)

#### 4. children
Criancas vinculadas ao grupo.
- `id`, `group_id`, `full_name`, `birth_date`, `photo_url`, `allergies` (TEXT[]), `notes`
- **Campos adicionais:** `cpf` (TEXT), `rg` (TEXT)

#### 5. custody_events
Eventos de guarda no calendario.
- `group_id`, `child_id`, `responsible_user_id`, `start_date`, `end_date` (DATE)
- `custody_type`, `notes`, `created_by`
- `start_time`, `end_time` (TIME) - para eventos com horario
- `is_recurring` (BOOLEAN), `recurrence_rule` (TEXT)

#### 6. expenses
Despesas compartilhadas.
- `group_id`, `child_id` (opcional), `category`, `description`, `amount` (NUMERIC 10,2)
- `paid_by`, `split_ratio` (JSONB, default 50%), `receipt_url`
- `status` (approval_status), `approved_by`, `expense_date`

#### 7. chat_messages
Mensagens do chat do grupo. **Legalmente imutaveis** - triggers impedem delecao e alteracao do texto.
- `group_id`, `sender_id`, `text`, `audio_url`, `image_url`
- `reply_to_id` (auto-referencia), `is_pinned`, `read_by` (JSONB)
- `channel_id` (FK chat_channels, opcional)

#### 8. health_logs
Registros de saude da crianca.
- `child_id`, `log_type`, `value`, `notes`, `logged_by`, `logged_at`

#### 9. documents
Documentos compartilhados.
- `group_id`, `child_id`, `category`, `name`, `file_url`, `file_size`, `mime_type`, `uploaded_by`

#### 10. swap_requests
Solicitacoes de troca de dias de guarda.
- `requester_id`, `target_user_id`, `original_date`, `proposed_date`, `reason`, `status`

#### 11. daily_checkins
Check-ins rapidos do dia a dia.
- `group_id`, `child_id`, `logged_by`, `checkin_date`, `category`, `title`, `description`

#### 12. calendar_tokens
Tokens para sincronizacao iCal com celular.
- `user_id`, `group_id`, `token` (UNIQUE, hex de 32 bytes)

#### 13. notifications
Sistema de notificacoes.
- `user_id`, `type`, `title`, `message`, `link`, `is_read`

#### 14. invitations
Convites para juntar-se ao grupo.
- `group_id`, `invited_by`, `email`, `phone`, `token`, `status`, `expires_at`

#### 15. child_activities
Atividades recorrentes das criancas (futsal, natacao, dentista, etc.).
- `id`, `group_id`, `child_id` (nullable — NULL = todos os filhos), `name`, `category`
- `recurrence_type` (never, daily, weekly, biweekly, monthly, yearly, custom)
- `start_date`, `end_date`, `days_of_week` (JSON array), `day_of_month`
- `custom_interval`, `custom_unit` (day, week, month)
- `time_start`, `time_end` (TIME), `location`, `notes`
- `is_active` (BOOLEAN), `created_by`
- **Campos extras (migration 00028):** `teacher_name`, `class_name`, `room`, `responsible_id` (FK profiles)

#### 16. activity_checklist_items
Itens do checklist de cada atividade (materiais para preparar).
- `id`, `activity_id` (FK child_activities), `name`, `sort_order`

#### 17. checklist_completions
Registro de itens marcados como concluidos por ocorrencia.
- `id`, `activity_id`, `item_id` (FK activity_checklist_items), `occurrence_date` (DATE)
- `completed_by`, `completed_at`
- UNIQUE constraint em (item_id, occurrence_date)

#### 18. settlements
Acertos financeiros entre responsaveis.
- `id`, `group_id`, `from_user_id`, `to_user_id`, `amount`, `status`, `confirmed_at`

#### 19. child_education
Informacoes escolares da crianca (relacao 1:1 com children).
- `id`, `child_id` (FK children, UNIQUE), `school_name`, `school_address`, `school_phone`
- `grade`, `teacher_name`, `coordinator_name`
- `entry_time`, `exit_time` (TIME)
- `extracurriculars` (TEXT)
- Migration: `00022_child_profile_tabs.sql`

#### 20. private_notes
Notas privadas do usuario (nao compartilhadas).
- `id`, `user_id`, `title`, `content`, `created_at`, `updated_at`
- Migration: `00019_private_notes.sql`

#### 21. decisions
Decisoes em grupo com votacao.
- `id`, `group_id`, `title`, `description`, `status`, `created_by`
- Migration: `00020_decisions.sql`
- **Resolucao (regra unica)**: `services/decisions.ts:computeDecisionOutcome` decide o `status` para os 3 surfaces — `aprovada` SO quando TODOS os membros do grupo votam `concordo`; um `discordo` veta (`rejeitada`); encerrar manualmente sem quorum -> `expirada`. Usada por `resolveDecisionIfReady` (auto ao votar), `closeDecision` (encerramento) e `api/decisions/vote`. Native so delega + le `status` (bug 2026-06-22: `closeDecision` aprovava por maioria dos votos lancados).

#### 22. chat_channels
Canais tematicos de chat.
- `id`, `group_id`, `name`, `description`, `created_by`
- Migration: `00021_chat_channels.sql`

#### 23. health_views
Rastreamento de visualizacoes de registros de saude.
- `id`, `user_id`, `record_type`, `record_id`, `viewed_at`
- Migration: `00015_health_views.sql`

#### 24. activity_reports
Relatorios de conclusao de atividades recorrentes.
- `id`, `group_id`, `activity_id` (FK child_activities), `occurrence_date` (DATE)
- `reported_by` (FK profiles), `status` (completed/missed/cancelled)
- `notes`, `child_mood` (happy/neutral/sad/anxious/tired)
- `responsible_override` (FK profiles) — permite trocar responsavel por ocorrencia
- `overrides` (JSONB, default '{}') — armazena edits de ocorrencia unica (nome, horario, local)
- UNIQUE(activity_id, occurrence_date)
- Migrations: `00023_activity_reports.sql`, `00027_activity_responsible_override.sql`, `00029_activity_occurrence_overrides.sql`

#### 25. events (expandida)
Eventos sociais do grupo.
- `id`, `group_id`, `title`, `description`, `event_date`, `location`
- `assigned_to` (FK profiles) — responsavel pelo evento
- `end_date` (DATE) — para eventos multi-dia
- `all_day` (BOOLEAN) — flag de dia inteiro
- Migration: `00024_events_assigned_to.sql`

#### 26. sensitive_notes (expandida com delecao dual-approval)
Temas sensiveis com rastreamento de delecao.
- Campos originais + `deletion_requested_by` (FK profiles), `deletion_requested_at` (TIMESTAMPTZ)
- Migration: `00026_sensitive_topic_deletion.sql`

#### 27. ai_event_logs
Logs de execucao do Invite Parser para analise de qualidade.
- `id`, `user_id` (FK profiles), `group_id` (FK coparenting_groups), `raw_text`, `parsed_json` (JSONB)
- `success` (BOOLEAN), `parser_type` (TEXT), `processing_time_ms` (INTEGER), `ocr_confidence` (FLOAT), `created_at`
- Migration: `00030_ai_event_logs.sql`

#### 28. ai_requests
Logging de requests ao sistema de IA para monitoramento e debug.
- `id`, `user_id`, `provider` (TEXT), `model` (TEXT), `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `success` (BOOLEAN), `error` (TEXT), `created_at`

#### 29. usage_events
Tracking de uso para monetizacao futura.
- `id`, `user_id`, `group_id`, `event_type` (TEXT), `metadata` (JSONB), `created_at`

#### 30. event_requests
Sistema de aprovacao para alteracoes em eventos por usuarios nao-criadores.
- `id`, `group_id` (FK), `event_id` (FK events), `requester_id` (FK profiles)
- `affected_user_ids` (UUID[]) — todos os impactados pela mudanca
- `action_type` (TEXT: edit, cancel, reschedule, delete)
- `proposed_changes` (JSONB) — mudancas propostas
- `original_snapshot` (JSONB) — estado original do evento no momento do request
- `status` (TEXT: pending, approved, rejected, cancelled_by_system)
- `approval_mode` (TEXT: any, all) — MVP usa 'any'
- `cancelled_reason` (TEXT) — motivo do cancelamento automatico
- `responded_by` (FK profiles), `responded_at` (TIMESTAMPTZ)
- Constraint: max 1 request pendente por evento (partial unique index)
- Migration: `00045_event_requests_and_history.sql`

#### 31. event_history
Audit trail completo de todas as alteracoes em eventos.
- `id`, `event_id` (FK events), `group_id`
- `action_type` (TEXT: created, updated, cancelled, deleted, request_created, request_approved, request_rejected, request_cancelled)
- `performed_by` (FK profiles)
- `before_snapshot` (JSONB), `after_snapshot` (JSONB)
- `metadata` (JSONB) — info extra como request_id, reason, impact_type
- Migration: `00045_event_requests_and_history.sql`

#### 32-38. Tabelas adicionais
Incluem: `push_subscriptions`, `chat_channel_reads`, `agreements`, `school_logs`, `appointments`, `medications`, `medication_doses`, `illness_episodes`, `allergies`, `medical_info`, `vaccination_records`, `growth_records`, `professionals`, entre outras criadas nas migrations de saude e financeiro.

#### 39. collab_reads (Foundation: Collaborative Records — Fase 1)
Tabela única polimórfica de read receipts. Uma linha por `(record_type, record_id, user_id)` quando o user abre o detalhe do record.
- `record_type` (TEXT — ex: `'school_log'`, futuro: `'decision'`, `'health_event'`)
- `record_id` (UUID — points to the row in that module's table)
- `user_id` (FK profiles ON DELETE CASCADE)
- `read_at` (TIMESTAMPTZ, default `now()`)
- **PK**: `(record_type, record_id, user_id)` — idempotente, INSERT ... ON CONFLICT DO NOTHING via RPC
- **RLS**: user só insere a sua linha; user + coparentes do mesmo grupo conseguem ler ("Visto por Amanda · 14:32")
- **Group lookup**: função `collab_record_group(record_type, record_id)` resolve o grupo via WHEN branch por tipo (cada adoção adiciona uma branch)
- **RPC**: `mark_collab_read(p_record_type, p_record_id)` é o único caminho de escrita do client
- **Auto-mark creator**: cada tabela colaborativa tem um trigger `<table>_auto_mark_creator_read` que insere row pro `logged_by`/`created_by` na criação — o autor não vê o próprio registro como "novo"
- Migration: `00077_collab_foundation.sql`
- Consumido por: `src/lib/services/collab.ts` (notifyCollabCreate + unreadCollabCount) + `src/actions/school.ts:markSchoolLogRead` + `kindar-native/app/_src/services/school.ts:fetchSchoolLogReads,markSchoolLogRead`
- Ver `.claude/CLAUDE.md` seção "Foundation: Collaborative Records" pro pattern de adoção.

#### 39b. school_logs (extensão Fase 1)
- Coluna nova: `priority public.collab_priority NOT NULL DEFAULT 'info'` — enum `('info','important','urgent')` compartilhado entre todos os módulos colaborativos
- Index: `idx_school_logs_priority (group_id, priority)`
- Trigger: `school_logs_auto_mark_creator_read` AFTER INSERT — popula `collab_reads` pro `logged_by` automaticamente

#### 39c. expenses (extensão Fase 1B — Edit/Cancel/Reopen + Audit)
- **Status enum estendido** (`approval_status`): adicionados labels `cancelled` (criador cancelou) e `cancel_pending` (criador pediu cancelar despesa já aprovada, aguardando concordância do reviewer)
- **Coluna nova**: `priority public.collab_priority NOT NULL DEFAULT 'info'`
- **Novas colunas de tracking**:
  - `rejected_by`, `rejected_at` — quem rejeitou e quando
  - `cancel_requested_by`, `cancel_requested_at`, `cancel_reason` — pedido de cancel
  - `cancelled_by`, `cancelled_at` — quem confirmou o cancel
  - `edited_at`, `edit_count` — última edição + contagem (chip "editada" no UI)
- **Indexes novos**:
  - `idx_expenses_priority (group_id, priority)`
  - `idx_expenses_group_status_created (group_id, status, created_at DESC)` — drives o feed principal
- **Trigger**: `expenses_auto_mark_creator_read` AFTER INSERT
- Migration: `00078_collab_expenses_edit_audit.sql`

#### 40. expense_history (Audit trail — Fase 1B)
Audit trail imutável de despesas. Padrão a replicar pra outros módulos quando precisarem de "quem mexeu no quê".
- `id`, `expense_id` (FK → expenses ON DELETE CASCADE), `actor_id` (FK → profiles)
- `action TEXT CHECK IN ('created','edited','approved','rejected','cancel_requested','cancelled','reopened','restored')`
- `before JSONB`, `after JSONB` — snapshots dos campos editáveis (drive "valor R$X → R$Y" no UI)
- `reason TEXT` — obrigatório pra ações 'rejected', 'cancelled', 'reopened', 'restored'
- `at TIMESTAMPTZ` — auto now()
- **RLS**: `expense_history group read` (qualquer membro do grupo) + `expense_history self insert` (`actor_id = auth.uid()` AND member). **SEM UPDATE/DELETE policies — imutável.**
- **Index**: `idx_expense_history_expense_at (expense_id, at DESC)` pro audit panel
- Migration: `00078_collab_expenses_edit_audit.sql`
- Helper: `src/lib/services/expense-history.ts:logExpenseHistory(...)` — fire-and-forget
- Consumido por: panel inline no card expandido (PWA + native), backfill retroativo de evento 'created' pra expenses pré-migration

#### 41. Saúde Foundation adoption — Fase 3 (migration 00080)
Saúde adota a Foundation: Collaborative Records pra 5 tabelas que envolvem coordenação aguda entre coparentes. Pattern idêntico ao Escola+Despesas; vide `.claude/CLAUDE.md` "Foundation: Collaborative Records" e "Adoção #3" pro pattern.

**Tabelas que adotam (5):**
- `medical_appointments` — coluna `priority` (default `important`), trigger `medical_appointments_auto_mark_creator_read`, WHEN branch `medical_appointment` em `collab_record_group()`
- `illness_episodes` — coluna `priority` (default `important`), trigger `illness_episodes_auto_mark_creator_read`, WHEN branch `illness_episode`, **trigger BEFORE INSERT/UPDATE `illness_episodes_grave_to_urgent`**: quando `severity='grave'` E `priority='important'` (default), promove pra `'urgent'` automaticamente. Respeita override explícito do cliente.
- `active_medications` — coluna `priority` (default `important`), trigger `active_medications_auto_mark_creator_read`, WHEN `active_medication`
- `child_allergies` — coluna `priority` (default `important`), trigger `child_allergies_auto_mark_creator_read`, WHEN `child_allergy`
- `vaccination_records` — coluna `priority` (default `info`; registro informacional, sem urgência operacional), trigger `vaccination_records_auto_mark_creator_read`, WHEN `vaccination_record`

**Indexes pra dashboard query:** `idx_<tabela>_priority (group_id, priority)` em cada uma das 5.

**Função genérica:** `saude_auto_mark_creator_read()` (1 função PL/pgSQL com TG_ARGV[0]=record_type) usada nos 5 triggers — reuso vs 5 funções idênticas.

**Backfill:** insere `collab_reads` row pra cada `created_by` histórico nas 5 tabelas, idempotente via PK. Sem isso, todo registro pré-migration apareceria como "Novo" pro próprio criador.

**Migration:** `00080_collab_saude.sql`

**Consumido por:**
- PWA: `src/actions/health.ts` (createAppointment / createMedication / createIllnessEpisode / createAllergy / createVaccinationRecord) + `src/app/api/health/allergies/route.ts` (POST) + `src/app/api/health/vaccines-bulk/route.ts` (POST com fan-out paralelo, coalescing 60s dedup no device).
- Wrapper: `src/lib/services/health-collab.ts:notifySaudeCreate({recordType, recordId, groupId, actorUserId, actorFirstName, childFirstName?, description, priorityOverride?})` — server-only.
- Native: `kindar-native/app/_src/services/health.ts` (createIllness/createAppointment/createMedication/createVaccinationRecord) via `safeWrite({returnInsertedId: true})` → `saude-collab.ts:notifySaudeCreateNative({recordType, recordId, description})` → `POST /api/health/notify-create` (valida ownership + resolve nomes server-side).
- Dashboard tile **consolidada** "Saúde · N novos" (PWA + Native) — agregado dos 5 record_types.

**Fora da adoção (anti-spam, deliberado):** `medication_doses` (várias/dia), `symptom_entries` (alto volume + coalesce no episode parent), `growth_records` (medição rotineira), `child_medical_info` (update raro), `medical_professionals` (diretório).

**Pendência conhecida (Fase 3.5):** chip "Novo" + chip de priority + "Visto por X · time" + `mark_collab_read` inline em cada uma das 5 telas de Saúde. Adiciona valor incremental mas Foundation entrega 80% sem isso.

#### 43-47. Tabelas usadas pelo Kindar Native (mapeadas agora no native)

**43. custody_schedules** — Pattern da escala de guarda quinzenal (2 semanas = 14 dias), `UNIQUE(group_id, child_id)`.
- `group_id` (FK coparenting_groups), `child_id` (FK children)
- `pattern` (JSONB, array[14] de user_id ou null — weeks alternadas Dom→Sab)
- `start_date` (DATE), `months` (INT — duracao da geracao)
- `created_by` (FK profiles), `updated_at`
- **Consumido por:** `fetchSchedulePattern(groupId, childId)` no native com fallback que reconstroi pattern a partir de `custody_events` existentes

**44. custody_balance_operations** — Ajustes bilaterais de saldo de dias.
- `group_id`, `proposed_by`, `target_user_id`
- `operation_type` (TEXT: 'debit'|'waive'|'gift_day'|'forgive_balance'|'reset_balance'|'manual_adjustment')
- `status` ('pending'|'approved'|'rejected'|'cancelled')
- `days` (INT), `direction` ('to_proposer'|'to_target'), `notes` (TEXT), `swap_request_id` (FK swap_requests, opcional)
- `responded_by`, `responded_at`
- **UI Native:** `SwapBalanceCard` + `BalanceHistorySheet` + `ProposeBalanceAdjustmentSheet` (em `kindar-native/src/components/calendar/`)

**45. activity_reports** — Relatorio pos-ocorrencia de atividade.
- `activity_id` (FK child_activities), `occurrence_date` (DATE), `UNIQUE(activity_id, occurrence_date)`
- `status` ('completed'|'missed'|'cancelled')
- `child_mood` ('happy'|'neutral'|'sad'|'anxious'|'tired'), `notes` (TEXT), `reported_by`
- **UI Native:** `ActivityReportModal` acionado via botao "Relatar" no card de atividade
- **UX state-aware no dashboard (PWA + Native, 2026-05-06):** atividades do dia tem 3 estados visuais (`upcoming` / `ended-unreported` / `ended-reported`), classificados server-side com base em `time_end` real BR (`getBrazilNow` no PWA, `new Date()` no native) + presenca de `activity_report` para hoje. Encerrada-sem-relato mostra pill "Relatar" inline; encerrada-com-relato fica muted + check verde. A secao "Pendentes" cobre apenas dias passados (>=7d, <today) — hoje fica na propria secao "Hoje" para evitar duplicacao. Antes deste fix a atividade encerrada hoje so virava pendente no dia seguinte.

**46. checklist_completions** — Itens da checklist de atividade marcados como feitos.
- `activity_id`, `item_id` (FK activity_checklist_items), `occurrence_date`
- `UNIQUE(item_id, occurrence_date)`, `completed_by`
- **UI Native:** `ActivityChecklistModal` com toggle + progress bar

**47. daily_checkins, children, child_allergies, child_medical_info, child_education** — ja existiam, mas sao totalmente expostas no native:
- `child_education` exposto em `kindar-native/app/escola/index.tsx` com CRUD (tabs Info/Saude/Educacao do perfil)
- `daily_checkins` exposto em `kindar-native/app/checkin/index.tsx` (CRUD com seletor de categoria)
- `child_medical_info` (write) — endpoint `PUT /api/health/medical-info` (Bearer-auth) consumido pelo native via `services/health.ts:upsertMedicalInfo` (2026-04-27).
- `school_logs` (CRUD) — `kindar-native/src/services/school.ts` + aba "Registros" em `app/escola/index.tsx`. Antes era PWA-only (2026-04-27).
- `children.emergency_token` (rotate) — endpoint `POST /api/health/emergency/[childId]/regenerate` consumido por `services/health.ts:regenerateEmergencyToken` + botao em `/saude/emergencia` (2026-04-27).

### Storage Buckets usados no native

| Bucket | Tamanho max | MIME permitidos | Uso |
|--------|-------------|-----------------|-----|
| `documents` | 10MB | images, PDF, DOC | `/documentos` upload + chat images (prefix `{groupId}/chat/`) |
| `receipts` | 5MB | images, PDF | Comprovante em `/despesas/nova` |

#### 39-42. WhatsApp Integration (Migration 00043)

**39. whatsapp_phone_links** — Vinculacao de numero WhatsApp ao perfil do usuario.
- `id`, `user_id` (FK profiles), `phone_number` (TEXT, UNIQUE, E.164), `phone_hash` (TEXT, SHA-256)
- `verified_at`, `verification_code`, `verification_expires_at`
- `active_group_id` (FK coparenting_groups), `is_active` (BOOLEAN), `lgpd_consent_at`
- RLS: usuarios podem CRUD apenas seus proprios registros

**40. whatsapp_sessions** — Estado da conversa WhatsApp (confirmacoes pendentes, grupo ativo).
- `id`, `phone_number` (UNIQUE), `user_id` (FK profiles), `group_id` (FK coparenting_groups)
- `state` (JSONB — pending_action, pending_params, pending_at, awaiting_group_selection, group_options, **receipt_step**, **receipt_draft**)
- `last_message_at`, `message_count`
- RLS: apenas service role (webhook usa admin client)
- O campo `state` carrega tres maquinas de estado: confirmacao de acao (`pending_action`), selecao de grupo (`awaiting_group_selection`) e fluxo multi-step de recibo (`receipt_step` ∈ `category` | `child`).

**41. whatsapp_message_logs** — Log de todas as mensagens WhatsApp (entrada e saida).
- `id`, `phone_number`, `user_id` (FK profiles), `direction` (inbound/outbound)
- `message_type` (text/image/interactive/template/audio), `content`, `media_url`
- `wa_message_id`, `status`, `metadata` (JSONB)
- RLS: usuarios podem ler seus proprios logs

**42. whatsapp_notification_preferences** — Preferencias de notificacao WhatsApp por usuario.
- `id`, `user_id` (FK profiles, UNIQUE), `daily_summary`, `event_reminders`
- `expense_notifications`, `custody_alerts`, `quiet_hours_start`, `quiet_hours_end`
- RLS: usuarios podem CRUD seus proprios registros
- O modulo `lib/whatsapp/notify.ts` mapeia o tipo da notificacao (`expense | event | custody | approval | daily_summary`) para a coluna correspondente — opt-out por tipo (G3).

#### WhatsApp Tools (AI function-calling)

Lista exposta em `src/lib/ai/tools.ts` e roteada pelo assistente in-app + WhatsApp:

**Acoes (create*)**:
- `create_expense` — registra despesa (chama `services/expenses.ts:createExpense`)
- `create_event` — cria evento no calendario
- `create_appointment` — agenda consulta medica
- `create_checkin` — check-in diario (chama `services/checkin.ts`)
- `create_note` — nota privada (chama `services/notes.ts`)
- `create_activity` — atividade recorrente
- `create_decision` — decisao colaborativa (chama `services/decisions.ts`)
- `create_swap_request` — solicita troca de dia (chama `services/swap.ts`; dispara card de aprovacao no WhatsApp do alvo)
- `respond_swap_request` — aprova/recusa troca

**Consultas (get*)**:
- `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
- `get_pending_approvals` — inbox de pendencias (swap_requests aguardando o usuario)
- `get_child_status` — snapshot de saude por crianca (view `child_current_status`)
- `get_balance` — saldo de despesas pendentes entre coparentes (view `expense_balance_per_user`)
- `get_child_history` — timeline (consultas + episodios + medicacoes + eventos) dos ultimos N dias

**Comunicacao**:
- `draft_message` — ajuda a redigir mensagem ao coparente

#### WhatsApp pipeline (processor.ts)

Ordem de processamento de uma mensagem inbound:
1. **Audio** → transcribe via Whisper/Groq → reescreve como texto
2. **Identidade** → `whatsapp_phone_links` (vinculo + verificacao + grupo ativo)
3. **Sessao** → carrega `whatsapp_sessions.state`
4. **Selecao de grupo** (multi-grupo)
4.4. **Receipt multi-step** (G4) → list_replies de categoria/crianca
4.5. **Aprovacao** (G2) → `approve:swap:<uuid>` ou `reject:swap:<uuid>`
5. **Confirmacao pendente** → button confirm/cancel ou texto de confirmacao
6. **Imagem com caption** (G6) → caption router (`/receita`, `/atestado`, `/vacina`, `/exame`, default = recibo)
7. **Texto** → parser local PT-BR (12 patterns) → se confidence ≥ 0.7 chama tool diretamente; senao AI router (Groq → OpenAI fallback) com tools

Logs em `whatsapp_message_logs` (inbound + outbound). Historico recente filtrado por TTL de 30min e excluindo mensagens-ruido (G5).

### Tabelas Pos-Foundation (introduzidas apos 24/04/2026)

| # | Tabela | Migration | Funcao |
|---|--------|-----------|--------|
| 48 | `cron_logs` | 00052 | Logs de execucao de CRONs (name, success, processed, sent, errors JSONB, duration_ms) |
| 49 | `webhook_events` | 00061 | Idempotencia de webhooks Stripe/RevenueCat (event_id UNIQUE + processed_at) |
| 50 | `coupons` | 00060 | Cupons de desconto (code UNIQUE, max_uses, uses, valid_until) |
| 51 | `referral_clicks` | 00061 | Cliques em links de indicacao (referrer_user_id, clicked_at, ip_hash) |
| 52 | `referral_rewards` | 00061 | Recompensas dadas apos conversao (referrer_user_id, referred_user_id, reward_amount, status) |
| 53 | `onboarding_quests` | 00057 | Gamificacao: etapas individuais do onboarding marcadas como concluidas. Trigger `00125` marca `invite_co` quando o grupo chega a 2+ membros (paridade do quest PWA/iOS/Android — convidado nunca dispara `markQuestStep('invite_co')`) |
| 54 | `early_bird_counter` | 00056 | Counter atomico (current_count, max_count) — limite global do desconto Early Bird |
| 55 | `assistant_session_state` | 00072 | Estado persistente do Assistente IA in-app (memoria curta entre turns) |
| 56 | `calendar_occurrences` | 00038, 00074 | Ocorrencias derivadas de `child_activities` — geradas via trigger AFTER INSERT/UPDATE (banco como fonte de verdade) |
| 57 | `clinical_context_inferences` | 00050 | Inferencias de contexto clinico (medicacoes/episodios relacionados via heuristica de proximidade temporal) |
| 58 | `app_errors` | 00044 | Error tracking com classificacao por pasta + pipeline auto-fix (Claude → GitHub PR → Discord) |
| 59 | `retention_events` | 00041 | Eventos de retencao D+1/3/7/14 disparados pelo cron |
| 60 | `user_health_score` (view) | 00042 | View agregada: score de saude do user (frequencia de updates, doses confirmadas, etc.) |
| 61 | `child_current_status` (view) | 00065 | Snapshot de saude por crianca (illness_episodes + active_medications + child_allergies) — usado pela tool `get_child_status` |
| 62 | `expense_balance_per_user` (view) | 00065 | Saldo pendente derivado de expenses.split_ratio — usado pela tool `get_balance` |
| 63 | `custody_resolved` (view) | 00079 | View canonica de custodia (swap > exception > regular + created_at DESC tie-break) — defesa contra duplicacao |
| 64 | `collab_reads` | 00077 | Foundation: polimorfica (record_type, record_id, user_id, read_at) — read receipts compartilhados |
| 65 | `expense_history` | 00078 | Audit trail imutavel de despesas (Fase 1B): action ('edited'/'cancelled'/'cancel_requested'/'restored'/'reopened'), before/after JSONB, reason |
| 66 | `decision_votes` | 00020 | Votos em decisoes (concordo/discordo/vou pensar) — separado pra normalizacao |
| 67 | `decision_arguments` | 00020 | Argumentos pro/contra em decisoes |
| 68 | `subscriptions` (estendido) | 00039, 00053, 00054 | Assinatura escopada por GRUPO (nao por user), suporte multi-provider (Stripe + Apple IAP + Google + RevenueCat) |
| 69 | `plans` | 00039, 00051, 00055 | Catalogo de planos com IDs por provider (`apple_product_id`, `google_product_id`, `stripe_price_id`) |

### Seguranca (Row Level Security)

Todas as tabelas possuem RLS habilitado. Funcoes auxiliares:
- `is_group_member(group_id)` - verifica se o usuario pertence ao grupo
- `is_group_admin(group_id)` - verifica se o usuario e admin do grupo
- `collab_record_group(record_type, record_id)` — Foundation: resolve `group_id` polimorficamente por modulo (WHEN branch) para RLS de `collab_reads`

Politicas garantem que:
- Usuarios so veem dados dos seus proprios grupos
- Despesas so podem ser criadas pelo pagador (`paid_by = auth.uid()`)
- Nenhum usuario pode aprovar sua propria despesa (independente de role)
- Status de despesa nao pode regredir (approved/rejected nao voltam para pending)
- Acertos financeiros validam saldo devedor server-side (rejeita valor > saldo + R$0.01)
- Calculo de saldo financeiro considera apenas despesas aprovadas (pending/disputed excluidas)
- Limite de query de despesas: 10000 (para calculo preciso de saldo)
- Mensagens de chat sao imutaveis (sem DELETE, sem UPDATE no texto)
- Notificacoes sao privadas por usuario
- Tokens de calendario sao privados por usuario
- Notas privadas sao acessiveis apenas pelo autor
- Activity reports podem ser lidos e atualizados por membros do grupo
- Intervalo minimo entre doses de medicamento: 30 minutos (validacao server-side)
- Sanitizacao de input em campos de texto de saude (max length limits)
- `updateIllnessEpisode` rejeita valores de status invalidos
- Alergias usam service role para query (workaround de RLS)
- Temas sensiveis requerem dupla aprovacao para exclusao

### Migrations (83 em origin/main, ate 00080)

> Numeracao tem alguns gaps reservados/abandonados (00034) e dois pares com mesmo prefixo (00060, 00061, 00062, 00076) — sequencia foi paralelizada entre branches durante Fase 1/1B/3 da Foundation e mesclada com colisao deliberada (cada par cobre dominio distinto). Total fisico em main = 83 arquivos.


| Arquivo | Conteudo |
|---------|----------|
| `00001_initial_schema.sql` | Tabelas iniciais (12 tabelas), 9 enums, triggers, indexes |
| `00002_rls_policies.sql` | RLS + funcoes auxiliares + 22 policies |
| `00003_calendar_tokens.sql` | calendar_tokens, daily_checkins, campos recorrentes |
| `00004_fix_invitation_rls.sql` | Fix de RLS para invitations |
| `00005_health_module.sql` | Modulo de saude (appointments, medications, illnesses, allergies, etc.) |
| `00006_event_status_and_schedule_config.sql` | Status de evento e config de escala |
| `00007_push_subscriptions.sql` | Tabela push_subscriptions para web push |
| `00008_missing_tables_and_rls.sql` | Tabelas e RLS faltantes |
| `00009_financial_module_v2.sql` | Modulo financeiro v2 (settlements, split_ratio) |
| `00010_activities_checklist.sql` | child_activities, checklist_items, completions + RLS |
| `00011_rename_day_of_week_to_days.sql` | Rename coluna day_of_week para days |
| `00012_activity_all_children.sql` | child_id nullable em child_activities (opcao "Todos") |
| `00013_illness_hospital_severity.sql` | Campos hospital e severidade em doencas |
| `00014_appointment_type_return.sql` | Tipo de consulta (rotina/emergencia/retorno/exame) + data de retorno |
| `00015_health_views.sql` | Tabela health_views para rastreamento de visualizacoes |
| `00016_receipts_storage_bucket.sql` | Bucket de storage para comprovantes de despesa |
| `00017_health_indexes.sql` | Indexes otimizados para queries de saude |
| `00018_documents_storage_bucket.sql` | Bucket de storage para documentos |
| `00019_private_notes.sql` | Tabela private_notes + RLS |
| `00020_decisions.sql` | Tabela decisions + RLS |
| `00021_chat_channels.sql` | Tabela chat_channels + FK em chat_messages |
| `00022_child_profile_tabs.sql` | Campos cpf/rg em children + tabela child_education |
| `00023_activity_reports.sql` | Tabela activity_reports (status, humor, notas) + RLS |
| `00024_events_assigned_to.sql` | Campos assigned_to, end_date, all_day em events |
| `00025_performance_indexes.sql` | Indexes de performance (chat_messages channel, chat_channel_reads, swap_requests) |
| `00026_sensitive_topic_deletion.sql` | Campos de delecao dual-approval em sensitive_notes |
| `00027_activity_responsible_override.sql` | Campo responsible_override em activity_reports + policy UPDATE |
| `00028_activity_extra_fields.sql` | Campos teacher_name, class_name, room, responsible_id em child_activities |
| `00029_activity_occurrence_overrides.sql` | Campo overrides (JSONB) em activity_reports para edits de ocorrencia unica |
| `00030_ai_event_logs.sql` | Tabela `ai_event_logs` para logging do Invite Parser (raw_text, parsed_json, success, parser_type, processing_time_ms, ocr_confidence) |
| `00031_ai_requests.sql` | Tabela `ai_requests` para logging de requests IA |
| `00032_usage_events.sql` | Tabela `usage_events` para tracking de uso |
| `00033_group_custody_flag.sql` | Flag `custody_enabled` em coparenting_groups |
| `00035_emergency_token.sql` | Tokens de acesso de emergencia |
| `00036_children_sex.sql` | Campo sexo em children |
| `00037_symptom_diary.sql` | Diario de sintomas |
| `00038_calendar_occurrences.sql` | Ocorrencias de calendario |
| `00039_subscriptions.sql` | Tabela de subscricoes |
| `00040_onboarding_step.sql` | Campo onboarding_step em profiles |
| `00041_retention_events.sql` | Eventos de retencao |
| `00042_user_health_score.sql` | View user_health_score |
| `00043_whatsapp_tables.sql` | **WhatsApp Integration**: 4 tabelas (phone_links, sessions, message_logs, notification_preferences) + RLS + triggers |
| `00044_app_errors.sql` | Tabela de erros da aplicacao |
| `00045_event_requests_and_history.sql` | **Event Approval System**: tabelas event_requests + event_history + notification_type enum + RLS |
| `00046_swap_requests_rls_target_validation.sql` | Validacao RLS para swap requests |
| `00047_medical_appointments_delete_policy.sql` | Policy de delete para medical appointments |
| `00048_medication_episode_id.sql` | Campo episode_id em medications |
| `00049_health_views_null_unique.sql` | Views de saude com unique nullable |
| `00050_clinical_context_inferences.sql` | Inferencias de contexto clinico |
| `00051_apple_product_ids.sql` | **Apple IAP**: seta `apple_product_id` nos planos + indices para lookup por product_id e transaction_id |
| `00052_cron_logs.sql` | **Observabilidade de CRONs**: tabela `cron_logs` (name, success, processed, sent, errors JSONB, started_at, finished_at, duration_ms) + indices |
| `00053_subscriptions_multi_provider.sql` | **Billing multi-provider**: suporte a Stripe + Apple IAP + Google Play Billing + RevenueCat na mesma tabela `subscriptions` |
| `00054_subscriptions_per_group.sql` | Subscription escopada por grupo (em vez de por usuario) — todo o grupo herda o plano |
| `00055_plans_reprice_and_rename.sql` | Reprecificacao + rename de planos (Free / Premium / Elite → estrutura nova alinhada com `MONETIZACAO.md`) |
| `00056_early_bird_counter.sql` | Contador atomico de cupons Early Bird (limite global de N assinaturas com desconto) |
| `00057_onboarding_quest.sql` | Tabela `onboarding_quests`: gamificacao do onboarding com etapas marcadas individualmente |
| `00058_subscription_split.sql` | Split de subscription entre coparentes (dividir custo do plano 50/50, com aprovacao bilateral) |
| `00059_pix_payment_method_hint.sql` | Hint de metodo de pagamento Pix (Brasil) na escolha de plano |
| `00060_align_prices_with_providers.sql` | Sync de precos entre Stripe / Apple / Google (manter paridade visivel ao usuario) |
| `00060_coupons_and_admin.sql` | Tabela `coupons` + RLS admin-only + endpoint `/api/coupons/validate` |
| `00061_referrals.sql` | Sistema de indicacoes: `referral_clicks`, `referral_rewards`, codigo unico por user, reward apos conversao |
| `00061_webhook_events_idempotency.sql` | Tabela `webhook_events` com chave de idempotencia — Stripe/RevenueCat webhooks nao processam o mesmo evento 2x |
| `00062_early_bird_check_on_update.sql` | Trigger que reforca limite Early Bird tambem em UPDATE (nao so INSERT) |
| `00062_storage_rls_lockdown.sql` | Hardening RLS nos buckets `documents` e `receipts` (path-based isolation por grupo) |
| `00063_push_tokens_cleanup.sql` | Garbage collection de push tokens invalidados (APNs/FCM unregistered) |
| `00064_birthday_notification_type.sql` | **Lembrete de aniversario**: adiciona valor `birthday_reminder` ao enum `notification_type` (consumido por `/api/cron/birthday-reminders`, dispara D-7) |
| `00065_whatsapp_v2_views.sql` | **WhatsApp v2**: views read-only `child_current_status` (snapshot de saude por crianca derivado de illness_episodes + active_medications + child_allergies) e `expense_balance_per_user` (saldo pendente derivado de expenses.split_ratio). Usadas pelas tools `get_child_status` e `get_balance`. |
| `00066_whatsapp_phone_format.sql` | Normalizacao E.164 + indice unico em `whatsapp_phone_links.phone_number` |
| `00067_quick_actions_profile.sql` | Campo `quick_actions` JSONB em `profiles` (configuracao de acoes rapidas — primary + secondary) |
| `00068_custody_enabled_default_true.sql` | **Reversao critica**: `coparenting_groups.custody_enabled` volta a default `true` (revertido em 2026-05-05 apos bug de ativacao iOS que escondia toda a UI de guarda em grupos novos) |
| `00069_invitations_rls_coparents_can_cancel_delete.sql` | RLS: coparentes (nao so o convidador) podem cancelar/deletar convites pendentes do grupo |
| `00070_growth_records_rls_update_delete.sql` | RLS: permite UPDATE/DELETE de growth_records pelos membros do grupo (antes era insert-only) |
| `00071_swap_requests_requester_can_cancel.sql` | RLS: o solicitante de uma troca pode cancela-la enquanto status='pending' |
| `00072_assistant_session_state.sql` | Tabela `assistant_session_state`: contexto persistente do Assistente IA in-app (memoria curta entre turns) |
| `00074_calendar_occurrences_trigger.sql` | **Solucao definitiva** (Aline bug 2026-05-07): trigger AFTER INSERT/UPDATE em `child_activities` chama `generate_activity_occurrences()` PL/pgSQL — geracao de ocorrencias deixa de depender do client. Banco vira fonte de verdade. Lib JS no PWA+native continua como defesa em profundidade (UI otimista) com `ON CONFLICT DO NOTHING`. |
| `00075_calendar_occurrences_monthly_day_fix_and_cron.sql` | Fix de recorrencia mensal (dia 31 em meses curtos) + cron de regeneracao programada de occurrences distantes |
| `00076_custody_events_dedup_and_unique.sql` | Defesa parcial contra duplicacao de `custody_events` (predecessor do hardening total em 00079) |
| `00076_security_definer_views_invoker.sql` | Reduz risk surface das views SECURITY DEFINER — convertidas pra SECURITY INVOKER quando RLS do caller ja garante isolamento |
| `00077_collab_foundation.sql` | **Foundation: Collaborative Records — Fase 1**: tabela polimórfica `collab_reads` + enum `collab_priority` + função `collab_record_group()` + RPC `mark_collab_read()` + trigger `school_logs_auto_mark_creator_read`. Adiciona coluna `priority` em `school_logs`. Primeira camada do "sistema de sincronização familiar" — read receipts, unread state, prioridade compartilhados entre coparentes. |
| `00078_collab_expenses_edit_audit.sql` | **Foundation Fase 1B — Despesas**: adoption da foundation pra expenses (priority + trigger auto-mark + WHEN branch em `collab_record_group()`) + status enum estendido (`cancelled`, `cancel_pending`) + colunas de tracking (rejected_by/at, cancel_requested_*, cancelled_*, edited_at, edit_count) + tabela `expense_history` imutável com RLS scopeada por grupo + indexes (group_id, status, created_at DESC) pra perf. Habilita Edit/Cancel/Reopen com audit trail. |
| `00079_custody_integrity.sql` | **Calendário: integridade definitiva de `custody_events`** (Hailla bug 2026-05-13): view canônica `custody_resolved` (swap > exception > regular + created_at DESC tie-break) + função `custody_has_same_type_overlap()` + trigger BEFORE INSERT/UPDATE `custody_events_prevent_overlap` (rejeita overlap mesmo tipo) + cleanup de 43 dias de duplicatas em 7 grupos + EXCLUDE constraint `custody_events_no_overlap_same_type` (defesa em profundidade via daterange &&). 4 camadas. |
| `00080_collab_saude.sql` | **Foundation Fase 3 — Saúde**: adoption da foundation pra 5 tabelas (`medical_appointments`, `illness_episodes`, `active_medications`, `child_allergies`, `vaccination_records`) com priority + indexes + trigger genérico `saude_auto_mark_creator_read` (1 função, 5 instâncias via TG_ARGV) + trigger `illness_episodes_grave_to_urgent` (BEFORE INSERT/UPDATE — severity='grave' + priority='important' → 'urgent' automático server-side) + WHEN branches estendidas em `collab_record_group()` + backfill em 5 tabelas pros `created_by` históricos. Doses/sintomas/growth/info médica/profissionais ficam FORA (anti-spam). |

---

## Funcionalidades Implementadas

### 1. Dashboard (`/dashboard`)
- Saudacao personalizada com nome do usuario e data
- Card "Guarda ativa" com info de custodia por filho, streak de dias, proxima troca
- Visao da semana (7 dias com cores de guarda + feriados)
- **Alertas de saude**: medicamentos ativos, alergias criticas, consultas proximas, doencas ativas
  - **Medicamentos de uso continuo NAO aparecem na home**: query do dashboard filtra `active_medications` por `end_date IS NOT NULL` (so cursos agudos com data de fim definida disparam "Em tratamento" + chip "Confirmar dose"). Medicacao continua (`end_date = null`) fica restrita a `/saude/medicamentos`. Aplicado em PWA (`src/app/(app)/dashboard/page.tsx`) e nativo (`kindar-native/app/_src/hooks/useDashboard.ts`).
- **Atividades do dia/amanha**: cards com icone de categoria, horario, checklist preview
- **Eventos sociais** integrados na mesma secao de atividades
- **Decisoes pendentes** com urgencia e contagem de votos
- **Relatorios de atividade pendentes**
- Card "Agenda" com proximos compromissos (guarda especial + atividades + eventos)
- Resumo financeiro do mes com saldo entre responsaveis
- Despesas pendentes de aprovacao
- Check-ins recentes
- Acoes rapidas (Agenda, Despesas, Check-in, Chat, Saude, Documentos)
- **Performance**: queries consolidadas e paralelas com resiliencia a falhas individuais
- **i18n**: todas as strings traduzidas via `useI18n()`

### 2. Agenda Unificada (`/calendario`)
- **Grade mensal** estilo Apple com 7 colunas (Dom-Sab), pills coloridos
- Dias coloridos por responsavel (teal = 1o pai, coral = 2o pai)
- **Dots laranjas** nos dias que tem atividades/eventos
- Destaque do dia atual (ring)
- Navegacao entre meses (setas prev/next)
- Legenda com nomes e cores dos pais
- Botoes "Escala" e "+ Novo" no header
- **Ao clicar num dia**: sheet mostra guarda do dia + atividades + eventos (accordion)
- **Unifica** 3 conceitos: atividades recorrentes, eventos sociais e eventos de guarda
- **Fix de eventos no calendario**: query SELECT removia coluna `category` inexistente na tabela `events` (Supabase retornava null); categoria agora hardcoded como "evento"
- **Performance**: `Promise.all()` para 7 queries paralelas com resiliencia a falhas, `useMemo` no grid, `useCallback` nos handlers

### 3. Saldo de Trocas (Swap Balance) (`/calendario`)
- Componente `SwapBalanceCard` mostra +/- dias por responsavel
- Funcao `computeSwapBalance()` em `calendar-utils.ts`
- Considera trocas aprovadas que alteram a escala original
- Trocas sem data de retorno geram divida de 1 dia

### 4. Planejador de Fim de Semana (`/calendario`)
- Scroll horizontal com proximos 8 fins de semana
- Badges de status: "Livre" (verde), "Parcial" (amarelo), "Com voce" (azul)
- Facilita planejamento de viagens

### 5. Troca de Dias (Swap Requests) (`/calendario`)
- Tocar em um dia do outro responsavel abre modal de troca
- Selecionar data proposta para troca + motivo
- Lista de trocas pendentes com botoes Aprovar/Rejeitar
- Aprovacao gera novos eventos de guarda automaticamente
- **Troca como divida**: se o solicitante nao preenche a data de retorno, fica como divida de 1 dia

### 6. Escala de Guarda (`/calendario/escala`)
- **Escala opcional**: botao "Limpar escala" permite uso do app sem escala definida
- **Dashboard adapta** quando nao ha escala (oculta card de guarda ativa)
- **Padrao quinzenal**: grade de 14 dias (2 semanas x 7 dias)
- Tocar no dia alterna entre responsaveis (ciclo: vazio -> pai A -> pai B -> vazio)
- Botoes de preenchimento rapido por semana
- **4 modelos prontos:**
  - Semanas alternadas (1 semana cada)
  - 5-2 / 2-5 (semana + fim de semana alternado)
  - 3-4 / 4-3 (Seg-Qua / Qui-Dom alternado)
  - 2-3 + FDS alternado (Seg-Qua / Qui-Sex + fins de semana alternam)
- Seletor de data de inicio
- Duracao: 3, 6 ou 12 meses
- Preview de quantidade de eventos
- Gera eventos em lote no banco (batches de 100)
- **Limpar escala** (`clearCustodySchedule`): permite resetar escala existente

### 6b. Rotina de Leva & Busca (`/calendario/rotina`)
Camada de logistica diaria — quem LEVA (dropoff) e quem BUSCA (pickup) cada dia da semana. Complementar a guarda noturna e ORTOGONAL a ela (nao deriva de `custody_resolved`, nao materializa `calendar_occurrences` — resolvido no read). Serve TODA forma de familia (separados, casal intacto, solo, cuidador).
- **Editor** (`RoutineBuilder`): grade tap-to-cycle (Seg–Sex + FDS opcional) x [Leva][Busca] por crianca; atalho "dia inteiro"; modelos prontos; horario + destino opcionais; "aplicar a todos os filhos".
- **Painel adaptavel** (`RoutineTodayCard`): por `coparenting_groups.arrangement` — `rotating` (Heroi de Guarda como hoje) vs `together`/`single` (a rotina vira o heroi, sem "proxima troca"). Mostra "Hoje · quem leva/busca" humanizado; empty-state que ensina; aditivo (heroi de guarda intocado).
- **Trocar hoje** (override + ciencia bilateral): 1 toque passa a perna pro outro responsavel hoje (`care_routine_overrides`, vence o slot no read). Foundation collab `care_routine_override` → push + "Aguardando ciencia" pro criador / "[X] trocou · Confirmar" pro destinatario (`mark_collab_read`). NAO e aprovacao, e awareness.
- **Lembrete** (cron `/api/cron/activity-due-reminders`): `runCareRoutineReminders` dispara push calmo 30min antes (override vence o slot), idempotente via `care_routine_reminder_sends`.
- **Tabelas**: `care_routine_slots` (padrao semanal), `care_routine_overrides` (troca do dia), `care_routine_reminder_sends` (idempotencia), `coparenting_groups.arrangement` (forma da familia, default `rotating` = regressao-zero), `care_routine_logs` (Buscou?, 00115), `care_routine_slots.week_parity` (semana A/B, 00116). Migrations 00112–00116.
- **Service** unico `src/lib/services/care-routine.ts` (paridade): `actions/care-routine.ts` (PWA) + `api/care-routine/route.ts` + `today/route.ts` (Native Bearer, na allowlist do middleware).
- **i18n**: ~65 chaves `careRoutine.*` × 5 locales (PWA+Native). **Resolver puro** `src/lib/care-routine-resolve.ts` (+ core do cron) com testes unitarios.
- **Fase 2 — assistente** (migration 00115 `care_routine_logs`): **"Buscou? Sim/Nao"** no card (registra `done`/`missed` por perna passada; `recordRoutineLog` upsert) + **follow-up** cron "Buscou o X?" (pickup +45min, idempotente `channel=followup`). **Corresponsabilidade** NEUTRA (`care-routine-metrics.ts` — so contagens, sem %/ranking; premium Harmonia) na rotina page. **Timeline "Jornada da Crianca"** (`/jornada` + `care-routine-journey.ts`): compoe casa(guarda)→leva→atividades→busca→casa cronologico. **Briefing in-app "Amanha"** no card (resolve a rotina de amanha sem round-trip extra).
- **Fase 3 — recorrencia avancada** (migration 00116 `week_parity`): `alternating_week` (semana A/B, `weekParityOf`) + `custody_based` ("quem leva/busca segue a guarda" — responsavel derivado de `custody_resolved` no read). **Engine pronta+testada**; falta UI aditiva (editor de pattern_type + widget nativo — `docs/care-routine-widget-spec.md`).

### 7. Novo Compromisso (`/calendario/novo`) — Formulario Unificado Premium
Formulario inteligente que unifica a criacao de atividades, eventos e guardas com UX premium:
- **Seletor de categoria**: grid 4 colunas com icones grandes (2xl), 11 categorias incluindo Curso e Viagem
- **Design premium**: cards brancos rounded-2xl com shadow-sm, secoes com icones e labels uppercase tracking-wider
- **Progressive disclosure**: detalhes adicionais, checklist e notas em secoes colapsaveis (CollapsibleSection)
- **Responsavel com avatar**: mostra NOME (nao email) com iniciais coloridas em circulos, usa `getDisplayName()`
- **Selector de filhos com iniciais**: circulos coloridos com iniciais (Sage #5B9E85)
- **Recorrencia simplificada**: 3 opcoes rapidas (Unica vez / Semanal / Personalizar) com expansao progressiva
- **Touch targets**: minimo 44px em todos os botoes interativos
- **Botao submit fixo**: fixed bottom com gradiente, sempre visivel durante scroll
- **i18n completo**: 93 chaves de traducao via `useI18n()` com chaves em `newForm.*`
- **Campos variam por tipo** com ordem otimizada:
  - **Atividade**: categoria -> data -> filho(s) -> nome -> responsavel -> recorrencia -> horario/local -> detalhes (colapsavel) -> checklist (colapsavel) -> notas (colapsavel)
  - **Evento**: categoria -> titulo -> data/hora -> filho -> responsavel -> local -> descricao (colapsavel) -> imagem (colapsavel)
  - **Guarda**: categoria -> filho (botoes avatar) -> responsavel (botoes avatar) -> datas -> tipo -> horario -> recorrencia -> notas (colapsavel)
- Animacao suave fadeIn ao revelar campos

### 8. Sincronizacao com Celular (`/calendario`)
- Botao "Sincronizar com Celular"
- Gera token unico por usuario/grupo
- URL de assinatura iCalendar (RFC 5545)
- Instrucoes para iPhone (Ajustes -> Calendario -> Contas) e Android (Google Calendar -> Por URL)
- API Route: `GET /api/calendar/[token]` retorna `text/calendar`

### 9. Check-in Diario (`/checkin`)
- **8 categorias** com icones: Tempo de Tela, Alimentacao, Sono, Humor, Saude, Atividade, Escola, Outro
- Templates rapidos por categoria (ex: "Ficou 1h na tela", "Comeu hamburguer")
- Titulo + descricao opcional
- Timeline de check-ins recentes (hoje + ultimos 7 dias)
- **Integracao com Chat**: cada check-in envia mensagem automatica ao grupo

### 10. Dashboard Financeiro (`/financeiro`)
- **Progressive Disclosure via `custodyEnabled`**: adapta labels e visibilidade conforme tipo de grupo
  - `custodyEnabled=false`: exibe "Despesas da familia" em vez de linguagem de coparentalidade; oculta aba "Acertar Contas" e labels "quem deve a quem" quando ha apenas 1 membro
  - `custodyEnabled=true`: comportamento padrao com todas as funcionalidades de divisao
- **Aba Resumo:**
  - Navegacao por mes (setas prev/next)
  - Total do mes com contagem de despesas
  - Cards por responsavel com valor, barra de progresso e percentual
  - **Calculo de balanco** Splitwise-style com split_ratio configuravel (somente despesas aprovadas, pending/disputed excluidas)
  - Breakdown por categoria com barras de progresso
  - Lista de despesas do mes com status (Pendente/Aprovada/Rejeitada)
  - Botao "+ Nova Despesa"
- **Aba Historico:**
  - Cards por mes com total, barra empilhada de cores, valores por responsavel
  - Balanco mensal ("Equilibrado" ou "X deve R$ Y para Z")
  - Clicar no card navega para o Resumo daquele mes

### 11. Despesas (`/despesas`)
- Lista de despesas com icone de categoria, valor, status
- Botoes Aprovar/Rejeitar para despesas do outro responsavel
- **Auto-aprovacao bloqueada** — nenhum usuario pode aprovar sua propria despesa
- **Regressao de status impedida** — approved/rejected nao voltam para pending
- Cards de resumo (Total + Pendentes)
- **Upload de comprovantes** (JPG/PNG/HEIC/WebP/PDF) com visualizador (`ReceiptViewer`). Deteccao de PDF corrigida para URLs com query params
- **Exclusao de despesas** com confirmacao (`DeleteExpenseButton`)
- **Saldo calculado apenas com despesas aprovadas** (pending/disputed excluidas)
- **Limite de query**: 10000 para calculo preciso de saldo

### 12. Nova Despesa (`/despesas/nova`)
- Descricao, valor (R$), categoria, data
- **Seletor de crianca multi-select** com chips (pode selecionar 1, 2 ou todas as criancas)
- Upload de comprovante (foto/PDF, incluindo WebP)
- Criacao via Server Action com redirect corrigido

### 13. Chat (`/chat`)
- Mensagens em tempo real do grupo via Supabase Realtime
- Mensagens imutaveis (conformidade legal)
- Suporte a respostas e pins
- **Canais tematicos** (`ChannelTabs`): Geral + por crianca, tabs mostram **inicial da crianca** (nao emoji generico)
- **Troca de canal client-side** (sem reload de pagina) via estado React + fetch API
- **Cache de mensagens em memoria** (LRU, ate 5 canais) para troca instantanea
- **API Route** `/api/chat/messages` para buscar mensagens por canal
- **Atualizacao otimista** corrigida (sem duplicacao)
- **Read receipts** com `Promise.allSettled`
- **Fix de memory leak** no listener Realtime
- **Deteccao de teclado** — bottom nav se esconde quando teclado virtual abre
- **Exportacao PDF** com filtro por canal
- **IA Mediadora**: analise de tom e sugestao de reformulacao

### 14. Criancas (`/criancas`)
- Lista de criancas com foto e idade
- Adicionar nova crianca (`/criancas/nova`)
- **Perfil completo com 4 abas** (`/criancas/[id]`):
  - **Geral**: nome, data de nascimento, CPF, RG, notas
  - **Saude**: peso/altura, tipo sanguineo, convenio, alergias, medicamentos, vacinas (dados agregados)
  - **Documentos**: upload/visualizacao de documentos por crianca (RG, CPF, passaporte, certidao, etc.)
  - **Educacao**: escola (nome/endereco/telefone), serie, professor(a), coordenador(a), horarios, extracurriculares
- Server actions: `upsertChildEducation`, `uploadChildDocument` em `src/actions/children.ts`

### 15. Saude (`/saude`)
Hub central de saude com sub-modulos:
- **Dashboard de saude**: doencas ativas, medicamentos, alergias criticas, consultas proximas, retornos pendentes, vacinas
- **Banner de vacinas atrasadas** no dashboard de saude
- **Push notifications** para TODOS os eventos de saude (alergias, vacinas, consultas, crescimento)
- **Sanitizacao de input** em todos os campos de texto (max length limits)
- **Doencas** (`/saude/doencas`): episodios com sintomas, severidade (leve/moderado/grave), evolucao com notas timestamped, status (ativo/resolvido/cronico), ida ao hospital, botao resolver (`ResolveButton`), formulario de atualizacao (`UpdateEpisodeForm`). `updateIllnessEpisode` rejeita status invalidos
- **Medicamentos** (`/saude/medicamentos`): nome, dosagem, frequencia, horarios, status (ativo/pausado/completo/cancelado), registro de doses, historico, **pagina de detalhe** (`/saude/medicamentos/[id]`). **Validacao server-side de intervalo entre doses** (< 30 min rejeitado). **Validacao server-side de campos obrigatorios** (nome, dosagem, frequencia, data inicio) antes do insert — previne violacoes NOT NULL no Postgres. `ConfirmDoseButton` na lista de medicamentos E na pagina de detalhe. Progress de tratamento pre-computado no server (`progressMap`) — funcoes nao podem ser passadas a Client Components no Next.js 16. **Uso continuo**: medicamentos sem data final exibem "Uso continuo — Dia N" em vez de barra de progresso. **Medicamentos sob demanda** (SOS/se necessario): quando `frequency_hours` e 0, exibe ultima dose por quem e quando (em vez de esconder timing). **Links diretos**: nome do medicamento no dashboard e hero e clicavel, levando ao detalhe `/saude/medicamentos/[id]`. Botao "Ver medicamento" no hero de doenca ativa. **Proxima dose estimada** na pagina de detalhe baseada no intervalo medio real
- **Consultas** (`/saude/consultas`): agendamento com profissional, tipo (rotina/emergencia/retorno/exame), local, data retorno, diagnostico, prescricoes, status (agendada/concluida/cancelada/faltou), formulario de conclusao (`CompleteAppointmentForm` com i18n), botao WhatsApp para agendar
- **Alergias** (`/saude/alergias`): tipo, severidade, reacao, info medica (tipo sanguineo, convenio, SUS). **Edicao e exclusao inline** com formulario (`AllergyFormClient`). Service role usado para query (workaround de RLS). Fix de coluna `notes` inexistente na query. Link `/saude/alergias/editar-info` corrigido (scroll ate formulario)
- **Vacinas** (`/saude/vacinas`): comparacao com calendario SBP, doses, lotes, local aplicacao, confirmacao de dose (`ConfirmDoseButton`)
- **Crescimento** (`/saude/crescimento`): peso, altura, perimetro cefalico, **grafico visual** (`GrowthChart`), comparacao WHO
- **Profissionais** (`/saude/profissionais`): diretorio com especialidade, CRM, telefone, WhatsApp
- **Ficha de Emergencia** (`/saude/emergencia`): gera QR Code com dados criticos de saude (tipo sanguineo, alergias, medicacoes, convenio/SUS, contatos, pediatra). Endpoint publico `/api/health/emergency/[childId]?token=...` renderiza HTML auto-contido. Token UUID por crianca (`emergency_token` na tabela `children`). Botoes de compartilhar, copiar link e regenerar QR. Checklist visual dos dados preenchidos. **Fallback automatico de pediatra**: quando `child_medical_info.primary_pediatrician_id` e null, busca o primeiro `medical_professionals` do grupo com `specialty='pediatra'` (`order created_at asc, limit 1`). Aplicado nas 3 superficies: nativo (`kindar-native/app/saude/emergencia.tsx`), endpoint publico (`src/app/api/health/emergency/[childId]/route.ts`) e checklist do PWA (`src/app/(app)/saude/emergencia/page.tsx`).
- **Resumo pre-consulta** (`/saude/consultas/resumo`): gera resumo completo de saude desde a ultima consulta concluida (ou nascimento). Agrega doencas, sintomas, medicamentos (com aderencia), vacinas, crescimento, alergias, info medica e consultas do periodo. Botoes para copiar texto formatado e imprimir (CSS print-ready). Selecao de crianca via query param `?crianca=`. i18n: secao `preSummary` (~53 chaves)
- **Exportacao** (`/saude/export`): exportar registros de saude
- **Rastreamento de visualizacoes**: `HealthViewTracker` registra quem viu, `ViewedByBadge` (i18n) mostra badges
- **Botao generico de submit**: `SubmitButton` reutilizavel

### 15.1 Notificacoes no Chat
Todas as acoes importantes geram mensagem automatica no chat do grupo via `postChatNotification()`:
- Check-in, Evento, Despesa, Doenca, Evolucao doenca, Medicamento, Troca de dia, Resposta troca

### 16. Documentos (`/documentos`)
- **Dashboard de documentos** com visao geral de todas as criancas
- Card por crianca com **barra de completude** (0-100%)
- Indicadores de documentos faltantes (badges)
- Links para upload na aba Documentos do perfil da crianca
- **Prevencao de upload duplicado**: botao desabilitado durante upload + reset do input apos sucesso (documentos e documentos de crianca)
- Componentes: `DocumentList`, `DocumentViewer`, `DocumentsDashboard`, `DocumentsClient`

### 17. Acordos (`/acordos`)
- Registro de acordos entre os responsaveis
- **10 categorias**: principio, valor, regra, limite, rotina + 5 mais
- Aceitar/rejeitar acordos
- Flag nao-negociavel
- Componente: `AcordosClient`

### 18. Notas Privadas (`/notas`)
- Notas pessoais por usuario (nao compartilhadas com o grupo)
- CRUD completo

### 19. Decisoes (`/decisoes`)
- Registro e votacao de decisoes em grupo
- Votacao: concordo / discordo / vou pensar
- Argumentos pro/contra
- Auto-resolucao e indicadores de urgencia
- Status e historico de decisoes

### 20. Eventos (`/eventos`) -> Redirecionado para `/calendario`
- Eventos sociais agora sao criados e visualizados dentro da Agenda unificada
- Suporte multi-dia, all-day, assigned_to

### 21. Atividades com Checklist e Relatorios (integrado na Agenda)
- **Atividades recorrentes** das criancas (futsal, natacao, dentista, etc.)
- **Motor de recorrencia** com 7 opcoes: Nunca, Todos os dias, Toda semana, A cada 2 semanas, Todo mes, Todo ano, Personalizar
- **Checklist inteligente**: itens pre-preenchidos por categoria (esporte -> uniforme, chuteira, etc.)
- **Relatorios de atividade**: status (completa/faltou/cancelada), humor da crianca, notas. **Modal reseta campos** ao abrir para nova atividade. **Fix de cor de texto** no textarea do ActivityReportModal (cor explicita + placeholder para evitar texto invisivel)
- **Editar ocorrencia unica vs todas** (estilo Google Calendar): overrides JSONB para nome, horario, local de uma data especifica
- **Cancelar ocorrencia**: cancelar apenas uma data
- **Trocar responsavel**: por ocorrencia ou para todas
- **Campos extras**: professor, turma, sala, responsavel fixo
- **Push notifications**: lembrete 24h antes com lista de materiais
- **Suporte a multiplos filhos**: opcao "Todos" ou selecao individual
- **Cron job** (`/api/cron/activity-reminders`): dispara lembretes automaticos

### 22. Escola (`/escola`)
- Informacoes escolares (integrado na aba Educacao do perfil da crianca)
- Registro de notas e ocorrencias

### 23. Temas Sensiveis (`/temas-sensiveis`)
- Area para discussao de temas delicados
- **Delecao com dupla aprovacao**: `requestDeletion`, `approveDeletion`, `cancelDeletion` — um solicita, outro confirma
- Campos `deletion_requested_by`, `deletion_requested_at` para tracking
- Componente: `SensitiveTopicsClient`

### 24. Convite (`/convite/enviar`)
- Envio de convites por email/telefone
- Aceitacao via link com token (`/convite/[token]`)
- Auto-aceitacao de convites pendentes ao fazer login

### 25. Perfil (`/perfil`)
- Visualizacao e edicao de dados pessoais (`EditProfileForm`)
- **Seletor de idioma** (`LanguageSelector`)
- **Seletor de grupo** (`GroupSelector`) para multi-grupo
- Sincronizacao de calendario (iCal)

### 26. Assistente IA Kindar
- **Interface conversacional completa** (`AIAssistant.tsx`): message bubbles, typing indicator, sugestoes rapidas, input por voz (Speech Recognition API), multi-turn conversation
- **Arquitetura AI centralizada** (`src/lib/ai/`): todo codigo de IA em modulo unico
  - `src/lib/ai/core/` — types, config, logger, usage tracking, service entry point (`generateAIResponse()`)
  - `src/lib/ai/providers/` — Groq, Together, Gemini providers
  - `src/lib/ai/router.ts` — multi-provider router (Groq → Together → Gemini fallback)
  - `src/lib/ai/image-utils.ts` — compressao de imagem para vision APIs
  - Arquivos migrados de `src/lib/`: `ai-actions.ts`, `ai-cache.ts`, `ai-context.ts`, `ai-local-parser.ts`, `ai-rate-limit.ts`, `ai-tools.ts`
- **Multi-provider AI Router**:
  - **Vision**: Groq `llama-4-scout` → Together `Llama-Vision-Free` → Gemini `gemini-2.0-flash`
  - **Text**: Groq `llama-3.3-70b` → Together `Llama-3.3-70B-Turbo-Free` → Gemini `gemini-2.0-flash`
  - **Tools**: Groq → Together (ambos OpenAI-compatible function calling)
- **AI Service**: `generateAIResponse()` ponto de entrada unico para todas as features de IA
- **Usage tracking**: `canUseAI()`, `recordUsage()` — preparado para monetizacao (billing desabilitado por ora)
- **Novas tabelas DB**: `ai_requests` (logging de requests AI) e `usage_events` (tracking de monetizacao)
- **Supabase Admin Client**: `src/lib/supabase/admin.ts` — client centralizado com service role
- **Parsers robustos para PT-BR**:
  - `parseAmount()`: aceita "R$ 45,00", "120 conto", "50 reais". Distingue ponto decimal (1-2 digitos apos) de milhar (3 digitos apos)
  - `parseDate()`: aceita "DD/MM/YYYY", "DD/MM"
  - `parseTime()`: aceita "14h", "14h30", "14:00" — usado tambem no campo de horario de atividades
  - `parseDaysOfWeek()`: mapeia "terca", "quinta", etc para formato DB
- **12 tools OpenAI-compatible** (`src/lib/ai/ai-tools.ts`):
  - **6 tools de acao**: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`
  - **5 tools de consulta**: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
  - **1 tool de comunicacao**: `draft_message`
- **API Route**: `src/app/api/ai/assistant/route.ts` — refatorada para usar AI router em vez de Groq SDK direto
- **Confirmacao antes de acoes**: tools de criacao (create_*) pedem confirmacao ao usuario. Tools de consulta (get_*) executam imediatamente
- **Multi-round tool calling**: ate 3 rodadas com `tool_choice: "auto"`, resposta final forcada com `tool_choice: "none"`
- **Resiliencia**: `maxDuration = 60` no Vercel, frontend trata erros 504/502 graciosamente
- **Frontend resiliente**: `AIAssistant.tsx` trata respostas nao-JSON (504/502) com try/catch, client-side timeout de 15s
- **Contexto familiar** (`ai-context.ts`): constroi contexto com filhos, membros do grupo e custodia
- **React Portal**: renderiza em `document.body` via `createPortal` (escapa CSS `backdrop-blur` containing block no header mobile)
- **Integracao**: botao IA no header mobile + botao flutuante no desktop (`ResponsiveShell.tsx`)
- **Rate limiting** (`ai-rate-limit.ts`) por usuario com mensagens amigaveis
- **Cache de respostas** (`ai-cache.ts`) com TTL de 5 minutos
- **SSR-safe**: container do Portal usa `useState` + `useEffect`
- **50 testes unitarios** (Vitest) com **98.5% de acuracia** em load test
- API Routes: `/api/ai/assistant`, `/api/ai/context`

### 27. Kindar Assistente WhatsApp IA (`/api/whatsapp/webhook`)
Canal WhatsApp que reutiliza 100% da infraestrutura do Assistente IA in-app.
- **Pipeline**: `WhatsApp -> Webhook -> Parser IA -> Classificador -> Confirmacao -> Banco`
- **Meta Cloud API direto** (sem Twilio): custo menor, botoes interativos nativos
- **Webhook**: `POST /api/whatsapp/webhook` (receber mensagens) + `GET` (verificacao Meta)
- **Seguranca**: HMAC-SHA256 em todo request, rate limit 30 msg/min por telefone
- **Identity**: vinculacao phone -> perfil Kindar via OTP, multi-grupo com selecao interativa
- **Sessao**: estado da conversa em JSONB (confirmacoes pendentes, grupo ativo, timeout 10 min)
- **Parser local**: reutiliza `parseIntent()` (~80% dos comandos sem API)
- **AI Router fallback**: reutiliza `routeToolsRequest()` (Groq -> Together -> Gemini)
- **Confirmacao via botoes**: `[Confirmar] [Cancelar]` interativos do WhatsApp (nao texto)
- **OCR de recibos**: foto -> `compressImageForVision()` -> `routeVisionRequest()` -> despesa
- **Formatacao**: markdown -> WhatsApp (*bold*, _italic_), limite 4096 chars, split de mensagens longas
- **Transcricao de audio**: audio WhatsApp -> Groq Whisper (gratis) -> texto -> processamento normal
- **Modulo**: `src/lib/whatsapp/` (9 arquivos: types, client, signature, identity, session, processor, formatter, media, audio)
- **Logica compartilhada**: `src/lib/ai/assistant-shared.ts` (buildAssistantContext, buildSystemPrompt, mapLocalActionToTool, CONFIRM_WORDS/CANCEL_WORDS)
- **DB**: 4 tabelas (whatsapp_phone_links, whatsapp_sessions, whatsapp_message_logs, whatsapp_notification_preferences)
- **Admin client**: todas operacoes DB via `createAdminClient()` (sem cookie de auth)
- **LGPD**: consent timestamp na vinculacao, retencao de logs 90 dias

### 28. Invite Parser — Adicionar via Convite (`/calendario/convite`)
- Upload de foto ou PDF de convite de festa
- **OCR via Tesseract.js** extrai texto da imagem (100% client-side, sem custo adicional)
- **Groq LLM** interpreta o texto e estrutura os dados do evento (titulo, data, horario, local, notas)
- Preview editavel dos dados detectados antes de salvar no calendario
- Usuario pode vincular a filho e confirmar para salvar
- **Free tier completo**: Tesseract.js (gratuito) + Groq API (plano gratuito)
- **Parser modular** (`src/lib/ai/parser/`): `types.ts`, `event-parser.interface.ts`, `ocr.ts`, `groq-event-parser.ts`, `pilot-parser.ts`, `index.ts` (factory com `AI_MODE`)
- **API Route**: `POST /api/ai/parse-invite` — recebe arquivo, OCR + LLM, retorna dados estruturados, loga em `ai_event_logs`
- **Navegacao**: acessivel a partir de `/calendario/novo` via atalho "Via convite"
- **i18n**: todas as strings em `inviteParser.*` nos 5 idiomas

### 27b. Leitor de Carteirinha de Vacinacao (`/saude/vacinas/carteirinha`)
- Upload de foto da carteirinha de vacinacao brasileira
- **Vision AI** (multi-provider: Groq → Together → Gemini) analisa a imagem e extrai todas as vacinas visiveis
- Extrai: nome da vacina, dose, data de aplicacao, lote, local
- Preview editavel com lista de vacinas detectadas — usuario pode incluir/excluir, editar campos
- Salva em lote via `createVaccinationRecordBatch` (sem redirect, para uso em batch)
- Acessivel a partir de `/saude/vacinas` via botao "Ler carteirinha"
- **API Route**: `POST /api/ai/parse-vaccines` — recebe imagem, comprime via sharp, Vision AI, retorna array de vacinas
- **Componentes**: `VaccineParserClient.tsx` (client), `page.tsx` (server)

### 28. Notificacoes (`/notificacoes`)
- Central de notificacoes in-app
- Web push via VAPID
- Badge count (`NotificationBadge.tsx`)
- 12 tipos de notificacao
- `markNotificationRead`, `markAllNotificationsRead`

### 29. Mais (`/mais`)
- Grid com todas as funcionalidades do app (Eventos e Atividades unificados como "Agenda")

---

## Acessibilidade

- `aria-labels` em todos os links de navegacao (BottomNav, Sidebar)
- `aria-current="page"` para item ativo na navegacao
- `role="navigation"` no sidebar e bottom nav
- Contraste de cores adequado no design system
- Touch targets minimos 44x44px (Apple HIG)

---

## Design System

### Paleta de Cores
| Cor | Hex | Uso |
|-----|-----|-----|
| Primary | #0EA5A0 | Acoes principais, 1o responsavel |
| Primary Light | #E6F7F7 | Fundos suaves |
| Primary Dark | #0B8A86 | Hover states |
| Secondary | #FF6B5B | 2o responsavel, alertas |
| Accent | #FFB627 | Destaques, pendencias |
| Dark | #1A3B3A | Textos principais |
| Light | #F8FFFE | Fundo do app |
| Success | #4CAF50 | Aprovacoes, "Livre" |
| Error | #E53935 | Erros, rejeicoes |
| Muted | #7A8C8B | Textos secundarios |

### Cores dos Responsaveis
- **1o responsavel** (por ordem de entrada): Teal (#0EA5A0)
- **2o responsavel**: Coral (#FF6B5B)

### Navegacao
- **Bottom nav** (mobile): Inicio, Agenda, Chat, Familia, Mais — com `aria-labels`, `aria-current`, touch targets 44x44px
- **Sidebar** (desktop): Inicio, Agenda, Check-in, Chat, Acordos, Temas Sensiveis, Criancas, Familia, Saude, Escola, Financeiro, Despesas, Documentos, Convidar — com `role="navigation"`
- **Header mobile**: Fixo com backdrop-blur, se esconde junto com bottom nav quando teclado virtual abre

### Mobile UX Nativo
- **iOS safe areas**: CSS `env(safe-area-inset-*)` para notch e home indicator
- Touch targets minimos 44x44px (Apple HIG) em todos elementos interativos
- Haptic feedback (Capacitor nativo + Web Vibration fallback) em: troca de tab, clique em dia, envio de chat
- Active states com `scale(0.97)` em dispositivos touch
- Teclado virtual: bottom nav se esconde automaticamente via `visualViewport` API
- Transicao de pagina suave (fade-in 200ms)
- 7 arquivos `loading.tsx` com skeleton (animate-pulse, nao spinners)
- `overscroll-behavior: none` previne rubber-band em iOS
- `viewport-fit=cover`, sem zoom em inputs (font-size 16px)
- **Service Worker v3** com navigation caching
- **Pagina offline** dedicada (`/offline.html`)
- **PWA Install Banner** (`PWAInstallBanner.tsx`): exibe banner no iOS Safari orientando o usuario a usar "Compartilhar > Adicionar a Tela de Inicio" para abrir o app em modo standalone (sem barra de URL). Condicoes: dispositivo iOS, nao esta em `standalone`, usuario nao dispensou. Dispensa persistida em `localStorage` (`kindar-pwa-dismissed`). Incluido no root layout (`src/app/layout.tsx`)
- **manifest.json** atualizado com `id`, `prefer_related_applications: false` e `shortcuts`

---

### Sistema de Operacoes de Saldo (Custody Balance Operations)

Sistema para ajustes consensuais de saldo entre coparentes, alem da divida automatica. Tabela `custody_balance_operations` (migration `00052`) com 7 tipos:

| Tipo | Efeito |
|------|--------|
| `debit` | Gera saldo devedor (comportamento padrao) |
| `credit` | Gera saldo positivo |
| `waive` | Troca sem gerar saldo (isencao) |
| `gift_day` | Cede dia sem cobranca |
| `forgive_balance` | Reduz divida existente |
| `reset_balance` | Zera todos os saldos (bilateral) |
| `manual_adjustment` | Ajuste customizado |

**Arquitetura hibrida:**
- `computeSwapBalance()` em `calendar-utils.ts` calcula saldo fisico (computado de eventos)
- `getEffectiveBalance()` aplica operacoes do ledger sobre o saldo fisico
- Resultado: `{ effectiveByUser, friendlyConcessions, lastAgreementDate, pendingOperations }`

**Server actions** em `src/actions/balance-operations.ts`:
- `createBalanceOperation(formData)` — cria operacao pendente, notifica target
- `respondToBalanceOperation(formData)` — aprova/rejeita bilateralmente

**Componentes UI:**
- `SwapBalanceCard.tsx` — card premium com status, ultimo acordo, concessoes amigaveis, botoes "Ver historico" / "Propor ajuste"
- `BalanceOperationPicker.tsx` — seletor de tipo de operacao
- `BalanceOperationList.tsx` — lista de operacoes pendentes
- `BalanceHistorySheet.tsx` — historico cronologico completo
- `ProposeBalanceAdjustmentSheet.tsx` — sheet para propor novo ajuste

**Regras:**
- Todas as operacoes requerem aprovacao bilateral
- Zerar saldo: ambos precisam aceitar explicitamente
- Perdao parcial: informar qtd dias
- Snapshot de saldo gravado na aprovacao (auditoria)
- RLS: proposer cria; target aprova/rejeita

---

### Foundation: Collaborative Records (Fases 1, 1B, 3) — migrations 00077, 00078, 00080

Camada compartilhada para **records colaborativos**: qualquer registro onde os coparentes precisam de awareness, read receipts e prioridade. Trata-se da espinha dorsal do "sistema de sincronizacao familiar" do Kindar.

**Conceitos:**
- Tabela polimorfica `collab_reads (record_type, record_id, user_id, read_at)` — uma linha por (record, user) quando o user explicitamente abre o detalhe. PRIMARY KEY composto.
- Enum `collab_priority` ∈ (`info`, `important`, `urgent`). Tabelas opt-in com `ADD COLUMN priority collab_priority NOT NULL DEFAULT 'info'`.
- Funcao `collab_record_group(record_type, record_id)` → resolve o `group_id` pra RLS (WHEN branch por modulo).
- RPC `mark_collab_read(record_type, record_id)` — chamada pelo client (PWA + native) ao abrir detail.
- Triggers `<modulo>_auto_mark_creator_read` — criador auto-marca como lido na insercao.

**Servico canonico (`src/lib/services/collab.ts`):**
- `notifyCollabCreate({recordType, recordId, groupId, actorUserId, priority, title, message, link})` — fan-out de push pros membros (role admin/member), com **coalescing 60s**: pushes do mesmo (recipient, type, actor) em 60s usam tag estavel e mensagem agregada ("Amanda adicionou 3 registros escolares"). In-app notification row sempre criada (inbox nao coalesce).
- `unreadCollabCount({userId, groupId, recordType})` — count de records nao lidos, drives badges no dashboard.

**Regras de UX firmadas (Fase 1):**
1. **Read receipt sempre ON** — Kindar vende transparencia, sem opt-out por user.
2. **`urgent` usa push normal por enquanto** — time-sensitive entitlement Apple requer capability change + rebuild (Fase 2).
3. **Edit nao dispara push** — so create.
4. **Criador auto-marcado como lido** — via trigger.
5. **Marcar lido APENAS no detalhe** — nunca em scroll/list-mount/preload. O "Visto por Amanda · 14:32" depende dessa disciplina.
6. **Anti-spam de notificacao** — coalescing 60s via tag estavel (FCM `tag`, APNs `thread-id`, web-push `tag`).

**Adocoes consolidadas:**
- `school_log` (00077) — pioneer da Fase 1: badges, visto-por, priority chips, push coalescing.
- `expense` (00078) — Fase 1B: TUDO + Edit/Cancel/Reopen + `expense_history` (audit imutavel: id, expense_id, actor_id, action, before/after JSONB, reason, at). Endpoints novos em `services/expenses.ts`: `editExpense`, `requestCancelExpense`, `respondToCancelRequest`, `reopenApproval`. Janela de reopen rigida: 24h apos `approved_at`. Edit em status=approved REVERTE pra pending (qualquer mudanca invalida aprovacao). Cancelamento de despesa aprovada exige concordancia do reviewer original (`cancel_pending`).
- `medical_appointment`, `illness_episode`, `active_medication`, `child_allergy`, `vaccination_record` (00080) — Fase 3 Saude:
  - 5 ALTERs com `priority` (appointments/illness/medications/allergies default `important`, vaccines default `info`)
  - Trigger generico `saude_auto_mark_creator_read` (1 funcao, 5 instancias via TG_ARGV)
  - Trigger `illness_episodes_grave_to_urgent` BEFORE INSERT/UPDATE: `severity='grave'` + `priority='important'` (default) → promove pra `'urgent'` server-side. Respeita override explicito.
  - Wrapper `src/lib/services/health-collab.ts:notifySaudeCreate(...)` — resolve priority efetivo pos-trigger + monta titulo PT-BR por record_type + body com crianca + deep link `/saude/<modulo>?highlight=<id>`.
  - Endpoint `POST /api/health/notify-create` — wrapper compacto pro native chamar apos `safeWrite` (offline-first).
  - Flag `safeWrite({ returnInsertedId: true })` — backward-compatible, retorna `id` via `.select('id').single()` pra disparar `notifySaudeCreateNative` apos sucesso.
  - Dashboard tile **consolidada** (PWA + Native): "Saude · N novos" agregando os 5 record_types (em vez de 5 tiles separadas — principio "dashboard tight"). Telemetria PostHog `unread_count` com `record_type: 'saude_aggregate'` (1 event por mount).
  - i18n nos 5 idiomas: `collab.dashboardSaudeUnreadOne/Other/Hint`.
  - **Fora da adocao (deliberado, anti-spam):** `medication_doses`, `symptom_entries`, `growth_records`, `child_medical_info`, `medical_professionals`.
  - **Pendencia conhecida (Fase 3.5):** UI inline em cada uma das 5 telas individuais com chip "Novo" + chip de priority + linha "Visto por X · time" + `mark_collab_read` no tap-to-expand.

**Eventos PostHog (Foundation):**
- `notification_sent` (server, recipient distinctId) — props: `record_type`, `actor_user_id`, `priority`, `coalesced`, `coalesced_count`
- `notification_opened` (client, deep link `?highlight=`) — props: `record_type`, `record_id`
- `<modulo>_read` (server, no markRead) — props: `log_id` ou `expense_id`
- `unread_count` (client, dashboard mount) — props: `record_type`, `count`
- `urgent_created` (server, priority='urgent' no create) — props: `record_type`
- `expense_edited`, `expense_cancelled`, `expense_cancel_requested`, `expense_cancel_approved`, `expense_cancel_rejected`, `expense_reopened` (server)

---

### Billing: Stripe + Apple IAP + Google Play Billing + RevenueCat

A monetizacao mudou de "Premium R$29,90 / Elite R$49,90" (Marco/2026) para a estrutura nova de Abril/2026 (ver `MONETIZACAO.md`). Backend suporta 4 providers simultaneos via `subscriptions` com `provider` enum + tabelas auxiliares.

**Tabelas (migrations 00039, 00051, 00053-00063):**
- `plans` — catalogo de planos com `apple_product_id`, `google_product_id`, `stripe_price_id` + indices p/ lookup por product_id e transaction_id
- `subscriptions` — assinatura escopada por grupo (migration 00054), com provider, status, current_period_end, cancel_at_period_end
- `coupons` — cupons de desconto com limite global de uso e RLS admin-only (00060)
- `webhook_events` — idempotencia: Stripe/RevenueCat nao processam o mesmo evento 2x (00061)
- `referral_clicks` + `referral_rewards` — sistema de indicacao (00061)
- `onboarding_quests` — etapas individuais da gamificacao do onboarding (00057)

**Endpoints (8):**
- `/api/billing/status` (GET) — status atual da assinatura do grupo
- `/api/stripe/checkout` (POST) — cria sessao de checkout
- `/api/stripe/portal` (POST) — cria sessao do portal do cliente Stripe
- `/api/stripe/webhook` (POST) — recebe eventos Stripe com idempotencia via `webhook_events`
- `/api/iap/verify` (POST) — verifica receipt da Apple StoreKit
- `/api/revenuecat/webhook` (POST) — webhook RevenueCat (unifica Apple + Google)
- `/api/coupons/validate` (POST) — valida cupom em tempo real
- `/api/subscription/split` (POST/DELETE) — split entre coparentes

**Crons:**
- `/api/cron/trial-reminder` — D-3 antes do fim do trial
- `/api/cron/trial-expiry` — no dia do fim do trial
- `/api/cron/renewal-reminder` — D-7 antes da renovacao
- `/api/cron/iap-pending-cleanup` — limpa receipts IAP "pending" antigas
- `/api/cron/webhook-events-prune` — purge de webhook_events processados (> 90d)

**Componentes UI:**
- `src/components/billing/TrialBanner.tsx` — banner com countdown do trial
- `src/components/billing/EarlyBirdBadge.tsx` — badge Early Bird (limite global de N cupons)
- `src/components/billing/OnboardingQuest.tsx` — checklist gamificada
- `src/components/PremiumGate.tsx` — gate de paywall em features premium
- `src/components/SubscriptionProvider.tsx` — context React global pro plano atual

---

## Server Actions (126 funcoes em 30 arquivos)

> Cresceu de 86/24 (24/04/2026) para 126/30 com a entrada de billing/IAP, Foundation Collab (Fase 1/1B/3), onboarding-quest, balance-operations, birthdays, admin-coupons, whatsapp-actions e edit/cancel/reopen de despesas. Tabela abaixo cobre o nucleo historico; novos modulos detalhados em sub-secoes proprias.

### Arquivos novos (apos 24/04/2026)
- `admin-coupons.ts` — CRUD de cupons (admin-only)
- `balance-operations.ts` — operacoes de saldo (waive/gift/forgive/reset/manual_adjustment) com aprovacao bilateral
- `birthdays.ts` — `sendBirthdayReminders` (cron D-7 antes do aniversario)
- `onboarding-quest.ts` — gamificacao do onboarding (marcar etapas, ler progresso)
- `subscription.ts` — assinatura: status, cancelamento, retomada
- `subscription-split.ts` — split de assinatura entre coparentes (`enableSubscriptionSplit`, `disableSubscriptionSplit`)
- `whatsapp.ts` — actions de vinculacao de numero, preferencias de notificacao, opt-in/out
- `expenses.ts` (estendido): `editExpense`, `requestCancelExpense`, `respondToCancelRequest`, `reopenApproval` — fluxo Edit/Cancel/Reopen com audit trail (Foundation Fase 1B)
- `school.ts` (estendido): `markSchoolLogRead` (RPC `mark_collab_read` wrapper) + adoption Foundation Fase 1

### Tabela (nucleo historico)


| Action | Arquivo | Funcao |
|--------|---------|--------|
| createCustodyEvent | calendar.ts | Cria evento de guarda (unico ou recorrente) |
| createSwapRequest | calendar.ts | Solicita troca de dia |
| respondToSwapRequest | calendar.ts | Aprova/rejeita troca |
| createBalanceOperation | balance-operations.ts | Propoe ajuste de saldo (waive/gift/forgive/reset/etc) |
| respondToBalanceOperation | balance-operations.ts | Aprova/rejeita operacao de saldo bilateralmente |
| generateSchedule | calendar.ts | Gera escala quinzenal em lote |
| clearCustodySchedule | calendar.ts | Limpa escala de custodia existente |
| getOrCreateCalendarToken | calendar.ts | Token para iCal |
| createExpense | expenses.ts | Registra despesa |
| updateExpenseStatus | expenses.ts | Aprova/rejeita despesa (bloqueia auto-aprovacao, impede regressao de status, somente aprovadas contam no saldo) |
| deleteExpense | expenses.ts | Exclui despesa |
| createCheckin | checkin.ts | Cria check-in + envia ao chat |
| signUp | auth.ts | Cadastro com email/senha |
| signIn | auth.ts | Login |
| signOut | auth.ts | Logout |
| resetPassword | auth.ts | Reset de senha |
| signInWithOAuth | auth.ts | Login via OAuth (Google/Apple/Facebook) |
| updatePassword | auth.ts | Atualiza senha |
| createGroup | group.ts | Cria grupo de coparentalidade |
| addChild | group.ts | Adiciona crianca ao grupo |
| updateChild | group.ts | Atualiza dados da crianca |
| switchGroup | group-switch.ts | Troca grupo ativo |
| createInvitation | invitation.ts | Envia convite |
| acceptInvitation | invitation.ts | Aceita convite via token |
| autoAcceptPendingInvitations | invitation.ts | Auto-aceita convites pendentes |
| changeMemberRole | members.ts | Altera role de membro |
| removeMember | members.ts | Remove membro do grupo |
| leaveGroup | members.ts | Sair do grupo |
| cancelInvitation | members.ts | Cancela convite |
| deleteInvitation | members.ts | Deleta convite |
| updateProfile | profile.ts | Atualiza perfil |
| createHealthLog | health.ts | Registro de saude |
| createProfessional | health.ts | Cadastra profissional |
| createAppointment | health.ts | Agenda consulta + evento + push |
| updateAppointmentStatus | health.ts | Atualiza status consulta |
| completeAppointment | health.ts | Conclui consulta |
| createMedication | health.ts | Cria medicamento |
| logMedicationDose | health.ts | Registra dose (com validacao server-side de intervalo minimo 30 min) |
| updateMedicationStatus | health.ts | Atualiza status medicamento |
| createIllnessEpisode | health.ts | Registra doenca |
| updateIllnessEpisode | health.ts | Atualiza doenca |
| addIllnessEvolution | health.ts | Nota de evolucao |
| createAllergy | health.ts | Registra alergia + push |
| updateAllergy | health.ts | Edita alergia existente |
| deleteAllergy | health.ts | Exclui alergia (service role) |
| upsertMedicalInfo | health.ts | Info medica |
| createVaccinationRecord | health.ts | Registra vacina + push |
| createVaccinationRecordBatch | health.ts | Registra vacina em batch (sem redirect) + push |
| trackHealthView | health.ts | Rastreia visualizacao |
| createGrowthRecord | health.ts | Registra crescimento + push |
| createSymptomEntry | health.ts | Registra sintoma no diario (febre, vomito, diarreia, etc.) + push |
| createIllnessWithMedicationAndAppointment | health.ts | Wizard: cria doenca + medicamento + consulta em uma unica action + push + chat |
| resolveIllnessQuick | health.ts | Resolve doenca rapido + opcao de finalizar medicamentos + chat |
| addEvolutionQuick | health.ts | Evolucao rapida (melhorou/piorou) sem redirect + chat |
| upsertChildEducation | children.ts | Info escolares |
| uploadChildDocument | children.ts | Upload documento por crianca |
| createDocument | documents.ts | Upload documento |
| createAgreement | agreements.ts | Registra acordo |
| acceptAgreement | agreements.ts | Aceita acordo |
| createEvent | events.ts | Cria evento + notifica grupo + history |
| updateEvent | events.ts | Atualiza evento (criador: direto + notifica; outro: cria request) |
| deleteEvent | events.ts | Remove evento (criador: direto + notifica; outro: cria request) |
| cancelEvent | events.ts | Cancela evento (criador: direto + notifica; outro: cria request) |
| respondToEventRequest | events.ts | Aprova/rejeita request com validacao de snapshot |
| getPendingEventRequests | events.ts | Lista requests pendentes do grupo |
| eventHasPendingRequest | events.ts | Verifica se evento tem request pendente |
| createActivity | activities.ts | Cria atividade + checklist + push |
| deleteActivity | activities.ts | Remove atividade |
| toggleChecklistItem | activities.ts | Marca/desmarca checklist |
| sendActivityReminders | activities.ts | Push 24h antes (cron) |
| sendBirthdayReminders | birthdays.ts | Push + in-app 7 dias antes do aniversario das criancas (cron) |
| submitActivityReport | activities.ts | Submete relatorio de atividade |
| getPendingReports | activities.ts | Busca relatorios pendentes |
| getReportsForDate | activities.ts | Relatorios por data |
| sendMissedReportReminders | activities.ts | Lembrete de relatorios nao enviados |
| cancelActivityOccurrence | activities.ts | Cancela ocorrencia unica |
| changeActivityResponsible | activities.ts | Troca responsavel (ocorrencia) |
| editActivityAll | activities.ts | Edita atividade completa |
| editActivityOccurrence | activities.ts | Edita ocorrencia unica (overrides) |
| changeActivityResponsibleAll | activities.ts | Troca responsavel (todas) |
| createSettlement | settlements.ts | Cria acerto financeiro (validacao server-side: valor <= saldo real + R$0.01) |
| confirmSettlement | settlements.ts | Confirma recebimento |
| createNote | notes.ts | Cria nota privada |
| updateNote | notes.ts | Atualiza nota |
| deleteNote | notes.ts | Remove nota |
| createDecision | decisions.ts | Cria decisao |
| castVote | decisions.ts | Vota em decisao |
| addArgument | decisions.ts | Adiciona argumento pro/contra |
| ensureDefaultChannels | chat-channels.ts | Garante canais padrao |
| markChannelRead | chat-channels.ts | Marca canal como lido |
| createSchoolLog | school.ts | Registra nota escolar |
| updateSchoolLog | school.ts | Edita registro escolar (todos os campos, sincroniza espelho do calendário em mudanças de subtype/data/hora/criança) |
| createSensitiveNote | sensitive.ts | Cria tema sensivel |
| requestDeletion | sensitive-topics.ts | Solicita delecao (dual-approval) |
| approveDeletion | sensitive-topics.ts | Aprova delecao |
| cancelDeletion | sensitive-topics.ts | Cancela solicitacao de delecao |
| markNotificationRead | notifications.ts | Marca notificacao como lida |
| markAllNotificationsRead | notifications.ts | Marca todas como lidas |

---

## API Routes (74 endpoints em origin/main)

> Cresceu de 14 endpoints (cobertura inicial: IA + auth + cron) para 74 com a entrada de billing (Stripe + IAP + RevenueCat), saude collab, native shell, expense audit, push APNs, onboarding-quest, referrals e coupons. Tabela abaixo segue agrupada por dominio.

### Inventario completo por dominio (origin/main, 14/05/2026)
- **IA (6)** — `ai/assistant`, `ai/context`, `ai/parse-invite`, `ai/parse-vaccines`, `ai/parse-prescription`, `backfill-occurrences`
- **Auth nativo + delete (5)** — `auth/apple-native`, `auth/google-native`, `auth/delete-account`, `auth/signout`, `auth/test-login`
- **Onboarding + grupo (8)** — `create-group`, `children`, `children/[childId]`, `children/education`, `invitations`, `family/members`, `onboarding-quest/mark-step`, `onboarding/auto-accept-invitation`
- **Saude (8)** — `health/allergies`, `health/medical-info`, `health/medication-doses`, `health/vaccines-bulk`, `health/save-prescription`, `health/emergency/[childId]`, `health/emergency/[childId]/regenerate`, `health/notify-create` (push collab Fase 3)
- **Despesas + Calendario + Atividades (7)** — `expenses`, `expenses/[id]/sign`, `swaps`, `event-requests`, `calendar/[token]`, `calendar/generate-schedule`, `activities/overrides`
- **Decisoes + Documentos + Escola + Sensitive (5)** — `decisions/vote`, `documents`, `documents/[id]/sign`, `school`, `sensitive-notes`, `settlements`
- **Chat (4)** — `chat/export`, `chat/messages`, `chat/read`, `chat/seed-channels`
- **Push (3)** — `push/subscribe`, `push/register-apns`, `push/chat`
- **Billing (8)** — `billing/status`, `iap/verify`, `stripe/checkout`, `stripe/portal`, `stripe/webhook`, `revenuecat/webhook`, `coupons/validate`, `subscription/split`
- **Cron (9)** — `cron/activity-reminders`, `cron/birthday-reminders`, `cron/custody-change`, `cron/daily-report`, `cron/monthly-report`, `cron/retention`, `cron/trial-reminder`, `cron/trial-expiry`, `cron/renewal-reminder`, `cron/iap-pending-cleanup`, `cron/webhook-events-prune`
- **Notificacoes + Ops (5)** — `notifications/mark-read`, `notifications/mark-all-read`, `log-error`, `discord/interactions`, `discord/feedback`
- **WhatsApp + Native bridge (3)** — `whatsapp/webhook`, `native/whatsapp`, `native/notify`

### Endpoints historicos detalhados


| Rota | Metodo | Funcao |
|------|--------|--------|
| `/api/ai/assistant` | POST | Assistente IA conversacional (multi-provider router, 12 tools, multi-round) |
| `/api/ai/context` | GET | Contexto familiar para IA |
| `/api/ai/parse-invite` | POST | Invite Parser: recebe imagem/PDF, OCR Tesseract.js + Groq LLM, retorna ParsedEventData |
| `/api/ai/parse-vaccines` | POST | Vaccine Card Parser: recebe foto de carteirinha, Vision AI, retorna array de ParsedVaccine |
| `/api/auth/signout` | POST | Logout via API |
| `/api/auth/test-login` | POST | Login de teste (dev only) |
| `/api/calendar/[token]` | GET | Feed iCalendar (RFC 5545, text/calendar) |
| `/api/chat/export` | GET | Exportacao de chat em PDF |
| `/api/chat/messages` | GET | Busca mensagens por canal |
| `/api/create-group` | POST | Criacao de grupo familiar + 1a crianca (1o passo do wizard de onboarding). Aceita `childSex`/`childAllergies`/`childNotes` e retorna `{ groupId, childId }` pra edit/remove imediato no wizard |
| `/api/children` | POST | Adicao de crianca subsequente ao grupo (2a/3a/... via wizard de onboarding, PWA + nativo, dual-auth Bearer/cookie) |
| `/api/children/[childId]` | PATCH/DELETE | Edita ou remove crianca via wizard (dual-auth). Valida membership + ownership do grupo antes de mutar |
| `/api/invitations` | POST | Cria convite pra co-responsavel (dual-auth). Roles aceitos: parent/grandparent/caregiver/mediator/lawyer (mediator/lawyer -> readonly, demais -> member). Usado pelo wizard de onboarding (form inline) + tela de Familia |
| `/api/cron/activity-reminders` | GET | Cron: lembretes push 24h antes + relatorios nao preenchidos (via `runCronWithReport`) |
| `/api/cron/custody-change` | GET | Cron: notificacao de mudanca de custodia (via `runCronWithReport`) |
| `/api/cron/retention` | GET | Cron: notificacoes de retencao D+1/3/7/14 (via `runCronWithReport`) |
| `/api/cron/daily-report` | GET | Cron: agrega logs do dia e envia relatorio por email |
| `/api/cron/monthly-report` | GET | Cron: relatorio mensal da crianca enviado por email aos pais (dia 1 de cada mes) |
| `/api/cron/birthday-reminders` | GET | Cron: lembrete push + in-app 7 dias antes do aniversario de cada crianca (todos os membros do grupo). Resolve 29/02 → 28/02 em anos nao-bissextos. Schedule `0 11 * * *` (~08:00 BRT). Action: `sendBirthdayReminders` em `actions/birthdays.ts` |
| `/api/push/chat` | POST | Push notification para nova mensagem |
| `/api/push/subscribe` | POST | Registro de push subscription (VAPID) |
| `/api/whatsapp/webhook` | GET/POST | WhatsApp webhook: GET verificacao Meta, POST receber mensagens. Pipeline: identity → session → parser → tools → confirmacao via botoes |
| `/api/log-error` | POST | Error tracking: captura erro, classifica por pasta, salva no Supabase, notifica Discord |
| `/api/discord/interactions` | POST | Discord Interactions Endpoint: recebe cliques de botoes (Fix with Claude / Acknowledge / Ignore) |
| `/api/discord/feedback` | POST | Webhook receptor: recebe eventos GitHub (workflow_run) e Vercel (deploy), posta resultado no Discord |

---

### Tabela: app_errors
Rastreamento de erros com classificacao por pasta e pipeline de auto-correcao.
- `id` (UUID), `message`, `stack_trace`, `file_path`, `folder_category` (app/components/lib/hooks/actions/services/supabase/unknown)
- `user_id` (FK auth.users), `severity` (warning/error/critical), `status` (new/acknowledged/fixing/fixed/ignored)
- `fix_pr_url`, `sentry_event_id`, `metadata` (JSONB), `created_at`, `updated_at`

### Modulo: Error Tracking & Auto-Fix Pipeline
- **`src/lib/error-tracking/classify.ts`** — classificacao de erros por pasta (funcao pura `classifyFolder`)
- **`src/lib/error-reporter.ts`** — utility client-side, non-blocking, com deduplicacao (60s TTL)
- **`src/lib/discord/`** — Discord client (fetch nativo, sem discord.js), channel mapping, message builder
- **`src/lib/fix-pipeline/`** — Orquestrador: Claude gera fix → GitHub cria PR → Discord recebe feedback
  - `claude-fixer.ts` — chama Anthropic API (claude-sonnet) com contexto do erro + arquivo
  - `github-pr.ts` — cria branch + commit + PR via GitHub Contents API
  - `pipeline.ts` — orquestra fluxo completo com status updates no Discord

---

## Variaveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=        # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Chave anonima (publica)
SUPABASE_SERVICE_ROLE_KEY=       # Chave de servico (privada, apenas server-side)
NEXT_PUBLIC_APP_URL=             # URL do app (http://localhost:3000 em dev)
NEXT_PUBLIC_POSTHOG_KEY=         # Chave PostHog (analytics)
NEXT_PUBLIC_POSTHOG_HOST=        # Host PostHog
SENTRY_DSN=                      # DSN do Sentry (error tracking)
GROQ_API_KEY=                    # Chave API do Groq (provider primario IA)
TOGETHER_API_KEY=                # Chave API do Together (fallback IA)
GEMINI_API_KEY=                  # Chave API do Gemini (ultimo recurso IA)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=    # Chave publica VAPID (push)
VAPID_PRIVATE_KEY=               # Chave privada VAPID
WHATSAPP_ACCESS_TOKEN=           # Token permanente do System User Meta (WhatsApp)
WHATSAPP_PHONE_NUMBER_ID=        # ID do numero de telefone WhatsApp
WHATSAPP_BUSINESS_ACCOUNT_ID=    # ID da conta WhatsApp Business
WHATSAPP_APP_SECRET=             # App Secret para validacao HMAC do webhook
WHATSAPP_VERIFY_TOKEN=           # Token customizado para verificacao do webhook Meta
DISCORD_BOT_TOKEN=               # Token do bot Discord
DISCORD_APPLICATION_ID=          # ID da aplicacao Discord
DISCORD_PUBLIC_KEY=              # Chave publica para verificacao de assinatura
DISCORD_CHANNEL_ERRORS=          # ID do canal Discord para erros (MVP: canal unico)
ANTHROPIC_API_KEY=               # Chave API Anthropic (Claude, para auto-fix)
GITHUB_TOKEN=                    # Fine-grained PAT com repo contents + pull requests
GITHUB_REPO_OWNER=              # Owner do repo GitHub
GITHUB_REPO_NAME=               # Nome do repo GitHub
GITHUB_WEBHOOK_SECRET=           # Secret para verificacao de webhooks GitHub
```

---

## Usuarios de Teste

| Usuario | Email | Senha | Papel |
|---------|-------|-------|-------|
| Bruno Silva | bruno@kindar.test | Kindar@2026 | Pai (admin) |
| Martina Oliveira | martina@kindar.test | Kindar@2026 | Mae (member) |

**Grupo:** Familia Kleber
**Crianca:** Kleber Silva Oliveira (5 anos)

---

## Deploy

- **Plataforma:** Vercel (Hobby plan)
- **URL:** https://kindar.com.br
- **Branch:** main
- **Auto-deploy:** Sim (push para main aciona deploy automatico)
- **Build:** `next build`

---

## Conformidade

- **LGPD**: Campo `lgpd_consent_at` no perfil para registro de consentimento
- **Mensagens imutaveis**: Chat com triggers que impedem DELETE e UPDATE do texto (conformidade legal)
- **RLS**: Isolamento total de dados por grupo familiar
- **Tokens seguros**: iCal usa tokens hex de 32 bytes (nao exige autenticacao por cookie)
- **Auth segura**: Todas as actions usam `getUser()` (valida JWT no servidor)
- **Delecao dual-approval**: Temas sensiveis requerem aprovacao de ambos para excluir
- **Auto-aprovacao de despesas bloqueada**: nenhum usuario pode aprovar propria despesa
- **Regressao de status impedida**: despesas aprovadas/rejeitadas nao voltam para pending
- **Validacao server-side**: acertos financeiros, intervalo entre doses, status de doenca
- **Validacao server-side de MIME type** em uploads (documents.ts, children.ts, events.ts)
- **Sanitizacao de input**: campos de saude com max length limits

---

## Estrutura de Arquivos

```
src/
├── actions/              # 23 arquivos, 84 server actions
│   ├── activities.ts     # 13 funcoes: CRUD + relatorios + editar ocorrencia + trocar responsavel
│   ├── agreements.ts     # createAgreement, acceptAgreement
│   ├── auth.ts           # signUp, signIn, signOut, resetPassword, signInWithOAuth, updatePassword
│   ├── calendar.ts       # createCustodyEvent, createSwapRequest, respondToSwapRequest, generateSchedule, clearCustodySchedule, getOrCreateCalendarToken
│   ├── chat-channels.ts  # ensureDefaultChannels, markChannelRead
│   ├── checkin.ts        # createCheckin
│   ├── children.ts       # upsertChildEducation, uploadChildDocument
│   ├── decisions.ts      # createDecision, castVote, addArgument
│   ├── documents.ts      # createDocument
│   ├── events.ts         # createEvent, updateEvent, deleteEvent, cancelEvent, respondToEventRequest, getPendingEventRequests, eventHasPendingRequest
│   ├── expenses.ts       # createExpense, updateExpenseStatus, deleteExpense
│   ├── group.ts          # createGroup, addChild, updateChild
│   ├── group-switch.ts   # switchGroup
│   ├── health.ts         # 16 funcoes: appointments, medications, illnesses, allergies, vaccines, growth, professionals, trackHealthView
│   ├── invitation.ts     # createInvitation, acceptInvitation, autoAcceptPendingInvitations
│   ├── members.ts        # changeMemberRole, removeMember, leaveGroup, cancelInvitation, deleteInvitation
│   ├── notes.ts          # createNote, updateNote, deleteNote
│   ├── notifications.ts  # markNotificationRead, markAllNotificationsRead
│   ├── profile.ts        # updateProfile
│   ├── school.ts         # createSchoolLog
│   ├── sensitive.ts      # createSensitiveNote
│   ├── sensitive-topics.ts # requestDeletion, approveDeletion, cancelDeletion
│   └── settlements.ts    # createSettlement, confirmSettlement
├── app/
│   ├── (auth)/           # 5 paginas publicas + layout
│   ├── (app)/            # Rotas protegidas + layout (com I18nProvider)
│   │   ├── atividades/   # Atividades recorrentes (redirect -> /calendario)
│   │   ├── calendario/   # Agenda unificada
│   │   │   ├── CalendarClient.tsx, CalendarGrid.tsx, CalendarHeader.tsx
│   │   │   ├── DayDetailSheet.tsx, WeekendPlanner.tsx
│   │   │   ├── SwapRequestList.tsx, SwapRequestModal.tsx, SwapBalanceCard.tsx
│   │   │   ├── CalendarExportButton.tsx
│   │   │   ├── escala/   # ScheduleBuilder, EscalaHeader
│   │   │   └── novo/     # NewCompromissoForm, NovoHeader
│   │   ├── chat/         # ChatRoom, ChannelTabs
│   │   ├── checkin/      # CheckinForm, CheckinClient
│   │   ├── criancas/     # Lista + perfil com 4 abas (ChildrenClient, ChildDetailClient, NewChildClient)
│   │   ├── decisoes/     # Decisoes em grupo
│   │   ├── despesas/     # ExpensesClient, DeleteExpenseButton, ReceiptViewer, NewExpenseHeader
│   │   ├── documentos/   # DocumentList, DocumentViewer, DocumentsDashboard, DocumentsClient
│   │   ├── financeiro/   # FinancialDashboard, FinanceiroHeader
│   │   ├── notas/        # Notas privadas
│   │   ├── notificacoes/ # Central de notificacoes
│   │   ├── perfil/       # EditProfileForm, ProfileContent, LanguageSelector
│   │   ├── saude/        # 8 sub-modulos + export + componentes auxiliares
│   │   │   ├── SaudeClient, HealthViewTracker, SubmitButton, ViewedByBadge, ConfirmDoseButton
│   │   │   ├── alergias/ (AlergiasClient, AllergyFormClient)
│   │   │   ├── consultas/ (ConsultasClient, CompleteAppointmentForm, WhatsAppScheduleButton)
│   │   │   ├── crescimento/ (CrescimentoClient, GrowthChart, GrowthFormClient)
│   │   │   ├── doencas/ (DoencasClient, ResolveButton, UpdateEpisodeForm, DoencaNovaClient, IllnessFormClient)
│   │   │   ├── emergencia/ (EmergencyCardClient)
│   │   │   ├── export/
│   │   │   ├── medicamentos/ (MedicamentosClient, MedicationFormClient, [id]/)
│   │   │   ├── profissionais/ (ProfissionaisClient, ProfessionalFormClient)
│   │   │   └── vacinas/ (VacinasClient, VaccineFormClient)
│   │   ├── acordos/      # AcordosClient
│   │   ├── temas-sensiveis/ # SensitiveTopicsClient
│   │   ├── familia/      # FamiliaClient, MemberActions
│   │   ├── escola/       # EscolaClient
│   │   ├── onboarding/   # OnboardingForm (wizard premium: familia → criancas com loop → convite), ConviteClient
│   │   └── convite/enviar/ # InviteClient
│   └── api/
│       ├── ai/           # assistant + context (2 routes)
│       ├── auth/         # signout + test-login (2 routes)
│       ├── calendar/[token]/ # iCal feed (1 route)
│       ├── chat/         # messages + export (2 routes)
│       ├── create-group/ # (1 route) cria grupo + 1a crianca via wizard (aceita sex/allergies/notes; retorna childId)
│       ├── children/     # POST adiciona crianca + [childId] PATCH/DELETE edita/remove (dual-auth, wizard multi-child)
│       ├── cron/         # 5 routes via runCronWithReport: activity-reminders, custody-change, retention, daily-report, monthly-report
│       └── push/         # subscribe + chat (2 routes)
├── components/           # 12 componentes globais
│   ├── BottomNav.tsx, Sidebar.tsx, ResponsiveShell.tsx
│   ├── GroupSelector.tsx, LanguageSelector.tsx
│   ├── NotificationBadge.tsx, AIAssistant.tsx, KindarLogo.tsx
│   └── PushNotificationManager.tsx
├── i18n/                 # Sistema de internacionalizacao
│   └── locales/          # pt.json, en.json, es.json, fr.json, de.json (~1488 chaves, 40 secoes)
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts, admin.ts (service role)
│   ├── ai/               # Modulo AI centralizado
│   │   ├── core/         # types, config, logger, usage tracking, service (generateAIResponse)
│   │   ├── providers/    # Groq, Together, Gemini providers
│   │   ├── router.ts     # Multi-provider router (Groq → Together → Gemini)
│   │   ├── image-utils.ts # Compressao de imagem para vision APIs
│   │   ├── ai-actions.ts, ai-cache.ts, ai-context.ts, ai-local-parser.ts, ai-rate-limit.ts, ai-tools.ts
│   │   └── parser/       # Invite Parser modular (types, interface, ocr, groq-event-parser, pilot-parser, index)
│   ├── calendar-utils.ts # getDaysInMonth, getMonthGrid, buildCustodyMap, computeSwapBalance, getBrazilToday, getBrazilNow
│   ├── recurrence-utils.ts # getOccurrences, occursOnDate, getNextOccurrence, RECURRENCE_OPTIONS
│   ├── constants.ts      # COLORS, EXPENSE_CATEGORIES, CHECKIN_CATEGORIES, ACTIVITY_CATEGORIES, DEFAULT_CHECKLIST_ITEMS, PARENT_COLORS
│   ├── push.ts           # createNotificationWithPush (web-push VAPID)
│   ├── auth-utils.ts     # verifyGroupMembership
│   ├── brazilian-holidays.ts # Feriados nacionais (fixos + moveis)
│   ├── ical.ts           # generateICalFeed (RFC 5545)
│   ├── tone-moderator.ts # Analise de tom para chat
│   ├── chat-notify.ts    # postChatNotification()
│   ├── group-utils.ts    # getActiveGroup()
│   ├── share-utils.ts    # formatActivityShareText, shareText (Web Share API + wa.me fallback)
│   ├── capacitor.ts, haptics.ts # Bridge Capacitor + haptic feedback
│   ├── posthog.ts, posthog-server.ts # Analytics
│   └── health-constants.ts, sbp-vaccine-calendar.ts, who-growth-data.ts
└── middleware.ts          # Auth middleware
```
