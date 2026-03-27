# Kindar - Documentacao Tecnica Completa

## Visao Geral

**Kindar** e um aplicativo de coparentalidade que ajuda pais separados a organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa. O nome "Kindar" representa os dois lares da crianca.

**URL de producao:** https://kindar.com.br
**Dominio:** kindar.com.br
**Ultima atualizacao:** 27/03/2026

---

## Stack Tecnologica

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.1.7 |
| UI | React | 19.2.3 |
| Linguagem | TypeScript | ^5 |
| Estilizacao | Tailwind CSS | ^4 |
| Backend/BaaS | Supabase (PostgreSQL) | ^2.99.2 |
| Auth | Supabase Auth + SSR | ^0.9.0 |
| IA | Groq (Llama 3.3 70B) | Cloud API |
| i18n | Custom (I18nProvider + useI18n) | 5 idiomas, ~1405 chaves, 38 secoes |
| Analytics | PostHog | 30+ eventos |
| Error Tracking | Sentry | — |
| Deploy | Vercel | Hobby |
| Mobile | Capacitor | ^7 |
| Testes E2E | Playwright | 34 testes |
| Testes Unitarios | Vitest | 50 testes |
| Repositorio | GitHub | hdpedro/CoPais |

---

## Arquitetura

```
src/
├── actions/          # Server Actions (23 arquivos, 84 funcoes)
├── app/
│   ├── (auth)/       # Rotas publicas (login, signup, etc.)
│   ├── (app)/        # Rotas protegidas (dashboard, calendario, etc.)
│   └── api/          # API Routes (12 endpoints)
├── components/       # Componentes globais (12 arquivos)
│   ├── BottomNav.tsx, Sidebar.tsx, ResponsiveShell.tsx
│   ├── GroupSelector.tsx, LanguageSelector.tsx
│   ├── NotificationBadge.tsx, AIAssistant.tsx, KindarLogo.tsx
│   └── PushNotificationManager.tsx
├── i18n/             # Sistema de internacionalizacao
│   └── locales/      # pt.json, en.json, es.json, fr.json, de.json (~1405 chaves, 38 secoes)
├── lib/
│   ├── supabase/     # Client, Server, Middleware
│   ├── ai-actions.ts, ai-cache.ts, ai-context.ts, ai-local-parser.ts, ai-rate-limit.ts, ai-tools.ts
│   ├── constants.ts  # Constantes do app (cores, categorias, checklist items)
│   ├── calendar-utils.ts  # Utilidades de data/calendario + computeSwapBalance()
│   ├── recurrence-utils.ts # Motor de recorrencia (diario, semanal, etc.)
│   ├── push.ts       # Push notifications (web-push, VAPID)
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

---

## Internacionalizacao (i18n)

### Visao Geral
- **5 idiomas**: Portugues (BR), Ingles, Espanhol, Frances, Alemao
- **~1405 chaves** de traducao por locale
- **38 secoes** tematicas

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

common, nav, dashboard, calendar, chat, checkin, expenses, financial, health, children, documents, agreements, events, activities, sensitive, school, profile, family, invitations, onboarding, more, notifications, settlements, swap, schedule, export, appointments, medications, illnesses, allergies, vaccines, growth, professionals, decisions, newForm, notes, ai, activityReport.

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
- `Promise.all()` para executar 5 queries em paralelo (custody_events, children, activities, events, swap_requests)
- `useMemo` no grid mensal para evitar recalculos desnecessarios
- `useCallback` nos handlers de click/navegacao
- Fix de timezone: `getBrazilNow()` para horario correto no fuso BR

**Dashboard:**
- 5 queries de `custody_events` consolidadas em 1 unica query
- Todas as queries do dashboard executam em paralelo

**Chat:**
- Cache LRU em memoria (ate 5 canais) para troca instantanea de canais
- Client-side channel switching sem reload de pagina

**Geral:**
- Dynamic imports para 6 componentes pesados (AIAssistant, GrowthChart, etc.)
- `React.memo` em ChatRoom MessageBubble
- `useMemo` em DashboardClient, FinancialDashboard, CalendarGrid e `useCallback` em componentes frequentemente re-renderizados
- i18n lazy loading (apenas locale padrao carregado, demais sob demanda)
- Performance indexes no banco (migration 00025)
- PostHog: 30+ eventos rastreados em todas as actions
- Sentry: error tracking em producao
- Calendar API otimizada (3.1s em vez de timeout)
- Landing page otimizada (cookie check antes de `getUser()`)

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
| notification_type | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system, activity, activity_reminder |
| invitation_status | pending, accepted, expired, revoked |

### Tabelas (35+ total)

#### 1. profiles
Extensao da tabela `auth.users` do Supabase. Criado automaticamente via trigger no signup.
- `id`, `full_name`, `display_name`, `email`, `phone`, `role` (user_role), `avatar_url`, `locale`, `lgpd_consent_at`

#### 2. coparenting_groups
Grupo familiar que conecta os responsaveis.
- `id`, `name`, `created_by` (FK profiles)

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

#### 27-35. Tabelas adicionais
Incluem: `push_subscriptions`, `chat_channel_reads`, `agreements`, `school_logs`, `appointments`, `medications`, `medication_doses`, `illness_episodes`, `allergies`, `medical_info`, `vaccination_records`, `growth_records`, `professionals`, entre outras criadas nas migrations de saude e financeiro.

### Seguranca (Row Level Security)

Todas as tabelas possuem RLS habilitado. Funcoes auxiliares:
- `is_group_member(group_id)` - verifica se o usuario pertence ao grupo
- `is_group_admin(group_id)` - verifica se o usuario e admin do grupo

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

### Migrations (29 total)

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

---

## Funcionalidades Implementadas

### 1. Dashboard (`/dashboard`)
- Saudacao personalizada com nome do usuario e data
- Card "Guarda ativa" com info de custodia por filho, streak de dias, proxima troca
- Visao da semana (7 dias com cores de guarda + feriados)
- **Alertas de saude**: medicamentos ativos, alergias criticas, consultas proximas, doencas ativas
- **Atividades do dia/amanha**: cards com icone de categoria, horario, checklist preview
- **Eventos sociais** integrados na mesma secao de atividades
- **Decisoes pendentes** com urgencia e contagem de votos
- **Relatorios de atividade pendentes**
- Card "Agenda" com proximos compromissos (guarda especial + atividades + eventos)
- Resumo financeiro do mes com saldo entre responsaveis
- Despesas pendentes de aprovacao
- Check-ins recentes
- Acoes rapidas (Agenda, Despesas, Check-in, Chat, Saude, Documentos)
- **Performance**: queries consolidadas e paralelas
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
- **Performance**: `Promise.all()` para 5 queries paralelas, `useMemo` no grid, `useCallback` nos handlers

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
- **Medicamentos** (`/saude/medicamentos`): nome, dosagem, frequencia, horarios, status (ativo/pausado/completo/cancelado), registro de doses, historico, **pagina de detalhe** (`/saude/medicamentos/[id]`). **Validacao server-side de intervalo entre doses** (< 30 min rejeitado). `ConfirmDoseButton` na lista de medicamentos
- **Consultas** (`/saude/consultas`): agendamento com profissional, tipo (rotina/emergencia/retorno/exame), local, data retorno, diagnostico, prescricoes, status (agendada/concluida/cancelada/faltou), formulario de conclusao (`CompleteAppointmentForm` com i18n), botao WhatsApp para agendar
- **Alergias** (`/saude/alergias`): tipo, severidade, reacao, info medica (tipo sanguineo, convenio, SUS). **Edicao e exclusao inline** com formulario (`AllergyFormClient`). Service role usado para query (workaround de RLS). Fix de coluna `notes` inexistente na query. Link `/saude/alergias/editar-info` corrigido (scroll ate formulario)
- **Vacinas** (`/saude/vacinas`): comparacao com calendario SBP, doses, lotes, local aplicacao, confirmacao de dose (`ConfirmDoseButton`)
- **Crescimento** (`/saude/crescimento`): peso, altura, perimetro cefalico, **grafico visual** (`GrowthChart`), comparacao WHO
- **Profissionais** (`/saude/profissionais`): diretorio com especialidade, CRM, telefone, WhatsApp
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
- **Relatorios de atividade**: status (completa/faltou/cancelada), humor da crianca, notas. **Modal reseta campos** ao abrir para nova atividade
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
- **Modelo**: Groq `llama-3.3-70b-versatile` com function calling
- **12 tools Groq-compatible** (`src/lib/ai-tools.ts`):
  - **6 tools de acao**: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`
  - **5 tools de consulta**: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
  - **1 tool de comunicacao**: `draft_message`
