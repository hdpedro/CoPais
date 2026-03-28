# Kindar - Manual de Desenvolvimento

> Manual completo para desenvolvedores que vao trabalhar no projeto Kindar.
> Ultima atualizacao: 27/03/2026

---

## Indice

1. [Visao Geral do Projeto](#1-visao-geral-do-projeto)
2. [Stack Tecnologica](#2-stack-tecnologica)
3. [Setup do Ambiente Local](#3-setup-do-ambiente-local)
4. [Configuracao do Supabase (Banco de Dados)](#4-configuracao-do-supabase-banco-de-dados)
5. [Arquitetura do Projeto](#5-arquitetura-do-projeto)
6. [Estrutura de Pastas Completa](#6-estrutura-de-pastas-completa)
7. [Rotas e Paginas](#7-rotas-e-paginas)
8. [Server Actions](#8-server-actions)
9. [Autenticacao e Middleware](#9-autenticacao-e-middleware)
10. [Banco de Dados - Schema Completo](#10-banco-de-dados---schema-completo)
11. [Row Level Security (RLS)](#11-row-level-security-rls)
12. [Internacionalizacao (i18n)](#12-internacionalizacao-i18n)
13. [Design System](#13-design-system)
14. [Padrao Server/Client Split](#14-padrao-serverclient-split)
15. [Funcionalidades Implementadas](#15-funcionalidades-implementadas)
16. [Seguranca](#16-seguranca)
17. [Performance](#17-performance)
18. [Acessibilidade](#18-acessibilidade)
19. [Deploy no Vercel](#19-deploy-no-vercel)
20. [Usuarios de Teste e Seed](#20-usuarios-de-teste-e-seed)
21. [Guia de Contribuicao](#21-guia-de-contribuicao)
22. [Troubleshooting](#22-troubleshooting)
23. [Decisoes Arquiteturais](#23-decisoes-arquiteturais)

---

## 1. Visao Geral do Projeto

**Kindar** e um aplicativo de coparentalidade que ajuda pais separados a organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa. O nome "Kindar" representa os dois lares da crianca.

- **URL de producao:** https://kindar.com.br
- **Repositorio GitHub:** hdpedro/CoPais
- **Idiomas da UI:** Portugues (BR), Ingles, Espanhol, Frances, Alemao

---

## 2. Stack Tecnologica

| Camada | Tecnologia | Versao | Por que foi escolhida |
|--------|-----------|--------|----------------------|
| Framework | Next.js (App Router) | 16.1.7 | Server Components, Server Actions, file-based routing |
| UI | React | 19.2.3 | Ultima versao com melhorias de performance |
| Linguagem | TypeScript | ^5 | Tipagem estatica, menos bugs |
| Estilizacao | Tailwind CSS | ^4 | Utility-first, produtividade, zero CSS custom |
| Backend/BaaS | Supabase (PostgreSQL) | ^2.99.2 | Auth + DB + RLS em um unico servico |
| Auth | Supabase Auth + SSR | ^0.9.0 | Session management com cookies no server |
| i18n | Custom (I18nProvider + useI18n) | — | 5 idiomas, ~1405 chaves, 38 secoes |
| Deploy | Vercel | Hobby | Zero-config para Next.js, auto-deploy |
| IA | Groq (Llama 3.3 70B → 8B fallback) | Cloud API | Assistente conversacional com function calling (12 tools, multi-round), parsers robustos PT-BR |
| Analytics | PostHog | — | 30+ eventos rastreados |
| Error Tracking | Sentry | — | Monitoramento de erros em producao |
| Testes E2E | Playwright | — | 34 testes |
| Testes Unitarios | Vitest | — | 50 testes (AI parser) |
| Mobile | Capacitor | ^7 | Hybrid app iOS/Android via webview nativa |

### Capacitor (iOS App Store)

O app usa Capacitor para distribuicao na App Store. Configuracao em `capacitor.config.ts`.

**Plugins instalados:**
- `@capacitor/core` + `@capacitor/cli` — Core do Capacitor
- `@capacitor/ios` — Plataforma iOS
- `@capacitor/status-bar` — Controle da barra de status nativa
- `@capacitor/splash-screen` — Splash screen nativa
- `@capacitor/haptics` — Feedback haptico (vibracoes)
- `@capacitor/keyboard` — Controle do teclado virtual
- `@capacitor/app` — Eventos do app (back button, state change)

**Utilitarios:**
- `src/lib/capacitor.ts` — Bridge com funcoes safe (no-op no browser)
- `src/lib/haptics.ts` — Haptic feedback com fallback Web Vibration API

**CSS iOS / Mobile UX Nativo:**
- Safe areas via `env(safe-area-inset-*)` em `globals.css`
- Classes utilitarias: `.safe-area-top`, `.safe-area-bottom`
- Prevencao de zoom em inputs (font-size 16px)
- Overscroll bounce desabilitado (`overscroll-behavior: none`)
- Tap highlight transparente em botoes/links
- Touch targets minimos de 44x44px (Apple HIG) em BottomNav, CalendarGrid, ChatRoom, ChannelTabs
- Active states com `scale(0.97)` em dispositivos touch (media query `hover: none`)
- Header fixo com backdrop-blur no mobile (nao se move com scroll)
- Bottom nav se esconde automaticamente quando teclado virtual abre (visualViewport API)
- Transicao de pagina suave com `page-transition` CSS animation (200ms fade-in + translateY)
- Haptic feedback via `src/lib/haptics.ts` em: troca de tab, clique em dia, envio de mensagem
- Loading states em skeleton (animate-pulse), nunca spinners — **7 arquivos loading.tsx**
- **Service Worker v3** com navigation caching
- **Pagina offline** dedicada (`/offline.html`)
- **Viewport fit cover**, sem zoom em inputs (font-size 16px)

**Para buildar (requer Mac + Xcode):**
```bash
npx cap add ios && npx cap sync ios && npx cap open ios
```

### Dependencias Completas (package.json)

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.9.0",
    "@supabase/supabase-js": "^2.99.2",
    "next": "16.1.7",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.7",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

> **Nota:** O projeto usa ZERO dependencias externas de UI (nenhum Material UI, Chakra, Radix, etc.). Todos os componentes sao escritos do zero com Tailwind.

---

## 3. Setup do Ambiente Local

### Pre-requisitos

- Node.js 20+
- npm 10+
- Conta no Supabase (gratuita)
- Conta no Vercel (opcional, para deploy)

### Passo a Passo

```bash
# 1. Clonar o repositorio
git clone https://github.com/hdpedro/CoPais.git
cd CoPais

# 2. Instalar dependencias
npm install

# 3. Copiar variaveis de ambiente
cp .env.example .env.local

# 4. Preencher .env.local (ver secao de Supabase abaixo)

# 5. Rodar o projeto
npm run dev

# 6. Acessar http://localhost:3000
```

### Variaveis de Ambiente (.env.local)

```env
# URL do projeto Supabase (obrigatorio)
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co

# Chave anonima publica (obrigatorio)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Chave de servico (apenas para scripts de seed, NAO vai para o Vercel)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# URL do app
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Scripts Disponiveis

| Comando | Descricao |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento (port 3000) |
| `npm run build` | Build de producao |
| `npm run start` | Inicia servidor de producao (apos build) |
| `npm run lint` | Executa ESLint |

---

## 4. Configuracao do Supabase (Banco de Dados)

### 4.1 Criar Projeto no Supabase

1. Acesse https://supabase.com e crie uma conta
2. Clique em **"New Project"**
3. Escolha um nome (ex: `kindar`)
4. Selecione a regiao mais proxima (ex: `South America (Sao Paulo)`)
5. Defina uma senha para o banco (guarde-a!)
6. Aguarde o projeto ser criado (~2 minutos)

### 4.2 Obter as Chaves

Apos o projeto ser criado:

1. Va em **Settings > API** no painel do Supabase
2. Copie:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** -> `SUPABASE_SERVICE_ROLE_KEY` (apenas para scripts locais)

### 4.3 Executar as Migrations

As migrations estao em `supabase/migrations/`. Execute-as **na ordem** no SQL Editor do Supabase:

1. **Acesse:** Supabase Dashboard > **SQL Editor**
2. Execute cada arquivo na ordem:

```
supabase/migrations/00001_initial_schema.sql
supabase/migrations/00002_rls_policies.sql
supabase/migrations/00003_calendar_tokens.sql
...demais migrations na ordem numerica...
supabase/migrations/00022_child_profile_tabs.sql
```

**IMPORTANTE:** Execute na ordem! Cada migration depende das anteriores.

### 4.4 O Que Cada Migration Faz

| Arquivo | Conteudo |
|---------|----------|
| `00001_initial_schema.sql` | Cria 12 tabelas, 9 enums, triggers (auto-profile, chat imutavel, updated_at), 12 indexes |
| `00002_rls_policies.sql` | Habilita RLS em todas as tabelas, cria funcoes `is_group_member()` e `is_group_admin()`, 22 policies |
| `00003_calendar_tokens.sql` | Tabela `calendar_tokens`, tabela `daily_checkins`, colunas recorrentes em `custody_events` |
| `00010_activities_checklist.sql` | Tabelas `child_activities`, `activity_checklist_items`, `checklist_completions` + RLS |
| `00011_rename_day_of_week_to_days.sql` | Rename coluna day_of_week para days |
| `00012_activity_all_children.sql` | child_id nullable em child_activities |
| `00013_illness_hospital_severity.sql` | Campos hospital e severidade em doencas |
| `00015_health_views.sql` | Tabela health_views para rastreamento de visualizacoes |
| `00016_receipts_storage_bucket.sql` | Bucket de storage para comprovantes |
| `00017_health_indexes.sql` | Indexes otimizados para queries de saude |
| `00018_documents_storage_bucket.sql` | Bucket de storage para documentos |
| `00019_private_notes.sql` | Tabela private_notes + RLS |
| `00020_decisions.sql` | Tabela decisions + RLS |
| `00021_chat_channels.sql` | Tabela chat_channels + FK em chat_messages |
| `00022_child_profile_tabs.sql` | Campos cpf/rg em children + tabela child_education |
| `00023_activity_reports.sql` | Tabela activity_reports (status, humor, notas) + RLS |
| `00024_events_assigned_to.sql` | Campos assigned_to, end_date, all_day em events |
| `00025_performance_indexes.sql` | Indexes de performance (chat, swap_requests) |
| `00026_sensitive_topic_deletion.sql` | Campos de delecao dual-approval em sensitive_notes |
| `00027_activity_responsible_override.sql` | Campo responsible_override em activity_reports |
| `00028_activity_extra_fields.sql` | Campos teacher_name, class_name, room, responsible_id em child_activities |
| `00029_activity_occurrence_overrides.sql` | Campo overrides (JSONB) em activity_reports |

### 4.5 Verificar a Instalacao

Apos rodar as migrations, verifique no Supabase:

1. **Table Editor** -> deve mostrar 23+ tabelas
2. **Authentication > Policies** -> cada tabela deve ter RLS habilitado (cadeado verde)
3. **Database > Functions** -> deve ter `is_group_member`, `is_group_admin`, `handle_new_user`, `prevent_chat_delete`, `prevent_chat_text_update`, `update_updated_at`

### 4.6 Popular com Dados de Teste (Seed)

```bash
# Requer SUPABASE_SERVICE_ROLE_KEY no .env.local
node scripts/seed-test.mjs
```

Isso cria:
- **Bruno Silva** (bruno@kindar.test) — Pai, admin do grupo
- **Martina Oliveira** (martina@kindar.test) — Mae, membro do grupo
- **Grupo:** Familia Kleber
- **Crianca:** Kleber Silva Oliveira (nascimento: 15/06/2020)
- Eventos de guarda de exemplo
- Despesas de exemplo
- Mensagens de chat de exemplo
- Acordos e registros escolares de exemplo

**Senha de ambos:** `Kindar@2026`

### 4.7 Configuracoes Adicionais do Supabase

No painel do Supabase, configure:

1. **Authentication > URL Configuration:**
   - Site URL: `https://kindar.vercel.app` (producao) ou `http://localhost:3000` (dev)
   - Redirect URLs: adicione ambas as URLs acima

2. **Authentication > Email Templates:** (opcional)
   - Personalize os emails de confirmacao/reset em portugues

3. **Authentication > Providers:**
   - Email/Password esta habilitado por padrao
   - Configure Google/GitHub OAuth se necessario

---

## 5. Arquitetura do Projeto

### Diagrama de Fluxo

```
Browser
  |
  v
[Middleware] ──> Verifica autenticacao via Supabase cookies
  |                 |
  |  (nao autenticado)  (autenticado)
  v                 v
/login          /dashboard
                    |
                    v
             [Server Component (page.tsx)]
                    |
                    v
           [Supabase Server Client] ──> PostgreSQL (Supabase)
              (usa getUser())
                    |
                    v
             [Client Component (*Client.tsx)]
                    |  (usa useI18n() para traducoes)
            (Server Actions)
                    |
                    v
           [Supabase Server Client] ──> PostgreSQL
              (usa getUser())
```

### Padroes Principais

1. **Server/Client Split**: Pagina `page.tsx` (Server) busca dados, componente `*Client.tsx` (Client) renderiza com `useI18n()`
2. **35+ Client Components** seguem este padrao (DashboardClient, SaudeClient, ProfileContent, etc.)
3. **Server Actions** (`"use server"`): Para mutacoes. Ficam em `src/actions/`. Todos usam `getUser()` para auth
4. **Sem API Routes tradicionais**: Exceto iCal feed, chat API e cron jobs
5. **Sem ORM**: Queries diretas com `supabase.from("tabela").select/insert/update`
6. **Sem FK Joins**: PostgREST FK joins removidos, substituidos por queries separadas + joins manuais em JS
7. **Sem state management global**: Cada page busca seus proprios dados. Revalidacao via `revalidatePath()`
8. **i18n via useI18n()**: Todas as strings de UI traduzidas em 5 idiomas

### Fluxo de Dados Tipico

```
1. Usuario acessa /calendario
2. page.tsx (Server Component) verifica auth com getUser()
3. page.tsx busca dados via Supabase Server Client (queries paralelas com Promise.all)
4. Passa dados serializados para CalendarClient (Client Component)
5. CalendarClient usa useI18n() para traduzir labels
6. Usuario clica em "Aprovar Troca"
7. Form chama Server Action respondToSwapRequest()
8. Server Action verifica auth com getUser(), executa no servidor
9. Chama revalidatePath("/calendario") para invalidar cache
10. Pagina recarrega com dados atualizados
```

---

## 6. Estrutura de Pastas Completa

```
Kindar/
├── .env.example                    # Template de variaveis de ambiente
├── .env.local                      # Variaveis de ambiente (NAO commitado)
├── .gitignore
├── DOCUMENTACAO.md                 # Documentacao tecnica do projeto
├── MANUAL_DEV.md                   # Este manual
├── next.config.ts                  # Configuracao do Next.js
├── package.json
├── postcss.config.mjs              # Configuracao PostCSS + Tailwind v4
├── tsconfig.json                   # TypeScript com alias @/* → ./src/*
│
├── scripts/
│   ├── seed-test.mjs               # Script de seed dos dados de teste
│   ├── seed-diverse-families.mjs   # Seed de familias diversas
│   ├── apply-migration.mjs         # Aplicar migration via script
│   ├── delete-group.mjs            # Deletar grupo de teste
│   └── ...                         # Outros scripts utilitarios
│
├── supabase/
│   └── migrations/
│       ├── 00001_initial_schema.sql
│       ├── 00002_rls_policies.sql
│       ├── 00003_calendar_tokens.sql
│       ├── 00010_activities_checklist.sql
│       ├── 00011_rename_day_of_week_to_days.sql
│       ├── 00012_activity_all_children.sql
│       ├── 00013_illness_hospital_severity.sql
│       ├── 00015_health_views.sql
│       ├── 00016_receipts_storage_bucket.sql
│       ├── 00017_health_indexes.sql
│       ├── 00018_documents_storage_bucket.sql
│       ├── 00019_private_notes.sql
│       ├── 00020_decisions.sql
│       ├── 00021_chat_channels.sql
│       ├── 00022_child_profile_tabs.sql
│       ├── 00023_activity_reports.sql
│       ├── 00024_events_assigned_to.sql
│       ├── 00025_performance_indexes.sql
│       ├── 00026_sensitive_topic_deletion.sql
│       ├── 00027_activity_responsible_override.sql
│       ├── 00028_activity_extra_fields.sql
│       └── 00029_activity_occurrence_overrides.sql
│
└── src/
    ├── middleware.ts                 # Auth middleware (intercepta todas as requests)
    │
    ├── i18n/                        # === INTERNACIONALIZACAO ===
    │   ├── index.ts                 # I18nProvider, useI18n hook
    │   └── locales/
    │       ├── pt.json              # Portugues (~1405 chaves, 38 secoes)
    │       ├── en.json              # Ingles
    │       ├── es.json              # Espanhol
    │       ├── fr.json              # Frances
    │       └── de.json              # Alemao
    │
    ├── app/
    │   ├── layout.tsx               # Root layout (fonts, metadata)
    │   ├── page.tsx                 # Landing page (/)
    │   ├── globals.css              # Tailwind + tema de cores
    │   │
    │   ├── (auth)/                  # === ROTAS PUBLICAS ===
    │   │   ├── layout.tsx           # Layout de autenticacao (card centralizado)
    │   │   ├── login/page.tsx
    │   │   ├── signup/page.tsx
    │   │   ├── verify-email/page.tsx
    │   │   ├── forgot-password/page.tsx
    │   │   └── reset-password/page.tsx
    │   │
    │   ├── auth/
    │   │   └── callback/route.ts    # OAuth callback handler
    │   │
    │   ├── convite/
    │   │   └── [token]/page.tsx     # Aceitar convite via link
    │   │
    │   ├── (app)/                   # === ROTAS PROTEGIDAS ===
    │   │   ├── layout.tsx           # Layout do app (header + nav + auth check + I18nProvider)
    │   │   ├── dashboard/page.tsx   # Server: busca dados → DashboardClient
    │   │   ├── onboarding/page.tsx
    │   │   ├── mais/page.tsx        # Grid com todas as funcionalidades
    │   │   │
    │   │   ├── calendario/                  # === AGENDA UNIFICADA ===
    │   │   │   ├── page.tsx              # Server: 5 queries paralelas
    │   │   │   ├── CalendarClient.tsx    # Client: estado do mes + useI18n()
    │   │   │   ├── CalendarGrid.tsx      # Grade mensal (useMemo) + dots de atividades
    │   │   │   ├── DayDetailSheet.tsx    # Sheet do dia (guarda + atividades + troca)
    │   │   │   ├── SwapRequestList.tsx   # Lista de trocas pendentes
    │   │   │   ├── SwapRequestModal.tsx  # Modal de solicitacao de troca
    │   │   │   ├── SwapBalanceCard.tsx   # Saldo de trocas (+/- dias por pai)
    │   │   │   ├── CalendarExportButton.tsx # Botao de sincronizacao iCal
    │   │   │   ├── novo/
    │   │   │   │   ├── page.tsx          # Pagina de novo compromisso
    │   │   │   │   └── NewCompromissoForm.tsx # Formulario unificado
    │   │   │   └── escala/
    │   │   │       ├── page.tsx          # Pagina da escala
    │   │   │       └── ScheduleBuilder.tsx # Builder visual de escala quinzenal
    │   │   │
    │   │   ├── atividades/               # Atividades recorrentes
    │   │   │   ├── page.tsx              # Redirect → /calendario
    │   │   │   ├── nova/page.tsx         # Redirect → /calendario/novo
    │   │   │   ├── ActivityChecklistModal.tsx
    │   │   │   └── DeleteActivityButton.tsx
    │   │   │
    │   │   ├── chat/                     # Chat com IA Mediadora
    │   │   │   ├── page.tsx              # Server: busca dados
    │   │   │   ├── ChatRoom.tsx          # Chat em tempo real + otimistic updates
    │   │   │   └── ChannelTabs.tsx       # Abas de canais tematicos
    │   │   │
    │   │   ├── criancas/                 # Perfil de criancas (4 abas)
    │   │   │   ├── page.tsx              # Lista de criancas
    │   │   │   ├── nova/page.tsx         # Adicionar crianca
    │   │   │   └── [id]/page.tsx         # Perfil com 4 abas (Geral/Saude/Docs/Educacao)
    │   │   │
    │   │   ├── decisoes/                 # Decisoes em grupo
    │   │   │   └── page.tsx
    │   │   │
    │   │   ├── despesas/                 # Gestao de despesas
    │   │   │   ├── page.tsx              # Lista de despesas
    │   │   │   ├── DeleteExpenseButton.tsx
    │   │   │   ├── ReceiptViewer.tsx     # Visualizador de comprovantes
    │   │   │   └── nova/
    │   │   │       ├── page.tsx
    │   │   │       └── ExpenseFormClient.tsx
    │   │   │
    │   │   ├── documentos/              # Dashboard de documentos
    │   │   │   ├── page.tsx
    │   │   │   ├── DocumentList.tsx
    │   │   │   └── DocumentViewer.tsx
    │   │   │
    │   │   ├── financeiro/
    │   │   │   ├── page.tsx              # Server: busca dados
    │   │   │   └── FinancialDashboard.tsx # Client: abas Resumo/Historico
    │   │   │
    │   │   ├── notas/                    # Notas privadas
    │   │   │   └── page.tsx
    │   │   │
    │   │   ├── perfil/                   # Perfil do usuario
    │   │   │   ├── page.tsx
    │   │   │   └── EditProfileForm.tsx   # Formulario + LanguageSelector
    │   │   │
    │   │   ├── saude/                    # Hub de saude (7 sub-modulos)
    │   │   │   ├── page.tsx              # Dashboard central de saude
    │   │   │   ├── ConfirmDoseButton.tsx
    │   │   │   ├── HealthViewTracker.tsx # Registra quem visualizou
    │   │   │   ├── SubmitButton.tsx      # Botao generico de submit
    │   │   │   ├── ViewedByBadge.tsx     # Badge de visualizacao
    │   │   │   ├── alergias/
    │   │   │   ├── consultas/            # + CompleteAppointmentForm
    │   │   │   ├── crescimento/          # + GrowthChart
    │   │   │   ├── doencas/              # + ResolveButton, UpdateEpisodeForm, IllnessFormClient
    │   │   │   ├── export/               # Exportacao de registros
    │   │   │   ├── medicamentos/         # + pagina de detalhe [id]
    │   │   │   ├── profissionais/
    │   │   │   └── vacinas/
    │   │   │
    │   │   ├── checkin/page.tsx + CheckinForm.tsx
    │   │   ├── acordos/page.tsx
    │   │   ├── eventos/page.tsx          # Redirect → /calendario
    │   │   ├── escola/page.tsx
    │   │   ├── familia/page.tsx
    │   │   ├── temas-sensiveis/page.tsx
    │   │   └── convite/enviar/page.tsx
    │   │
    │   └── api/
    │       ├── calendar/[token]/route.ts # Feed iCalendar (RFC 5545)
    │       ├── chat/                     # Chat API
    │       └── cron/activity-reminders/  # Cron: push 24h antes
    │
    ├── actions/                      # === SERVER ACTIONS ===
    │   ├── auth.ts                   # signUp, signIn, signOut, resetPassword
    │   ├── calendar.ts               # createCustodyEvent, createSwapRequest, respondToSwapRequest, generateSchedule
    │   ├── chat-channels.ts          # createChatChannel
    │   ├── checkin.ts                # createCheckin (+ envia msg no chat)
    │   ├── children.ts               # upsertChildEducation
    │   ├── decisions.ts              # createDecision, voteDecision
    │   ├── expenses.ts               # createExpense, updateExpenseStatus
    │   ├── events.ts                 # createEvent, updateEvent, deleteEvent, cancelEvent
    │   ├── group.ts                  # createGroup, joinGroup
    │   ├── group-switch.ts           # switchActiveGroup
    │   ├── health.ts                 # createHealthLog, createAppointment, createMedication, etc.
    │   ├── invitation.ts             # sendInvitation, acceptInvitation
    │   ├── notes.ts                  # createNote, updateNote, deleteNote
    │   ├── profile.ts                # updateProfile
    │   ├── activities.ts             # createActivity, deleteActivity, toggleChecklistItem, sendActivityReminders
    │   ├── agreements.ts             # createAgreement
    │   ├── documents.ts              # uploadDocument
    │   ├── school.ts                 # createSchoolNote
    │   ├── sensitive.ts              # createSensitiveTopic
    │   └── settlements.ts            # createSettlement, confirmSettlement
    │
    ├── lib/
    │   ├── constants.ts              # COLORS, EXPENSE_CATEGORIES, CHECKIN_CATEGORIES, ACTIVITY_CATEGORIES, DEFAULT_CHECKLIST_ITEMS, PARENT_COLORS
    │   ├── calendar-utils.ts         # getDaysInMonth, getMonthGrid, buildCustodyMap, computeSwapBalance, getBrazilToday, getBrazilNow
    │   ├── recurrence-utils.ts       # getOccurrences, occursOnDate, getNextOccurrence, RECURRENCE_OPTIONS
    │   ├── push.ts                   # createNotificationWithPush (web-push VAPID)
    │   ├── auth-utils.ts             # verifyGroupMembership
    │   ├── brazilian-holidays.ts     # Feriados nacionais (fixos + moveis)
    │   ├── ical.ts                   # generateICalFeed (RFC 5545)
    │   ├── tone-moderator.ts         # Analise de tom para chat
    │   ├── chat-notify.ts            # postChatNotification()
    │   ├── group-utils.ts            # getActiveGroup()
    │   ├── health-constants.ts       # Constantes de saude
    │   ├── sbp-vaccine-calendar.ts   # Calendario vacinal SBP
    │   ├── who-growth-data.ts        # Dados crescimento WHO
    │   └── supabase/
    │       ├── client.ts             # createBrowserClient (para Client Components)
    │       ├── server.ts             # createServerClient (para Server Components/Actions)
    │       └── middleware.ts          # updateSession (refresh de cookies)
    │
    └── components/                   # Componentes globais
        ├── BottomNav.tsx             # Navegacao inferior mobile (com aria-labels)
        ├── Sidebar.tsx               # Sidebar desktop (com aria-labels, role="navigation")
        ├── ResponsiveShell.tsx       # Shell responsivo (sidebar desktop / bottom nav mobile)
        ├── GroupSelector.tsx          # Seletor de grupo ativo (multi-grupo)
        └── LanguageSelector.tsx       # Seletor de idioma (5 opcoes)
```

---

## 7. Rotas e Paginas

### Rotas Publicas (nao requerem login)

| Rota | Descricao |
|------|-----------|
| `/` | Landing page |
| `/login` | Login com email/senha |
| `/signup` | Cadastro |
| `/verify-email` | Confirmacao de email |
| `/forgot-password` | Esqueci a senha |
| `/reset-password` | Redefinir senha |
| `/auth/callback` | OAuth callback |
| `/convite/[token]` | Aceitar convite |
| `/api/calendar/[token]` | Feed iCal (auth via token na URL) |

### Rotas Protegidas (requerem login)

| Rota | Descricao | Componentes Principais |
|------|-----------|----------------------|
| `/dashboard` | Pagina inicial | DashboardClient |
| `/onboarding` | Primeiro acesso | — |
| `/calendario` | Agenda unificada | CalendarClient, CalendarGrid, DayDetailSheet, SwapRequestList, SwapBalanceCard |
| `/calendario/novo` | Novo compromisso (unificado) | NewCompromissoForm |
| `/calendario/escala` | Builder de escala | ScheduleBuilder |
| `/financeiro` | Dashboard financeiro | FinancialDashboard |
| `/despesas` | Lista de despesas | DeleteExpenseButton, ReceiptViewer |
| `/despesas/nova` | Nova despesa | ExpenseFormClient |
| `/chat` | Chat do grupo | ChatRoom, ChannelTabs |
| `/checkin` | Check-in diario | CheckinForm |
| `/criancas` | Lista de criancas | — |
| `/criancas/nova` | Adicionar crianca | — |
| `/criancas/[id]` | Perfil com 4 abas (Geral/Saude/Docs/Educacao) | — |
| `/saude` | Hub de saude (7 sub-modulos) | SaudeClient, HealthViewTracker, ViewedByBadge |
| `/documentos` | Dashboard de documentos | DocumentList, DocumentViewer |
| `/notas` | Notas privadas | — |
| `/decisoes` | Decisoes em grupo | — |
| `/acordos` | Acordos | — |
| `/eventos` | Redirect → /calendario | — |
| `/atividades` | Redirect → /calendario | — |
| `/escola` | Escola | — |
| `/temas-sensiveis` | Temas sensiveis | — |
| `/perfil` | Perfil do usuario | EditProfileForm, LanguageSelector |
| `/convite/enviar` | Enviar convite | — |
| `/familia` | Membros do grupo | — |
| `/mais` | Todas as funcionalidades | — |

---

## 8. Server Actions

Todas as mutacoes de dados sao feitas via Server Actions (`"use server"`). Ficam em `src/actions/`.

### Padrao de uma Server Action

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function minhaAction(formData: FormData) {
  // 1. Criar client Supabase (server-side, com cookies)
  const supabase = await createClient();

  // 2. Verificar autenticacao com getUser() (NUNCA getSession!)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 3. Extrair dados do FormData
  const campo = formData.get("campo") as string;

  // 4. Validar input (ex: Number.isFinite para numeros)
  const valor = Number(formData.get("valor"));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { error: "Valor invalido" };
  }

  // 5. Executar operacao no banco
  const { error } = await supabase.from("tabela").insert({ campo });

  // 6. Tratar erro
  if (error) return { error: error.message };

  // 7. Revalidar cache e redirecionar
  revalidatePath("/rota");
  return { success: true };
}
```

> **IMPORTANTE:** Sempre use `getUser()` em vez de `getSession()`. O `getUser()` valida o JWT no servidor, enquanto `getSession()` apenas le o cookie (pode ser falsificado).

### Lista Completa de Actions

| Action | Arquivo | Descricao |
|--------|---------|-----------|
| `signUp` | auth.ts | Cadastro com email/senha + nome |
| `signIn` | auth.ts | Login com email/senha |
| `signOut` | auth.ts | Logout (limpa sessao) |
| `resetPassword` | auth.ts | Envia email de reset |
| `createCustodyEvent` | calendar.ts | Cria evento de guarda (unico ou recorrente) |
| `createSwapRequest` | calendar.ts | Solicita troca de dia |
| `respondToSwapRequest` | calendar.ts | Aprova/rejeita troca (cria novos eventos se aprovada) |
| `generateSchedule` | calendar.ts | Gera escala quinzenal em lote (ate 12 meses, batches de 100) |
| `getOrCreateCalendarToken` | calendar.ts | Obtem/cria token para feed iCal |
| `createExpense` | expenses.ts | Registra nova despesa (WebP aceito, multi-select de criancas) |
| `updateExpenseStatus` | expenses.ts | Aprova/rejeita despesa (bloqueia auto-aprovacao, impede regressao de status) |
| `deleteExpense` | expenses.ts | Exclui despesa com confirmacao |
| `createCheckin` | checkin.ts | Cria check-in + envia mensagem automatica no chat |
| `createGroup` | group.ts | Cria grupo de coparentalidade |
| `joinGroup` | group.ts | Entrar em grupo existente |
| `switchActiveGroup` | group-switch.ts | Troca o grupo ativo do usuario |
| `sendInvitation` | invitation.ts | Envia convite por email |
| `acceptInvitation` | invitation.ts | Aceita convite via token |
| `updateProfile` | profile.ts | Atualiza perfil (nome, idioma, etc.) |
| `createHealthLog` | health.ts | Registra log de saude |
| `createProfessional` | health.ts | Cadastra profissional de saude |
| `createAppointment` | health.ts | Agenda consulta + cria evento no calendario |
| `updateAppointmentStatus` | health.ts | Atualiza status da consulta |
| `completeAppointment` | health.ts | Conclui consulta com diagnostico |
| `createMedication` | health.ts | Cria medicamento |
| `logMedicationDose` | health.ts | Registra dose tomada (validacao server-side: intervalo minimo 30 min) |
| `updateMedicationStatus` | health.ts | Atualiza status do medicamento |
| `createIllnessEpisode` | health.ts | Registra episodio de doenca |
| `updateIllnessEpisode` | health.ts | Atualiza episodio |
| `addIllnessEvolution` | health.ts | Adiciona nota de evolucao |
| `createAllergy` | health.ts | Registra alergia + push notification |
| `updateAllergy` | health.ts | Edita alergia existente |
| `deleteAllergy` | health.ts | Exclui alergia (service role) |
| `upsertMedicalInfo` | health.ts | Atualiza info medica (tipo sanguineo, convenio) |
| `createVaccinationRecord` | health.ts | Registra vacina + push notification |
| `trackHealthView` | health.ts | Rastreia visualizacao de registro de saude |
| `createGrowthRecord` | health.ts | Registra crescimento + push notification |
| `upsertChildEducation` | children.ts | Cria/atualiza informacoes escolares da crianca |
| `uploadDocument` | documents.ts | Upload de documento |
| `createAgreement` | agreements.ts | Registra acordo |
| `createEvent` | events.ts | Cria evento social |
| `updateEvent` | events.ts | Atualiza evento social |
| `deleteEvent` | events.ts | Remove evento social |
| `cancelEvent` | events.ts | Cancela evento social (soft delete) |
| `createActivity` | activities.ts | Cria atividade com checklist + push notification |
| `deleteActivity` | activities.ts | Remove atividade e checklist items |
| `toggleChecklistItem` | activities.ts | Marca/desmarca item do checklist por ocorrencia |
| `sendActivityReminders` | activities.ts | Envia push 24h antes (chamado via cron) |
| `submitActivityReport` | activities.ts | Submete relatorio de atividade |
| `getPendingReports` | activities.ts | Busca relatorios pendentes |
| `getReportsForDate` | activities.ts | Relatorios por data |
| `sendMissedReportReminders` | activities.ts | Lembrete de relatorios nao enviados |
| `cancelActivityOccurrence` | activities.ts | Cancela ocorrencia unica |
| `changeActivityResponsible` | activities.ts | Troca responsavel (ocorrencia) |
| `editActivityAll` | activities.ts | Edita atividade completa |
| `editActivityOccurrence` | activities.ts | Edita ocorrencia unica (overrides JSONB) |
| `changeActivityResponsibleAll` | activities.ts | Troca responsavel (todas) |
| `createSettlement` | settlements.ts | Cria acerto financeiro (validacao server-side de saldo) |
| `confirmSettlement` | settlements.ts | Confirma recebimento de acerto |
| `createNote` | notes.ts | Cria nota privada |
| `updateNote` | notes.ts | Atualiza nota privada |
| `deleteNote` | notes.ts | Remove nota privada |
| `createDecision` | decisions.ts | Cria decisao em grupo |
| `voteDecision` | decisions.ts | Vota em decisao |
| `acceptAgreement` | agreements.ts | Aceita acordo |
| `ensureDefaultChannels` | chat-channels.ts | Garante canais padrao |
| `markChannelRead` | chat-channels.ts | Marca canal como lido |
| `createSchoolLog` | school.ts | Registra nota escolar |
| `createSensitiveNote` | sensitive.ts | Cria tema sensivel |
| `requestDeletion` | sensitive-topics.ts | Solicita delecao (dual-approval) |
| `approveDeletion` | sensitive-topics.ts | Aprova delecao |
| `cancelDeletion` | sensitive-topics.ts | Cancela solicitacao de delecao |
| `markNotificationRead` | notifications.ts | Marca notificacao como lida |
| `markAllNotificationsRead` | notifications.ts | Marca todas como lidas |
| `changeMemberRole` | members.ts | Altera role de membro |
| `removeMember` | members.ts | Remove membro do grupo |
| `leaveGroup` | members.ts | Sair do grupo |
| `cancelInvitation` | members.ts | Cancela convite |
| `deleteInvitation` | members.ts | Deleta convite |
| `switchActiveGroup` | group-switch.ts | Troca grupo ativo |
| `uploadChildDocument` | children.ts | Upload documento por crianca |

---

## 9. Autenticacao e Middleware

### Fluxo de Autenticacao

```
1. Usuario faz login via /login (Server Action signIn)
2. Supabase retorna tokens JWT + refresh token
3. @supabase/ssr armazena tokens em cookies HttpOnly
4. Middleware intercepta TODA request e chama updateSession()
5. updateSession() verifica/renova o token via cookies
6. Se token invalido → redirect para /login
7. Se token valido + rota de auth → redirect para /dashboard
```

### Migracao getSession() → getUser()

**TODAS as Server Actions e Server Components foram migrados de `getSession()` para `getUser()`** (38 arquivos).

Razao: `getUser()` faz uma chamada ao servidor Supabase para validar o JWT, enquanto `getSession()` apenas le o token do cookie local sem validacao. Isso previne ataques onde um token expirado ou falsificado e aceito.

```typescript
// ANTES (inseguro):
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;

// DEPOIS (seguro):
const { data: { user } } = await supabase.auth.getUser();
```

### Middleware (`src/middleware.ts`)

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### Supabase Clients

O projeto tem 3 maneiras de criar um client Supabase:

| Client | Arquivo | Onde usar |
|--------|---------|-----------|
| Server Client | `lib/supabase/server.ts` | Server Components, Server Actions |
| Browser Client | `lib/supabase/client.ts` | Client Components (`"use client"`) |
| Middleware Client | `lib/supabase/middleware.ts` | Apenas no middleware |

```typescript
// Em Server Component ou Server Action:
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient(); // async!

// Em Client Component:
import { createClient } from "@/lib/supabase/client";
const supabase = createClient(); // sync!
```

**IMPORTANTE:** O server client e `async` (precisa de `await`) porque acessa cookies do servidor.

---

## 10. Banco de Dados - Schema Completo

### Enums

| Enum | Valores | Uso |
|------|---------|-----|
| `user_role` | parent, grandparent, caregiver, mediator, lawyer | Papel do usuario |
| `member_role` | admin, member, readonly | Papel no grupo |
| `custody_type` | **regular**, holiday, swap, vacation, special | Tipo de evento de guarda |
| `expense_category` | education, health, food, clothing, transport, leisure, housing, other | Categoria de despesa |
| `approval_status` | pending, approved, rejected, disputed | Status de aprovacao |
| `health_log_type` | fever, medication, mood, screen_time, food, sleep, weight, height, vaccine, other | Tipo de log de saude |
| `document_category` | personal, health, education, legal, other | Categoria de documento |
| `swap_status` | pending, approved, rejected, cancelled | Status de troca |
| `notification_type` | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system, activity, activity_reminder | Tipo de notificacao |
| `invitation_status` | pending, accepted, expired, revoked | Status de convite |

> **CUIDADO:** Ao criar eventos de guarda via `generateSchedule`, SEMPRE use `custody_type: "regular"`. O valor `"schedule"` NAO existe no enum e causara erro.

### Tabelas (35+ total)

| # | Tabela | Chave Primaria | Descricao |
|---|--------|---------------|-----------|
| 1 | `profiles` | `id` (= auth.users.id) | Perfil do usuario (com campo `locale` para idioma) |
| 2 | `coparenting_groups` | `id` (UUID) | Grupo familiar |
| 3 | `group_members` | `id` (UUID) | Vinculo usuario-grupo |
| 4 | `children` | `id` (UUID) | Criancas do grupo (**com cpf, rg**) |
| 5 | `custody_events` | `id` (UUID) | Eventos de guarda |
| 6 | `expenses` | `id` (UUID) | Despesas compartilhadas |
| 7 | `chat_messages` | `id` (UUID) | Chat (IMUTAVEL, com channel_id) |
| 8 | `health_logs` | `id` (UUID) | Logs de saude |
| 9 | `documents` | `id` (UUID) | Documentos |
| 10 | `swap_requests` | `id` (UUID) | Trocas de dia |
| 11 | `daily_checkins` | `id` (UUID) | Check-ins diarios |
| 12 | `calendar_tokens` | `id` (UUID) | Tokens iCal |
| 13 | `notifications` | `id` (UUID) | Notificacoes |
| 14 | `invitations` | `id` (UUID) | Convites |
| 15 | `child_activities` | `id` (UUID) | Atividades recorrentes |
| 16 | `activity_checklist_items` | `id` (UUID) | Itens do checklist |
| 17 | `checklist_completions` | `id` (UUID) | Completions por ocorrencia |
| 18 | `settlements` | `id` (UUID) | Acertos financeiros |
| 19 | `child_education` | `id` (UUID) | Informacoes escolares (1:1 com children) |
| 20 | `private_notes` | `id` (UUID) | Notas privadas do usuario |
| 21 | `decisions` | `id` (UUID) | Decisoes em grupo |
| 22 | `chat_channels` | `id` (UUID) | Canais tematicos de chat |
| 23 | `health_views` | `id` (UUID) | Rastreamento de visualizacoes de saude |
| 24 | `activity_reports` | `id` (UUID) | Relatorios de atividades (status, humor, overrides JSONB) |
| 25 | `events` | `id` (UUID) | Eventos sociais (com assigned_to, end_date, all_day) |
| 26 | `sensitive_notes` | `id` (UUID) | Temas sensiveis (com delecao dual-approval) |
| 27+ | `push_subscriptions`, `chat_channel_reads`, `agreements`, `school_logs`, `appointments`, `medications`, `medication_doses`, `illness_episodes`, `allergies`, `medical_info`, `vaccination_records`, `growth_records`, `professionals` | `id` (UUID) | Tabelas de saude, financeiro, etc. |

### Triggers Importantes

| Trigger | Tabela | O que faz |
|---------|--------|-----------|
| `on_auth_user_created` | `auth.users` | Cria automaticamente um `profile` quando usuario faz signup |
| `no_delete_chat_messages` | `chat_messages` | IMPEDE delecao de mensagens (conformidade legal) |
| `no_update_chat_text` | `chat_messages` | IMPEDE edicao do texto de mensagens |
| `set_updated_at` | profiles, children, custody_events, expenses | Atualiza `updated_at` automaticamente |

### Indexes

```sql
idx_group_members_user            → group_members(user_id)
idx_group_members_group           → group_members(group_id)
idx_children_group                → children(group_id)
idx_custody_events_group_date     → custody_events(group_id, start_date, end_date)
idx_expenses_group                → expenses(group_id)
idx_expenses_date                 → expenses(expense_date)
idx_chat_messages_group_created   → chat_messages(group_id, created_at)
idx_health_logs_child             → health_logs(child_id, logged_at)
idx_documents_group               → documents(group_id)
idx_notifications_user            → notifications(user_id, is_read, created_at)
idx_invitations_token             → invitations(token)
idx_invitations_email             → invitations(email)
idx_daily_checkins_group_date     → daily_checkins(group_id, checkin_date DESC)
idx_daily_checkins_child          → daily_checkins(child_id, checkin_date DESC)
idx_calendar_tokens_token         → calendar_tokens(token)
# + indexes de saude adicionados em 00017_health_indexes.sql
```

---

## 11. Row Level Security (RLS)

**TODAS as tabelas tem RLS habilitado.** Isso significa que queries do client-side so retornam dados que o usuario tem permissao de ver.

### Funcoes Auxiliares

```sql
-- Verifica se o usuario logado pertence ao grupo
is_group_member(group_id UUID) → BOOLEAN

-- Verifica se o usuario logado e admin do grupo
is_group_admin(group_id UUID) → BOOLEAN
```

### Regras Principais

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `profiles` | Proprio perfil + co-membros do grupo | (via trigger) | Apenas proprio | - |
| `coparenting_groups` | Membro do grupo | Criador = auth.uid() | - | - |
| `group_members` | Membro do grupo | Admin ou proprio usuario | - | - |
| `children` | Membro do grupo | Membro do grupo | Membro do grupo | - |
| `custody_events` | Membro do grupo | Membro do grupo | Membro do grupo | - |
| `expenses` | Membro do grupo | Membro + paid_by = uid | Membro do grupo | - |
| `chat_messages` | Membro do grupo | Membro + sender = uid | Membro (read_by/pin) | **BLOQUEADO** |
| `health_logs` | Membro do grupo | Membro + logged_by = uid | - | - |
| `documents` | Membro do grupo | Membro + uploaded_by = uid | - | - |
| `swap_requests` | Membro do grupo | Membro + requester = uid | Apenas target_user | - |
| `daily_checkins` | Membro do grupo | Membro do grupo | Apenas logged_by | - |
| `calendar_tokens` | Apenas proprio | Apenas proprio | - | Apenas proprio |
| `notifications` | Apenas proprio | - | Apenas proprio | - |
| `invitations` | Inviter ou invitee | Admin do grupo | Apenas invitee | - |
| `private_notes` | Apenas proprio | Apenas proprio | Apenas proprio | Apenas proprio |
| `child_education` | Membro do grupo | Membro do grupo | Membro do grupo | - |

---

## 12. Internacionalizacao (i18n)

### Visao Geral

O app suporta **5 idiomas** com **~1405 chaves** de traducao cada, organizadas em **38 secoes** tematicas.

| Idioma | Arquivo | Codigo |
|--------|---------|--------|
| Portugues (BR) | `src/i18n/locales/pt.json` | `pt` |
| Ingles | `src/i18n/locales/en.json` | `en` |
| Espanhol | `src/i18n/locales/es.json` | `es` |
| Frances | `src/i18n/locales/fr.json` | `fr` |
| Alemao | `src/i18n/locales/de.json` | `de` |

### Arquitetura

1. **I18nProvider** envolve o layout do app em `src/app/(app)/layout.tsx`
2. **useI18n() hook** disponivel em todos os Client Components
3. **LanguageSelector** na pagina `/perfil` permite trocar idioma
4. Preferencia salva no campo `locale` da tabela `profiles`

### Como Adicionar uma Nova Traducao

1. Adicione a chave em todos os 5 arquivos JSON:
```json
// pt.json
{ "minha_secao": { "minha_chave": "Texto em portugues" } }

// en.json
{ "minha_secao": { "minha_chave": "Text in English" } }
```

2. Use no componente:
```typescript
const { t } = useI18n();
return <span>{t("minha_secao.minha_chave")}</span>;
```

### Secoes de Traducao (38 total)

As 38 secoes cobrem: common, nav, dashboard, calendar, chat, checkin, expenses, financial, health, children, documents, agreements, events, activities, sensitive, school, profile, family, invitations, onboarding, more, notifications, settlements, swap, schedule, export, appointments, medications, illnesses, allergies, vaccines, growth, professionals, decisions, newForm, notes, ai, activityReport.

### Padrao para Novos Componentes

Todo novo componente client **DEVE** usar `useI18n()` em vez de strings hardcoded:

```typescript
"use client";
import { useI18n } from "@/i18n";

export default function MeuComponente({ dados }: Props) {
  const { t } = useI18n();

  return (
    <div>
      <h1>{t("secao.titulo")}</h1>
      <p>{t("secao.descricao")}</p>
    </div>
  );
}
```

---

## 13. Design System

### Paleta de Cores

Definida em `src/lib/constants.ts` e `src/app/globals.css`:

| Variavel Tailwind | Hex | Uso |
|-------------------|-----|-----|
| `primary` | #0EA5A0 | Botoes, links, 1o responsavel |
| `primary-light` | #E6F7F7 | Fundos suaves |
| `primary-dark` | #0B8A86 | Hover states |
| `secondary` | #FF6B5B | 2o responsavel, alertas |
| `accent` | #FFB627 | Destaques, pendencias |
| `dark` | #1A3B3A | Textos principais |
| `light` | #F8FFFE | Fundo do app |
| `success` | #4CAF50 | Aprovado, "Livre" |
| `error` | #E53935 | Erros, rejeicoes |
| `muted` | #7A8C8B | Textos secundarios |

### Cores dos Responsaveis

A atribuicao de cores segue a **ordem de entrada no grupo** (campo `joined_at` em `group_members`):

- **1o a entrar** → Teal (#0EA5A0) — `PARENT_COLORS.primary`
- **2o a entrar** → Coral (#FF6B5B) — `PARENT_COLORS.secondary`

> O label "(voce)" aparece ao lado do nome do usuario logado em todos os dashboards.

### Tailwind CSS v4

O projeto usa Tailwind v4 com a nova sintaxe de `@theme`:

```css
/* globals.css */
@import "tailwindcss";

@theme inline {
  --color-primary: #0EA5A0;
  --color-primary-light: #E6F7F7;
  /* ... */
}
```

As cores ficam disponiveis como classes Tailwind: `bg-primary`, `text-secondary`, `border-accent`, etc.

### Navegacao

- **Header:** Logo "Kindar" (link para /dashboard), nome do usuario, botao "Sair"
- **Bottom nav (mobile):** 5 itens — Inicio, Agenda, Chat, Familia, Mais (com `aria-labels` e `aria-current="page"`)
- **Sidebar (desktop):** Secoes: Inicio | Organizacao (Agenda, Check-in) | Comunicacao (Chat, Acordos, Temas Sensiveis) | Familia (Criancas, Familia, Saude, Escola) | Financeiro (Resumo, Despesas, Documentos) | Conta (Convidar) — com `role="navigation"`
- **Pagina /mais:** Grid com todas as funcionalidades (Eventos e Atividades unificados como "Agenda")

---

## 14. Padrao Server/Client Split

### Motivacao

Para suportar i18n com `useI18n()` (que requer contexto React), todos os componentes que exibem texto traduzido precisam ser Client Components. Ao mesmo tempo, a busca de dados deve acontecer no servidor para seguranca e performance.

### Padrao

1. **`page.tsx` (Server Component)**:
   - Verifica autenticacao com `getUser()`
   - Busca dados via Supabase Server Client
   - Passa dados serializados como props para o Client Component

2. **`*Client.tsx` (Client Component)**:
   - Recebe dados via props (ja buscados no servidor)
   - Usa `useI18n()` para traduzir strings
   - Gerencia estado local e interatividade
   - Chama Server Actions para mutacoes

### Exemplo

```typescript
// page.tsx (Server Component)
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: criancas } = await supabase
    .from("children")
    .select("*")
    .eq("group_id", groupId);

  return <DashboardClient criancas={criancas ?? []} user={user} />;
}
```

```typescript
// DashboardClient.tsx (Client Component)
"use client";
import { useI18n } from "@/i18n";

interface Props {
  criancas: Crianca[];
  user: User;
}

export default function DashboardClient({ criancas, user }: Props) {
  const { t } = useI18n();

  return (
    <div>
      <h1>{t("dashboard.welcome")}, {user.user_metadata?.full_name}</h1>
      {criancas.map(c => <div key={c.id}>{c.full_name}</div>)}
    </div>
  );
}
```

### 35+ Componentes que Seguem este Padrao

Exemplos: `DashboardClient`, `SaudeClient`, `ProfileContent`, `FinancialDashboard`, `CalendarClient`, `ChatRoom`, `CheckinForm`, `ExpenseFormClient`, `ScheduleBuilder`, `SwapRequestList`, `SwapBalanceCard`, etc.

---

## 15. Funcionalidades Implementadas

### Agenda Unificada (Calendario + Atividades + Eventos)
- Grade mensal 7 colunas com dias coloridos por responsavel + dots de atividades
- Navegacao entre meses, destaque do dia atual
- **Day Detail Sheet**: ao clicar num dia, mostra guarda + atividades + eventos
- Planejador de fins de semana (scroll horizontal, badges Livre/Parcial)
- Troca de dias com fluxo de aprovacao
- **Saldo de trocas (Swap Balance)**: `computeSwapBalance()` + `SwapBalanceCard`
- Escala quinzenal com 4 presets e geracao em lote
- Sincronizacao com celular via iCal (RFC 5545)
- **Escala de guarda opcional**: botao "Limpar escala", dashboard adapta sem escala
- **Formulario unificado** "Novo Compromisso" redesenhado com UX premium, 11 categorias, 93 chaves i18n
- **Atividades recorrentes** com motor de 7 tipos de recorrencia
- **Editar ocorrencia unica vs todas** (estilo Google Calendar) com overrides JSONB
- **Checklist inteligente** com itens pre-preenchidos por categoria
- **Push notifications** 24h antes via web-push (VAPID)
- **Cron job** automatico para lembretes (`/api/cron/activity-reminders`)
- Suporte a multiplos filhos por atividade (opcao "Todos")
- Eventos sociais integrados no calendario
- **Compartilhar atividade via WhatsApp**: `ShareActivityButton` + `share-utils.ts`. Web Share API com fallback `wa.me/?text=`
- **Performance**: `Promise.all()`, `useMemo`, `useCallback`

### Dashboard Financeiro
- Resumo mensal com gastos por responsavel
- Calculo automatico de balanco Splitwise-style (somente despesas aprovadas)
- Auto-aprovacao bloqueada, regressao de status impedida
- Upload de comprovantes (JPG/PNG/HEIC/WebP/PDF), deteccao de PDF corrigida
- Seletor de crianca multi-select com chips
- Validacao server-side de acertos financeiros
- Limite de query: 10000 para calculo preciso
- Breakdown por categoria
- Historico mensal com navegacao

### Criancas — Perfil com 4 Abas
- Lista de criancas com foto e idade
- **Perfil redesenhado** com 4 abas: Geral, Saude, Documentos, Educacao
- Novos campos: CPF, RG
- Nova tabela: `child_education`
- Server action: `upsertChildEducation`

### Dashboard de Documentos
- Visao geral de documentos de todas as criancas
- Barra de completude por crianca (0-100%)
- Indicadores de documentos faltantes

### Chat com IA Mediadora
- Canais tematicos (`ChannelTabs`) com inicial da crianca (nao emoji generico)
- Troca de canal client-side com cache LRU (sem reload)
- API Route `/api/chat/messages` para busca por canal
- Atualizacao otimista (fix de duplicacao)
- Read receipts com `Promise.allSettled`
- Fix de memory leak
- Deteccao de teclado — bottom nav se esconde
- Exportacao com filtro por canal

### Check-in Diario
- 8 categorias com icones e templates rapidos
- Timeline de check-ins recentes
- Integracao automatica com o chat do grupo

### Notas Privadas, Decisoes, Acordos, Temas Sensiveis
- Modulos completos com CRUD

### Saude (8 sub-modulos)
- Push notifications para TODOS os eventos de saude (alergias, vacinas, consultas, crescimento)
- Validacao server-side de intervalo entre doses (< 30 min rejeitado)
- ConfirmDoseButton na lista de medicamentos
- i18n para CompleteAppointmentForm, ResolveButton, ViewedByBadge
- Sanitizacao de input em todos os campos de texto (max length limits)
- Banner de vacinas atrasadas no dashboard
- `updateIllnessEpisode` rejeita status invalidos
- Alergias editaveis e deletaveis com formulario inline (service role para query)
- Fix de link /saude/alergias/editar-info e coluna notes inexistente

### Assistente IA Kindar
- **Assistente conversacional completo** com interface de chat, sugestoes rapidas, typing indicator e input por voz (Speech Recognition API)
- **Frontend**: `src/components/AIAssistant.tsx` — React Portal (`createPortal` em `document.body`) para escapar CSS `backdrop-blur` containing block no header mobile
- **API Route**: `src/app/api/ai/assistant/route.ts` — Groq function calling com `llama-3.3-70b-versatile`
- **Model fallback**: 70B primario → 8B fallback (`llama-3.1-8b-instant`) quando rate limited. 8B tem recuperacao `tool_use_failed` (retenta sem tools para resposta text-only)
- **Fallback de qualidade**: quando 8B retorna resposta pobre (so emojis), sistema usa resultados coletados das tools como resposta
- **Parsers robustos para PT-BR**:
  - `parseAmount()`: "R$ 45,00", "120 conto", "50 reais" — distingue ponto decimal (1-2 digitos apos) de milhar (3 digitos apos)
  - `parseDate()`: "DD/MM/YYYY", "DD/MM"
  - `parseTime()`: "14h", "14h30", "14:00" — usado tambem para horario de atividades
  - `parseDaysOfWeek()`: "terca", "quinta" → formato DB
- **12 tools Groq-compatible** (`src/lib/ai-tools.ts`):
  - 6 tools de acao: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`
  - 5 tools de consulta: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
  - 1 tool de comunicacao: `draft_message`
- **Multi-round tool calling**: ate 3 rodadas com `tool_choice: "auto"`, resposta final forcada com `tool_choice: "none"`
- **Timeout por chamada Groq**: `groqWithTimeout()` usa `AbortController` com timeout de 8s (`GROQ_TIMEOUT_MS = 8000`). Se a chamada exceder 8s, `AbortError` e capturado e tratado como rate-limit (dispara fallback 8B)
- **`sanitizeResponse()`**: remove tags XML malformadas (`<function=...>`) das respostas do modelo 8B antes de retornar ao frontend
- **`export const maxDuration = 60`**: nas rotas `/api/ai/assistant`, `/dashboard` e `/calendario` para evitar timeout padrao de 10s do Vercel
- **Frontend resiliente a erros de rede**: `AIAssistant.tsx` usa try/catch no `response.json()` para tratar respostas nao-JSON (504/502 do gateway), exibindo mensagem amigavel
- **Contexto familiar**: constroi contexto com filhos (tabela `children`, coluna `full_name`), membros e custodia. Info escolar via join com `child_education`
- **Integracao no shell**: botao IA no header mobile + botao flutuante no desktop (`ResponsiveShell.tsx`)
- **Rate limiting** por usuario (`ai-rate-limit.ts`) com mensagens amigaveis de erro
- **Cache** com TTL de 5 minutos (`ai-cache.ts`)
- **Decisao tecnica**: todos os parametros de tools usam `type: "string"` (nao `"number"`) para evitar erros de validacao do Groq com outputs do LLM
- **SSR-safe**: container do Portal usa `useState` + `useEffect` para evitar erros de hydration
- **50 testes unitarios** (Vitest) com 98.5% de acuracia

### Atividades e Calendario
- Activity report modal reseta campos ao abrir nova atividade
- Editar ocorrencia unica vs todas (estilo Google Calendar)
- Overrides JSONB em activity_reports
- Formulario redesenhado: UX premium, 93 novas chaves i18n
- Escala de guarda opcional, dashboard adapta sem escala

### Demais
- Gestao de criancas, documentos, escola
- Sistema de convites com token
- Onboarding para primeiro acesso
- Perfil com edicao e seletor de idioma
- Multi-grupo com `GroupSelector`
- Temas sensiveis com delecao dual-approval
- Rebrand completo: Kindar (zero referencias a 2Lares)
- Dominio: kindar.com.br

---

## 16. Seguranca

### Resumo: 65 Correcoes Aplicadas

**13 fixes de autorizacao:**
- Verificacao de permissao em events, expenses, calendar Server Actions
- Validacao de input: `Number.isFinite` para valores numericos
- `revalidatePath` em todas as actions

**38 arquivos migrados de `getSession()` para `getUser()`:**
- Todos os Server Actions
- Todos os Server Components que buscam dados
- `getUser()` valida JWT no servidor (seguro contra token falsificado)

**Chat (14 fixes):**
- Fix de atualizacao otimista (duplicacao)
- Fix de memory leak no Realtime listener
- Read receipts com `Promise.allSettled`
- Exportacao com filtro por canal

### Regras de Seguranca para Desenvolvedores

1. **Sempre** use `getUser()`, nunca `getSession()`
2. **Sempre** valide inputs numericos com `Number.isFinite`
3. **Sempre** verifique se o usuario pertence ao grupo antes de operar
4. **Sempre** chame `revalidatePath()` apos mutacoes
5. **Nunca** exponha a `SUPABASE_SERVICE_ROLE_KEY` no client
6. **Nunca** faca bypass de RLS no app (use apenas em scripts de seed)
7. **Nunca** permita auto-aprovacao de despesas (independente de role)
8. **Nunca** permita regressao de status (approved/rejected nao voltam para pending)
9. **Sempre** valide valores de acertos financeiros contra saldo real server-side
10. **Sempre** valide intervalos minimos entre doses de medicamento (30 min)
11. **Sempre** sanitize inputs de texto com max length limits
12. **Sempre** valide enums/status server-side antes de gravar no banco

---

## 17. Performance

### Otimizacoes Aplicadas (20+ total)

**Calendario:**
- `Promise.all()` para 5 queries paralelas (custody_events, children, activities, events, swap_requests)
- `useMemo` no grid mensal (evita recalculo a cada render)
- `useCallback` nos handlers de click e navegacao
- Fix de timezone: `getBrazilNow()` para horario correto no fuso BRT
- Calendar API otimizada (3.1s em vez de timeout)

**Dashboard:**
- 5 queries de `custody_events` consolidadas em 1 unica query
- Todas as queries executam em paralelo com `Promise.all()`
- `useMemo` em DashboardClient e FinancialDashboard

**Chat:**
- Cache LRU em memoria (ate 5 canais) para troca instantanea
- `React.memo` em MessageBubble

**Geral:**
- Dynamic imports para 6 componentes pesados (AIAssistant, GrowthChart, etc.)
- i18n lazy loading (apenas locale padrao carregado, demais sob demanda)
- Landing page otimizada (cookie check antes de `getUser()`)
- PostHog: 30+ eventos rastreados
- Sentry: error tracking em producao
- Performance indexes no banco (migration 00025)
- Limite de query de despesas: 10000 para calculo preciso de saldo

### Regras de Performance para Desenvolvedores

1. **Sempre** use `Promise.all()` para queries independentes
2. **Use** `useMemo` para calculos caros em componentes que re-renderizam frequentemente
3. **Use** `useCallback` para handlers passados como props
4. **Use** `React.memo` para componentes que recebem mesmas props frequentemente
5. **Use** dynamic imports para componentes pesados que nao sao vistos na primeira tela
6. **Evite** FK joins no PostgREST — faca queries separadas
7. **Consolide** queries repetidas em uma unica query

---

## 18. Acessibilidade

### Implementacoes

- `aria-labels` em todos os links de navegacao (`BottomNav.tsx`, `Sidebar.tsx`)
- `aria-current="page"` para item ativo na navegacao
- `role="navigation"` no sidebar e bottom nav
- Contraste de cores adequado no design system

### Regras para Desenvolvedores

1. **Sempre** adicione `aria-label` em links com icones sem texto visivel
2. **Sempre** marque o item ativo de navegacao com `aria-current="page"`
3. **Use** `role` semantico em containers de navegacao
4. **Mantenha** contraste minimo de 4.5:1 para texto

---

## 19. Deploy no Vercel

### 19.1 Setup Inicial

1. Acesse https://vercel.com e conecte sua conta GitHub
2. Clique em **"Add New > Project"**
3. Importe o repositorio `CoPais`
4. **Framework:** Next.js (detectado automaticamente)
5. **Root Directory:** `.` (raiz)
6. Nao altere Build & Output Settings

### 19.2 Variaveis de Ambiente no Vercel

**OBRIGATORIO** — sem isso o app da erro 500 (`MIDDLEWARE_INVOCATION_FAILED`).

1. Va em **Project Settings > Environment Variables**
2. Adicione:

| Key | Value | Environments |
|-----|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://SEU_PROJETO.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (sua anon key) | All |

> **NAO adicione** `SUPABASE_SERVICE_ROLE_KEY` no Vercel. Esta chave e muito poderosa e so deve ser usada em scripts locais.

> **NAO adicione** `NEXT_PUBLIC_APP_URL` — o Vercel ja sabe a URL.

3. Apos adicionar, faca um **Redeploy** (Deployments > ... > Redeploy)

### 19.3 Dominio

- **Dominio padrao:** `nome-do-projeto.vercel.app`
- Para mudar: **Settings > Domains > Edit**
- O dominio atual e `kindar.com.br`
- Dominios antigos (ex: `copais.vercel.app`, `kindar.vercel.app`) podem ser redirecionados via 307

### 19.4 Auto-Deploy

Qualquer push para a branch `main` dispara automaticamente um novo deploy. O build leva ~30-40 segundos.

### 19.5 Checklist de Verificacao Pos-Deploy

- [ ] Acessar a URL e ver a tela de login
- [ ] Login com bruno@kindar.test → ver dashboard "Ola, Bruno!" (ou traduzido no idioma selecionado)
- [ ] Login com martina@kindar.test → ver dashboard "Ola, Martina!"
- [ ] Navegar para /calendario → grid mensal aparece
- [ ] Navegar para /financeiro → dashboard com valores
- [ ] Verificar label "(voce)" segue o usuario logado
- [ ] Verificar que /api/calendar/TOKEN retorna text/calendar
- [ ] Trocar idioma no perfil → toda a UI muda
- [ ] Verificar saldo de trocas no calendario
- [ ] Acessar perfil de crianca → 4 abas funcionam

---

## 20. Usuarios de Teste e Seed

### Contas de Teste

| Usuario | Email | Senha | Papel no Grupo |
|---------|-------|-------|---------------|
| Bruno Silva | bruno@kindar.test | Kindar@2026 | admin (1o membro = teal) |
| Martina Oliveira | martina@kindar.test | Kindar@2026 | member (2o membro = coral) |

**Grupo:** Familia Kleber
**Crianca:** Kleber Silva Oliveira (nascimento: 15/06/2020)

### Recriar Dados de Teste

```bash
# Certifique-se que SUPABASE_SERVICE_ROLE_KEY esta no .env.local
node scripts/seed-test.mjs
```

O script e idempotente — se os usuarios ja existem, ele atualiza a senha e reutiliza os IDs.

---

## 21. Guia de Contribuicao

### Convencoes de Codigo

1. **Server/Client Split**: Page busca dados (Server), componente `*Client.tsx` renderiza (Client) com `useI18n()`
2. **Componentes co-localizados:** Components ficam na mesma pasta da page que os usa
3. **Server Actions para mutacoes:** Nunca faca `fetch()` para API Routes — use Server Actions
4. **Sem bibliotecas de UI:** Componentes feitos com Tailwind puro
5. **Sem state management global:** Cada page busca seus proprios dados
6. **i18n obrigatorio:** Toda string de UI deve usar `useI18n()`, nunca hardcode
7. **getUser() obrigatorio:** Nunca use `getSession()` para auth
8. **Sem FK Joins:** Faca queries separadas e junte em JS
9. **Acessibilidade:** aria-labels em navegacao, aria-current no item ativo

### Padrao de Nova Feature

1. Criar Server Action em `src/actions/nome.ts` (com `getUser()`)
2. Criar page em `src/app/(app)/rota/page.tsx` (Server Component, busca dados)
3. Criar Client Component `*Client.tsx` na mesma pasta (com `useI18n()`)
4. Adicionar chaves de traducao nos 5 arquivos JSON em `src/i18n/locales/`
5. Adicionar rota no grid de `/mais` (page.tsx)
6. Se for feature principal, adicionar no bottom nav (com aria-label)

### Padrao de Nova Tabela no Banco

1. Criar migration em `supabase/migrations/XXXXX_nome.sql`
2. Incluir `ENABLE ROW LEVEL SECURITY` e policies
3. Adicionar indexes para queries frequentes
4. Documentar neste manual

### Commits

```bash
# Formato
feat: descricao curta em ingles
fix: descricao do bug corrigido
i18n: adicionar traducoes para nova feature
perf: otimizar queries do modulo X
a11y: adicionar aria-labels no componente Y
```

---

## 22. Troubleshooting

### Erro 500: MIDDLEWARE_INVOCATION_FAILED

**Causa:** Variaveis de ambiente `NEXT_PUBLIC_SUPABASE_URL` e/ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` nao estao configuradas no Vercel.

**Solucao:** Adicionar as variaveis em **Vercel > Project Settings > Environment Variables** e fazer Redeploy.

### Erro "invalid input value for enum custody_type: 'schedule'"

**Causa:** Tentou usar `custody_type: "schedule"` que NAO existe. Valores validos: `regular`, `holiday`, `swap`, `vacation`, `special`.

**Solucao:** Usar `custody_type: "regular"` para eventos gerados pela escala.

### RLS bloqueando queries

**Causa:** O usuario logado nao pertence ao grupo que esta tentando acessar.

**Debug:** No SQL Editor do Supabase, rode:
```sql
SELECT * FROM group_members WHERE user_id = 'UUID_DO_USUARIO';
```

### Seed script falhando

**Causa:** `SUPABASE_SERVICE_ROLE_KEY` nao esta no `.env.local`.

**Solucao:** Copie a service_role key de **Supabase > Settings > API**.

### Chat nao permite deletar/editar mensagens

**Isso e intencional.** Triggers no banco impedem DELETE e UPDATE no texto de `chat_messages` para conformidade legal.

### Traducoes nao aparecem

**Causa:** O componente nao esta usando `useI18n()` ou a chave de traducao nao existe nos 5 arquivos JSON.

**Debug:** Verifique se o componente e Client Component (`"use client"`) e se a chave existe em todos os locales.

### getSession() retornando usuario nulo

**Causa:** `getSession()` foi depreciado. Use `getUser()` que valida o JWT no servidor.

**Solucao:** Substituir `supabase.auth.getSession()` por `supabase.auth.getUser()`.

---

## 23. Decisoes Arquiteturais

### Por que Next.js App Router e nao Pages Router?
- Server Components reduzem JavaScript no client
- Server Actions eliminam necessidade de API Routes
- Melhor DX com file-based routing e layouts aninhados

### Por que Supabase e nao Firebase/Prisma?
- PostgreSQL com SQL real (enums, triggers, constraints)
- RLS nativo no banco (seguranca por default)
- Auth integrada com SSR

### Por que sem bibliotecas de UI?
- Menor bundle size
- Controle total sobre o design
- Tailwind v4 fornece tudo que precisamos

### Por que componentes co-localizados e nao em /components?
- Facilita encontrar o componente de cada page
- Evita o padrao de "dump everything in /components"
- Componentes sao especificos de cada page, nao reutilizados

### Por que chat imutavel?
- Requisito legal para coparentalidade (mensagens podem ser usadas como evidencia)
- Implementado com triggers no PostgreSQL (impossivel burlar via client)

### Por que tokens na URL para iCal?
- Apps de calendario (iPhone/Google) nao suportam cookies/JWT
- Token hex de 32 bytes na URL e o padrao da industria para feeds iCal
- Cada token e unico por usuario+grupo

### Por que Server/Client Split em todas as paginas?
- `useI18n()` requer contexto React (Client Component)
- Busca de dados deve ser server-side (seguranca + performance)
- Padrao consistente facilita manutenibilidade

### Por que getUser() e nao getSession()?
- `getUser()` valida o JWT no servidor Supabase (seguro)
- `getSession()` apenas le o cookie sem validacao (vulneravel a tokens falsificados)
- Recomendacao oficial do Supabase para Server Actions

### Por que remover FK Joins do PostgREST?
- FK joins podem falhar silenciosamente com RLS
- Queries separadas sao mais previsiveis e debugaveis
- Joins manuais em JS dao mais controle

### Por que i18n customizado e nao next-intl/i18next?
- Zero dependencias externas (menor bundle)
- Implementacao simples com Context + JSON
- Controle total sobre fallbacks e interpolacao

### Por que React Portal no AIAssistant?
- O header mobile usa `backdrop-blur` que cria um novo containing block no CSS
- Modais posicionados com `fixed` ficam presos dentro desse containing block
- `createPortal(modal, document.body)` renderiza o modal fora da arvore DOM do header
- Container do Portal usa `useState` + `useEffect` para compatibilidade SSR (evita `document is not defined`)

### Por que Groq function calling com tool_choice "auto"/"none"?
- `tool_choice: "auto"` permite ao LLM decidir quais tools chamar em cada rodada
- Multi-round (ate 3 rodadas) permite encadear consultas + acoes em uma unica conversa
- Rodada final com `tool_choice: "none"` forca resposta em texto (evita loop infinito de tools)
- Todos os parametros de tools usam `type: "string"` porque Groq rejeita `"number"` quando o LLM gera output em formato inesperado

### Por que model fallback 70B → 8B?
- Groq aplica rate limiting agressivo no modelo 70B em planos gratuitos/basicos
- Quando rate limited, sistema faz fallback automatico para `llama-3.1-8b-instant` (mais rapido, menos rate limited)
- 8B pode falhar em `tool_use` — recuperacao retenta a chamada sem tools para obter resposta text-only
- Se 8B retornar resposta pobre (apenas emojis), sistema usa os resultados ja coletados das tools como fallback
- `sanitizeResponse()` limpa tags XML malformadas (`<function=...>`) que o 8B pode gerar

### Por que groqWithTimeout e maxDuration?
- Cada chamada a API Groq usa `groqWithTimeout()` com `AbortController` de 8s — evita que uma unica chamada trave todo o request
- `AbortError` e tratado como condicao de rate-limit, disparando fallback para o modelo 8B
- `export const maxDuration = 60` em routes e paginas SSR pesadas (`/api/ai/assistant`, `/dashboard`, `/calendario`) aumenta o limite do Vercel de 10s para 60s
- Frontend (`AIAssistant.tsx`) trata respostas 504/502 com try/catch no `response.json()` — mostra mensagem amigavel em vez de crash

### Por que parsers robustos para PT-BR?
- Usuarios brasileiros digitam valores como "45,00", "120 conto" — `parseAmount()` normaliza para numero
- Datas em formato BR "DD/MM/YYYY" ou "DD/MM" — `parseDate()` converte para ISO
- Horarios como "14h", "14h30" — `parseTime()` converte para "HH:MM"
- Dias da semana em portugues ("terca", "quinta") — `parseDaysOfWeek()` mapeia para formato DB

### Convencao: evitar double-parsing de valores
- **Regra**: quando `ai-local-parser.ts` ja converteu um valor (ex: "53,90" → 53.9), **nao** re-chamar `parseAmount()` no pipeline seguinte (`ai-tools.ts` / `route.ts`). Usar `Number(valor)` diretamente
- **Bug corrigido**: "comprei remedio 53,90" era salvo como R$ 539 — `parseAmount()` tratava o ponto decimal de "53.9" (ja parseado) como separador de milhar, removendo-o e gerando 539
- **Fix em `parseAmount()`** (`ai-tools.ts`): ponto seguido de exatamente 3 digitos = milhar (ex: "1.500"); ponto seguido de 1-2 digitos = decimal (ex: "53.9")
- **Fix em `mapLocalActionToTool()`** (`route.ts`): `createExpense` agora usa `Number(p.amount)` em vez de `parseAmount(p.amount)`, evitando re-parsing

---

> **Duvidas?** Consulte o `DOCUMENTACAO.md` para detalhes tecnicos adicionais ou entre em contato com o time de desenvolvimento.
