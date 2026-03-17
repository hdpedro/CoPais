# 2Lares - Manual de Desenvolvimento

> Manual completo para desenvolvedores que vao trabalhar no projeto 2Lares.
> Ultima atualizacao: 17/03/2026

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
12. [Design System](#12-design-system)
13. [Funcionalidades Implementadas](#13-funcionalidades-implementadas)
14. [Deploy no Vercel](#14-deploy-no-vercel)
15. [Usuarios de Teste e Seed](#15-usuarios-de-teste-e-seed)
16. [Guia de Contribuicao](#16-guia-de-contribuicao)
17. [Troubleshooting](#17-troubleshooting)
18. [Decisoes Arquiteturais](#18-decisoes-arquiteturais)

---

## 1. Visao Geral do Projeto

**2Lares** e um aplicativo de coparentalidade que ajuda pais separados a organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa. O nome "2Lares" representa os dois lares da crianca.

- **URL de producao:** https://2lares.vercel.app
- **Repositorio GitHub:** hdpedro/CoPais
- **Linguagem da UI:** Portugues (Brasil)

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
| Deploy | Vercel | Hobby | Zero-config para Next.js, auto-deploy |

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
3. Escolha um nome (ex: `2lares`)
4. Selecione a regiao mais proxima (ex: `South America (Sao Paulo)`)
5. Defina uma senha para o banco (guarde-a!)
6. Aguarde o projeto ser criado (~2 minutos)

### 4.2 Obter as Chaves

Apos o projeto ser criado:

1. Va em **Settings > API** no painel do Supabase
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (apenas para scripts locais)

### 4.3 Executar as Migrations

As migrations estao em `supabase/migrations/`. Execute-as **na ordem** no SQL Editor do Supabase:

1. **Acesse:** Supabase Dashboard > **SQL Editor**
2. Execute cada arquivo na ordem:

```
supabase/migrations/00001_initial_schema.sql    → Tabelas, enums, triggers, indexes
supabase/migrations/00002_rls_policies.sql      → Row Level Security (todas as tabelas)
supabase/migrations/00003_calendar_tokens.sql   → Tokens de calendario + check-ins + campos recorrentes
```

**IMPORTANTE:** Execute na ordem! O 00002 depende do 00001, e o 00003 depende de ambos.

### 4.4 O Que Cada Migration Faz

| Arquivo | Conteudo |
|---------|----------|
| `00001_initial_schema.sql` | Cria 12 tabelas, 9 enums, triggers (auto-profile, chat imutavel, updated_at), 12 indexes |
| `00002_rls_policies.sql` | Habilita RLS em todas as tabelas, cria funcoes `is_group_member()` e `is_group_admin()`, 22 policies |
| `00003_calendar_tokens.sql` | Tabela `calendar_tokens`, tabela `daily_checkins`, colunas `start_time`/`end_time`/`is_recurring`/`recurrence_rule` em `custody_events` |

### 4.5 Verificar a Instalacao

Apos rodar as migrations, verifique no Supabase:

1. **Table Editor** → deve mostrar 14 tabelas
2. **Authentication > Policies** → cada tabela deve ter RLS habilitado (cadeado verde)
3. **Database > Functions** → deve ter `is_group_member`, `is_group_admin`, `handle_new_user`, `prevent_chat_delete`, `prevent_chat_text_update`, `update_updated_at`

### 4.6 Popular com Dados de Teste (Seed)

```bash
# Requer SUPABASE_SERVICE_ROLE_KEY no .env.local
node scripts/seed-test.mjs
```

Isso cria:
- **Bruno Silva** (bruno@2lares.test) — Pai, admin do grupo
- **Martina Oliveira** (martina@2lares.test) — Mae, membro do grupo
- **Grupo:** Familia Kleber
- **Crianca:** Kleber Silva Oliveira (nascimento: 15/06/2020)
- Eventos de guarda de exemplo
- Despesas de exemplo
- Mensagens de chat de exemplo
- Acordos e registros escolares de exemplo

**Senha de ambos:** `2Lares@2026`

### 4.7 Configuracoes Adicionais do Supabase

No painel do Supabase, configure:

1. **Authentication > URL Configuration:**
   - Site URL: `https://2lares.vercel.app` (producao) ou `http://localhost:3000` (dev)
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
             [Server Component]
                    |
                    v
           [Supabase Server Client] ──> PostgreSQL (Supabase)
                    |
                    v
             [Client Component]
                    |
            (Server Actions)
                    |
                    v
           [Supabase Server Client] ──> PostgreSQL
```

### Padroes Principais

1. **Server Components** (padrao): Todas as pages sao Server Components que buscam dados diretamente no Supabase
2. **Client Components** (`"use client"`): Apenas para interatividade (formularios, modais, navegacao de meses)
3. **Server Actions** (`"use server"`): Para mutacoes (criar, editar, deletar dados). Ficam em `src/actions/`
4. **Sem API Routes tradicionais**: A unica API Route e o feed iCal (`/api/calendar/[token]`). Todo o resto usa Server Actions
5. **Sem ORM**: Queries diretas com `supabase.from("tabela").select/insert/update`
6. **Sem state management global**: Cada page busca seus proprios dados. Revalidacao via `revalidatePath()`

### Fluxo de Dados Tipico

```
1. Usuario acessa /calendario
2. page.tsx (Server Component) busca dados via Supabase Server Client
3. Passa dados serializados para CalendarGrid (Client Component)
4. Usuario clica em "Aprovar Troca"
5. Form chama Server Action respondToSwapRequest()
6. Server Action executa no servidor, faz queries no Supabase
7. Chama revalidatePath("/calendario") para invalidar cache
8. Pagina recarrega com dados atualizados
```

---

## 6. Estrutura de Pastas Completa

```
2Lares/
├── .env.example                    # Template de variaveis de ambiente
├── .env.local                      # Variaveis de ambiente (NAO commitado)
├── .gitignore
├── DOCUMENTACAO.md                 # Documentacao tecnica do projeto
├── MANUAL_DEV.md                   # Este manual
├── next.config.ts                  # Configuracao do Next.js (vazio/padrao)
├── package.json
├── postcss.config.mjs              # Configuracao PostCSS + Tailwind v4
├── tsconfig.json                   # TypeScript com alias @/* → ./src/*
│
├── scripts/
│   └── seed-test.mjs               # Script de seed dos dados de teste
│
├── supabase/
│   └── migrations/
│       ├── 00001_initial_schema.sql # Tabelas, enums, triggers
│       ├── 00002_rls_policies.sql   # Row Level Security
│       └── 00003_calendar_tokens.sql # Tokens iCal + check-ins + campos recorrentes
│
└── src/
    ├── middleware.ts                 # Auth middleware (intercepta todas as requests)
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
    │   │   ├── layout.tsx           # Layout do app (header + bottom nav + auth check)
    │   │   ├── dashboard/page.tsx
    │   │   ├── onboarding/page.tsx
    │   │   ├── mais/page.tsx        # Grid com todas as funcionalidades
    │   │   │
    │   │   ├── calendario/
    │   │   │   ├── page.tsx              # Pagina principal (Server Component)
    │   │   │   ├── CalendarClient.tsx    # Wrapper client para estado do mes
    │   │   │   ├── CalendarGrid.tsx      # Grade mensal colorida
    │   │   │   ├── WeekendPlanner.tsx    # Scroll horizontal de fins de semana
    │   │   │   ├── SwapRequestModal.tsx  # Modal para solicitar troca
    │   │   │   ├── SwapRequestList.tsx   # Lista de trocas pendentes
    │   │   │   ├── CalendarExportButton.tsx # Botao de sincronizacao iCal
    │   │   │   ├── novo/
    │   │   │   │   ├── page.tsx          # Pagina de novo evento
    │   │   │   │   └── NewEventForm.tsx  # Formulario de evento (recorrente)
    │   │   │   └── escala/
    │   │   │       ├── page.tsx          # Pagina da escala
    │   │   │       └── ScheduleBuilder.tsx # Builder visual de escala quinzenal
    │   │   │
    │   │   ├── financeiro/
    │   │   │   ├── page.tsx              # Busca dados e renderiza dashboard
    │   │   │   └── FinancialDashboard.tsx # Dashboard com abas Resumo/Historico
    │   │   │
    │   │   ├── despesas/
    │   │   │   ├── page.tsx              # Lista de despesas
    │   │   │   └── nova/page.tsx         # Formulario de nova despesa
    │   │   │
    │   │   ├── chat/
    │   │   │   ├── page.tsx              # Pagina do chat
    │   │   │   └── ChatRoom.tsx          # Chat em tempo real
    │   │   │
    │   │   ├── checkin/
    │   │   │   ├── page.tsx              # Pagina de check-in
    │   │   │   └── CheckinForm.tsx       # Formulario com categorias + templates
    │   │   │
    │   │   ├── criancas/
    │   │   │   ├── page.tsx              # Lista de criancas
    │   │   │   ├── nova/page.tsx         # Adicionar crianca
    │   │   │   └── [id]/page.tsx         # Detalhe da crianca
    │   │   │
    │   │   ├── saude/page.tsx
    │   │   ├── documentos/page.tsx
    │   │   ├── acordos/page.tsx
    │   │   ├── eventos/page.tsx
    │   │   ├── escola/page.tsx
    │   │   ├── temas-sensiveis/page.tsx
    │   │   └── convite/enviar/page.tsx
    │   │
    │   └── api/
    │       └── calendar/
    │           └── [token]/route.ts  # Feed iCalendar (RFC 5545)
    │
    ├── actions/                      # === SERVER ACTIONS ===
    │   ├── auth.ts                   # signUp, signIn, signOut, resetPassword
    │   ├── calendar.ts               # createCustodyEvent, createSwapRequest, respondToSwapRequest, generateSchedule, getOrCreateCalendarToken
    │   ├── checkin.ts                # createCheckin (+ envia msg no chat)
    │   ├── expenses.ts               # createExpense, updateExpenseStatus
    │   ├── group.ts                  # createGroup, joinGroup
    │   ├── invitation.ts             # sendInvitation, acceptInvitation
    │   ├── health.ts                 # createHealthLog
    │   ├── documents.ts              # uploadDocument
    │   ├── agreements.ts             # createAgreement
    │   ├── events.ts                 # createEvent
    │   ├── school.ts                 # createSchoolNote
    │   └── sensitive.ts              # createSensitiveTopic
    │
    ├── lib/
    │   ├── constants.ts              # COLORS, EXPENSE_CATEGORIES, CHECKIN_CATEGORIES, PARENT_COLORS, DAY_NAMES, MONTH_NAMES, CUSTODY_TYPE_LABELS, USER_ROLES
    │   ├── calendar-utils.ts         # getDaysInMonth, getMonthGrid, buildCustodyMap, formatDateKey
    │   ├── ical.ts                   # generateICalFeed (RFC 5545)
    │   └── supabase/
    │       ├── client.ts             # createBrowserClient (para Client Components)
    │       ├── server.ts             # createServerClient (para Server Components/Actions)
    │       └── middleware.ts          # updateSession (refresh de cookies)
    │
    └── components/                   # (diretorio vazio, componentes ficam co-localizados com as pages)
        ├── auth/
        └── ui/
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

| Rota | Descricao | Componentes |
|------|-----------|-------------|
| `/dashboard` | Pagina inicial | - |
| `/onboarding` | Primeiro acesso | - |
| `/calendario` | Calendario visual | CalendarClient, CalendarGrid, WeekendPlanner, SwapRequestList, SwapRequestModal, CalendarExportButton |
| `/calendario/novo` | Novo evento | NewEventForm |
| `/calendario/escala` | Builder de escala | ScheduleBuilder |
| `/financeiro` | Dashboard financeiro | FinancialDashboard |
| `/despesas` | Lista de despesas | - |
| `/despesas/nova` | Nova despesa | - |
| `/chat` | Chat do grupo | ChatRoom |
| `/checkin` | Check-in diario | CheckinForm |
| `/criancas` | Lista de criancas | - |
| `/criancas/nova` | Adicionar crianca | - |
| `/criancas/[id]` | Detalhe da crianca | - |
| `/saude` | Registros de saude | - |
| `/documentos` | Documentos | - |
| `/acordos` | Acordos | - |
| `/eventos` | Eventos gerais | - |
| `/escola` | Escola | - |
| `/temas-sensiveis` | Temas sensiveis | - |
| `/convite/enviar` | Enviar convite | - |
| `/mais` | Todas as funcionalidades | - |

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

  // 2. Verificar autenticacao
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 3. Extrair dados do FormData
  const campo = formData.get("campo") as string;

  // 4. Executar operacao no banco
  const { error } = await supabase.from("tabela").insert({ campo });

  // 5. Tratar erro
  if (error) return { error: error.message };

  // 6. Revalidar cache e redirecionar
  revalidatePath("/rota");
  return { success: true };
}
```

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
| `createExpense` | expenses.ts | Registra nova despesa |
| `updateExpenseStatus` | expenses.ts | Aprova/rejeita despesa |
| `createCheckin` | checkin.ts | Cria check-in + envia mensagem automatica no chat |
| `createGroup` | group.ts | Cria grupo de coparentalidade |
| `joinGroup` | group.ts | Entrar em grupo existente |
| `sendInvitation` | invitation.ts | Envia convite por email |
| `acceptInvitation` | invitation.ts | Aceita convite via token |
| `createHealthLog` | health.ts | Registra log de saude |
| `uploadDocument` | documents.ts | Upload de documento |
| `createAgreement` | agreements.ts | Registra acordo |
| `createEvent` | events.ts | Cria evento geral |
| `createSchoolNote` | school.ts | Registra nota escolar |
| `createSensitiveTopic` | sensitive.ts | Cria tema sensivel |

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
| `notification_type` | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system | Tipo de notificacao |
| `invitation_status` | pending, accepted, expired, revoked | Status de convite |

> **CUIDADO:** Ao criar eventos de guarda via `generateSchedule`, SEMPRE use `custody_type: "regular"`. O valor `"schedule"` NAO existe no enum e causara erro.

### Tabelas (14 total)

| # | Tabela | Chave Primaria | Principal FK | Descricao |
|---|--------|---------------|-------------|-----------|
| 1 | `profiles` | `id` (= auth.users.id) | auth.users | Perfil do usuario |
| 2 | `coparenting_groups` | `id` (UUID) | profiles.id | Grupo familiar |
| 3 | `group_members` | `id` (UUID) | groups + profiles | Vinculo usuario-grupo |
| 4 | `children` | `id` (UUID) | groups | Criancas do grupo |
| 5 | `custody_events` | `id` (UUID) | groups + children + profiles | Eventos de guarda |
| 6 | `expenses` | `id` (UUID) | groups + children + profiles | Despesas compartilhadas |
| 7 | `chat_messages` | `id` (UUID) | groups + profiles | Chat (IMUTAVEL) |
| 8 | `health_logs` | `id` (UUID) | groups + children + profiles | Logs de saude |
| 9 | `documents` | `id` (UUID) | groups + children + profiles | Documentos |
| 10 | `swap_requests` | `id` (UUID) | groups + profiles | Trocas de dia |
| 11 | `daily_checkins` | `id` (UUID) | groups + children + profiles | Check-ins diarios |
| 12 | `calendar_tokens` | `id` (UUID) | auth.users + groups | Tokens iCal |
| 13 | `notifications` | `id` (UUID) | profiles | Notificacoes |
| 14 | `invitations` | `id` (UUID) | groups + profiles | Convites |

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

---

## 12. Design System

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

- **Header:** Logo "2Lares" (link para /dashboard), nome do usuario, botao "Sair"
- **Bottom nav (mobile):** 5 itens — Inicio, Calendario, Chat, Financeiro, Mais
- **Pagina /mais:** Grid 3x5 com todas as 14 funcionalidades

---

## 13. Funcionalidades Implementadas

### Calendario Visual
- Grade mensal 7 colunas com dias coloridos por responsavel
- Navegacao entre meses, destaque do dia atual
- Planejador de fins de semana (scroll horizontal, badges Livre/Parcial)
- Troca de dias com fluxo de aprovacao
- Escala quinzenal com 4 presets e geracao em lote
- Sincronizacao com celular via iCal (RFC 5545)

### Dashboard Financeiro
- Resumo mensal com gastos por responsavel
- Calculo automatico de balanco 50/50
- Breakdown por categoria
- Historico mensal com navegacao

### Check-in Diario
- 8 categorias com icones e templates rapidos
- Timeline de check-ins recentes
- Integracao automatica com o chat do grupo

### Chat
- Mensagens legalmente imutaveis (triggers no banco impedem delete/edit)
- Suporte a respostas e pins

### Demais
- Gestao de criancas, saude, documentos, acordos, eventos, escola, temas sensiveis
- Sistema de convites com token
- Onboarding para primeiro acesso

---

## 14. Deploy no Vercel

### 14.1 Setup Inicial

1. Acesse https://vercel.com e conecte sua conta GitHub
2. Clique em **"Add New > Project"**
3. Importe o repositorio `CoPais`
4. **Framework:** Next.js (detectado automaticamente)
5. **Root Directory:** `.` (raiz)
6. Nao altere Build & Output Settings

### 14.2 Variaveis de Ambiente no Vercel

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

### 14.3 Dominio

- **Dominio padrao:** `nome-do-projeto.vercel.app`
- Para mudar: **Settings > Domains > Edit**
- O dominio atual e `2lares.vercel.app`
- Dominios antigos (ex: `copais.vercel.app`) podem ser redirecionados via 307

### 14.4 Auto-Deploy

Qualquer push para a branch `main` dispara automaticamente um novo deploy. O build leva ~30-40 segundos.

### 14.5 Checklist de Verificacao Pos-Deploy

- [ ] Acessar a URL e ver a tela de login
- [ ] Login com bruno@2lares.test → ver dashboard "Ola, Bruno!"
- [ ] Login com martina@2lares.test → ver dashboard "Ola, Martina!"
- [ ] Navegar para /calendario → grid mensal aparece
- [ ] Navegar para /financeiro → dashboard com valores
- [ ] Verificar label "(voce)" segue o usuario logado
- [ ] Verificar que /api/calendar/TOKEN retorna text/calendar

---

## 15. Usuarios de Teste e Seed

### Contas de Teste

| Usuario | Email | Senha | Papel no Grupo |
|---------|-------|-------|---------------|
| Bruno Silva | bruno@2lares.test | 2Lares@2026 | admin (1o membro = teal) |
| Martina Oliveira | martina@2lares.test | 2Lares@2026 | member (2o membro = coral) |

**Grupo:** Familia Kleber
**Crianca:** Kleber Silva Oliveira (nascimento: 15/06/2020)

### Recriar Dados de Teste

```bash
# Certifique-se que SUPABASE_SERVICE_ROLE_KEY esta no .env.local
node scripts/seed-test.mjs
```

O script e idempotente — se os usuarios ja existem, ele atualiza a senha e reutiliza os IDs.

---

## 16. Guia de Contribuicao

### Convencoes de Codigo

1. **Componentes co-localizados:** Components ficam na mesma pasta da page que os usa (ex: `calendario/CalendarGrid.tsx`)
2. **Server Components por padrao:** So use `"use client"` quando precisar de interatividade
3. **Server Actions para mutacoes:** Nunca faca `fetch()` para API Routes — use Server Actions
4. **Sem bibliotecas de UI:** Componentes feitos com Tailwind puro
5. **Sem state management global:** Cada page busca seus proprios dados
6. **Portugues na UI, ingles no codigo:** Labels em PT-BR, variaveis/funcoes em ingles

### Padrao de Nova Feature

1. Criar Server Action em `src/actions/nome.ts`
2. Criar page em `src/app/(app)/rota/page.tsx` (Server Component)
3. Se precisar de interatividade, criar Client Component na mesma pasta
4. Adicionar rota no grid de `/mais` (page.tsx)
5. Se for feature principal, adicionar no bottom nav

### Padrao de Nova Tabela no Banco

1. Criar migration em `supabase/migrations/00004_nome.sql`
2. Incluir `ENABLE ROW LEVEL SECURITY` e policies
3. Adicionar indexes para queries frequentes
4. Documentar neste manual

### Commits

```bash
# Formato
feat: descricao curta em ingles
fix: descricao do bug corrigido
```

---

## 17. Troubleshooting

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

---

## 18. Decisoes Arquiteturais

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

---

> **Duvidas?** Consulte o `DOCUMENTACAO.md` para detalhes tecnicos adicionais ou entre em contato com o time de desenvolvimento.