- **API Route**: `src/app/api/ai/assistant/route.ts` — multi-round tool calling (ate 3 rodadas com `tool_choice: "auto"`, resposta final forcada com `tool_choice: "none"`)
- **Contexto familiar** (`ai-context.ts`): constroi contexto com filhos, membros do grupo e custodia
- **React Portal**: renderiza em `document.body` via `createPortal` (escapa CSS `backdrop-blur` containing block no header mobile)
- **Integracao**: botao IA no header mobile + botao flutuante no desktop (`ResponsiveShell.tsx`)
- **Rate limiting** (`ai-rate-limit.ts`) por usuario com mensagens amigaveis
- **Cache de respostas** (`ai-cache.ts`) com TTL de 5 minutos
- **Decisoes tecnicas**: parametros de tools usam `type: "string"` (Groq rejeita `"number"` com outputs do LLM); tabela `children` usa `full_name`; info escolar via join com `child_education`
- **SSR-safe**: container do Portal usa `useState` + `useEffect`
- **50 testes unitarios** (Vitest) com **98.5% de acuracia** em load test
- API Routes: `/api/ai/assistant`, `/api/ai/context`

### 27. Notificacoes (`/notificacoes`)
- Central de notificacoes in-app
- Web push via VAPID
- Badge count (`NotificationBadge.tsx`)
- 12 tipos de notificacao
- `markNotificationRead`, `markAllNotificationsRead`

### 28. Mais (`/mais`)
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

---

## Server Actions (84 funcoes em 23 arquivos)

| Action | Arquivo | Funcao |
|--------|---------|--------|
| createCustodyEvent | calendar.ts | Cria evento de guarda (unico ou recorrente) |
| createSwapRequest | calendar.ts | Solicita troca de dia |
| respondToSwapRequest | calendar.ts | Aprova/rejeita troca |
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
| trackHealthView | health.ts | Rastreia visualizacao |
| createGrowthRecord | health.ts | Registra crescimento + push |
| upsertChildEducation | children.ts | Info escolares |
| uploadChildDocument | children.ts | Upload documento por crianca |
| createDocument | documents.ts | Upload documento |
| createAgreement | agreements.ts | Registra acordo |
| acceptAgreement | agreements.ts | Aceita acordo |
| createEvent | events.ts | Cria evento |
| updateEvent | events.ts | Atualiza evento |
| deleteEvent | events.ts | Remove evento |
| cancelEvent | events.ts | Cancela evento |
| createActivity | activities.ts | Cria atividade + checklist + push |
| deleteActivity | activities.ts | Remove atividade |
| toggleChecklistItem | activities.ts | Marca/desmarca checklist |
| sendActivityReminders | activities.ts | Push 24h antes (cron) |
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
| createSensitiveNote | sensitive.ts | Cria tema sensivel |
| requestDeletion | sensitive-topics.ts | Solicita delecao (dual-approval) |
| approveDeletion | sensitive-topics.ts | Aprova delecao |
| cancelDeletion | sensitive-topics.ts | Cancela solicitacao de delecao |
| markNotificationRead | notifications.ts | Marca notificacao como lida |
| markAllNotificationsRead | notifications.ts | Marca todas como lidas |

---

## API Routes (12 endpoints)

| Rota | Metodo | Funcao |
|------|--------|--------|
| `/api/ai/assistant` | POST | Assistente IA conversacional (Groq function calling, 12 tools, multi-round) |
| `/api/ai/context` | GET | Contexto familiar para IA |
| `/api/auth/signout` | POST | Logout via API |
| `/api/auth/test-login` | POST | Login de teste (dev only) |
| `/api/calendar/[token]` | GET | Feed iCalendar (RFC 5545, text/calendar) |
| `/api/chat/export` | GET | Exportacao de chat em PDF |
| `/api/chat/messages` | GET | Busca mensagens por canal |
| `/api/create-group` | POST | Criacao de grupo familiar |
| `/api/cron/activity-reminders` | GET | Cron: lembretes push 24h antes |
| `/api/cron/custody-change` | GET | Cron: notificacao de mudanca de custodia |
| `/api/push/chat` | POST | Push notification para nova mensagem |
| `/api/push/subscribe` | POST | Registro de push subscription (VAPID) |

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
GROQ_API_KEY=                    # Chave API do Groq (assistente IA)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=    # Chave publica VAPID (push)
VAPID_PRIVATE_KEY=               # Chave privada VAPID
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
│   ├── events.ts         # createEvent, updateEvent, deleteEvent, cancelEvent
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
│   │   │   ├── export/
│   │   │   ├── medicamentos/ (MedicamentosClient, MedicationFormClient, [id]/)
│   │   │   ├── profissionais/ (ProfissionaisClient, ProfessionalFormClient)
│   │   │   └── vacinas/ (VacinasClient, VaccineFormClient)
│   │   ├── acordos/      # AcordosClient
│   │   ├── temas-sensiveis/ # SensitiveTopicsClient
│   │   ├── familia/      # FamiliaClient, MemberActions
│   │   ├── escola/       # EscolaClient
│   │   ├── onboarding/   # OnboardingForm, OnboardingHeader, ConviteClient
│   │   └── convite/enviar/ # InviteClient
│   └── api/
│       ├── ai/           # assistant + context (2 routes)
│       ├── auth/         # signout + test-login (2 routes)
│       ├── calendar/[token]/ # iCal feed (1 route)
│       ├── chat/         # messages + export (2 routes)
│       ├── create-group/ # (1 route)
│       ├── cron/         # activity-reminders + custody-change (2 routes)
│       └── push/         # subscribe + chat (2 routes)
├── components/           # 12 componentes globais
│   ├── BottomNav.tsx, Sidebar.tsx, ResponsiveShell.tsx
│   ├── GroupSelector.tsx, LanguageSelector.tsx
│   ├── NotificationBadge.tsx, AIAssistant.tsx, KindarLogo.tsx
│   └── PushNotificationManager.tsx
├── i18n/                 # Sistema de internacionalizacao
│   └── locales/          # pt.json, en.json, es.json, fr.json, de.json (~1405 chaves, 38 secoes)
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts
│   ├── ai-actions.ts, ai-cache.ts, ai-context.ts, ai-local-parser.ts, ai-rate-limit.ts, ai-tools.ts
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
│   ├── health-constants.ts, sbp-vaccine-calendar.ts, who-growth-data.ts
│   └── supabase/
│       ├── client.ts     # createBrowserClient
│       ├── server.ts     # createServerClient
│       └── middleware.ts  # updateSession
└── middleware.ts          # Auth middleware
```
