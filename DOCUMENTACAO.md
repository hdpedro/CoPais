# 2Lares - Documentacao Tecnica Completa

## Visao Geral

**2Lares** e um aplicativo de coparentalidade que ajuda pais separados a organizarem a rotina dos filhos de forma colaborativa, transparente e respeitosa. O nome "2Lares" representa os dois lares da crianca.

**URL de producao:** https://2lares.vercel.app

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
| Deploy | Vercel | Hobby |
| Repositorio | GitHub | hdpedro/CoPais |

---

## Arquitetura

```
src/
├── actions/          # Server Actions (12 arquivos)
├── app/
│   ├── (auth)/       # Rotas publicas (login, signup, etc.)
│   ├── (app)/        # Rotas protegidas (dashboard, calendario, etc.)
│   └── api/          # API Routes (iCal feed)
├── lib/
│   ├── supabase/     # Client, Server, Middleware
│   ├── constants.ts  # Constantes do app
│   ├── calendar-utils.ts  # Utilidades de data/calendario
│   └── ical.ts       # Gerador iCalendar (RFC 5545)
└── middleware.ts      # Auth middleware
```

### Fluxo de Autenticacao

1. Middleware intercepta todas as requisicoes
2. Atualiza sessao Supabase via cookies
3. Redireciona usuarios nao autenticados para `/login`
4. Redireciona usuarios autenticados de `/login` para `/dashboard`
5. Rotas publicas: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/convite`

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
| notification_type | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system |
| invitation_status | pending, accepted, expired, revoked |

### Tabelas Principais

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

### Seguranca (Row Level Security)

Todas as tabelas possuem RLS habilitado. Funcoes auxiliares:
- `is_group_member(group_id)` - verifica se o usuario pertence ao grupo
- `is_group_admin(group_id)` - verifica se o usuario e admin do grupo

Politicas garantem que:
- Usuarios so veem dados dos seus proprios grupos
- Despesas so podem ser criadas pelo pagador (`paid_by = auth.uid()`)
- Mensagens de chat sao imutaveis (sem DELETE, sem UPDATE no texto)
- Notificacoes sao privadas por usuario
- Tokens de calendario sao privados por usuario

---

## Funcionalidades Implementadas

### 1. Dashboard (`/dashboard`)
- Saudacao personalizada com nome do usuario
- Lista de criancas do grupo com idade
- Acoes rapidas (8 botoes: Chat, Calendario, Financeiro, Acordos, Eventos, Check-in, Escola, Saude)
- Proximos eventos de guarda
- Despesas recentes

### 2. Calendario Visual (`/calendario`)
- **Grade mensal** com 7 colunas (Dom-Sab)
- Dias coloridos por responsavel (teal = 1o pai, coral = 2o pai)
- Destaque do dia atual (ring)
- Navegacao entre meses (setas prev/next)
- Legenda com nomes e cores dos pais
- Botoes "Escala" e "+ Evento" no header

### 3. Planejador de Fim de Semana (`/calendario`)
- Scroll horizontal com proximos 8 fins de semana
- Badges de status: "Livre" (verde), "Parcial" (amarelo), "Com voce" (azul)
- Facilita planejamento de viagens

### 4. Troca de Dias (Swap Requests) (`/calendario`)
- Tocar em um dia do outro responsavel abre modal de troca
- Selecionar data proposta para troca + motivo
- Lista de trocas pendentes com botoes Aprovar/Rejeitar
- Aprovacao gera novos eventos de guarda automaticamente

### 5. Escala de Guarda (`/calendario/escala`)
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

### 6. Novo Evento (`/calendario/novo`)
- Formulario com tipo de guarda, responsavel, crianca, datas
- **Checkbox "Definir horario"** → campos de hora inicio/fim
- **Checkbox "Evento recorrente"** → frequencia (diario, semanal, quinzenal, mensal) + "Repetir ate"
- Gera eventos individuais para recorrencias

### 7. Sincronizacao com Celular (`/calendario`)
- Botao "Sincronizar com Celular"
- Gera token unico por usuario/grupo
- URL de assinatura iCalendar (RFC 5545)
- Instrucoes para iPhone (Ajustes → Calendario → Contas) e Android (Google Calendar → Por URL)
- API Route: `GET /api/calendar/[token]` retorna `text/calendar`

### 8. Check-in Diario (`/checkin`)
- **8 categorias** com icones: Tempo de Tela, Alimentacao, Sono, Humor, Saude, Atividade, Escola, Outro
- Templates rapidos por categoria (ex: "Ficou 1h na tela", "Comeu hamburguer")
- Titulo + descricao opcional
- Timeline de check-ins recentes (hoje + ultimos 7 dias)
- **Integracao com Chat**: cada check-in envia mensagem automatica ao grupo
  - Formato: `📱 Check-in: Ficou 4h na tela — Jogando tablet (Kleber)`

### 9. Dashboard Financeiro (`/financeiro`)
- **Aba Resumo:**
  - Navegacao por mes (setas prev/next)
  - Total do mes com contagem de despesas
  - Cards por responsavel com valor, barra de progresso e percentual
  - **Calculo de balanco** 50/50: "Martina deve R$ 142,75 para Bruno"
  - Breakdown por categoria com barras de progresso
  - Lista de despesas do mes com status (Pendente/Aprovada/Rejeitada)
  - Botao "+ Nova Despesa"
- **Aba Historico:**
  - Cards por mes com total, barra empilhada de cores, valores por responsavel
  - Balanco mensal ("Equilibrado" ou "X deve R$ Y para Z")
  - Clicar no card navega para o Resumo daquele mes

### 10. Despesas (`/despesas`)
- Lista de despesas com icone de categoria, valor, status
- Botoes Aprovar/Rejeitar para despesas do outro responsavel
- Cards de resumo (Total + Pendentes)

### 11. Nova Despesa (`/despesas/nova`)
- Descricao, valor (R$), categoria, crianca (opcional), data
- Criacao via Server Action

### 12. Chat (`/chat`)
- Mensagens em tempo real do grupo
- Mensagens imutaveis (conformidade legal)
- Suporte a respostas e pins

### 13. Criancas (`/criancas`)
- Lista de criancas com foto e idade
- Adicionar nova crianca (`/criancas/nova`)
- Detalhe da crianca (`/criancas/[id]`)

### 14. Saude (`/saude`)
- Registro de logs de saude (febre, medicacao, humor, sono, peso, etc.)

### 15. Documentos (`/documentos`)
- Upload e visualizacao de documentos compartilhados
- Categorias: pessoal, saude, educacao, legal

### 16. Acordos (`/acordos`)
- Registro de acordos entre os responsaveis

### 17. Eventos (`/eventos`)
- Eventos gerais (aniversarios, festas, etc.)

### 18. Escola (`/escola`)
- Informacoes escolares

### 19. Temas Sensiveis (`/temas-sensiveis`)
- Area para discussao de temas delicados

### 20. Convite (`/convite/enviar`)
- Envio de convites por email/telefone
- Aceitacao via link com token (`/convite/[token]`)

### 21. Perfil (`/perfil`)
- Visualizacao e edicao de dados pessoais

### 22. Mais (`/mais`)
- Grid com todas as 14 funcionalidades do app

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
- **Bottom nav** (mobile): Inicio, Calendario, Chat, Financeiro, Mais
- **Header**: Logo "2Lares", nome do usuario, botao Sair

---

## Server Actions

| Action | Arquivo | Funcao |
|--------|---------|--------|
| createCustodyEvent | calendar.ts | Cria evento de guarda (unico ou recorrente) |
| createSwapRequest | calendar.ts | Solicita troca de dia |
| respondToSwapRequest | calendar.ts | Aprova/rejeita troca |
| generateSchedule | calendar.ts | Gera escala quinzenal em lote |
| getOrCreateCalendarToken | calendar.ts | Token para iCal |
| createExpense | expenses.ts | Registra despesa |
| updateExpenseStatus | expenses.ts | Aprova/rejeita despesa |
| createCheckin | checkin.ts | Cria check-in + envia ao chat |
| signUp / signIn / signOut | auth.ts | Autenticacao |
| createGroup / joinGroup | group.ts | Gestao de grupos |
| sendInvitation / acceptInvitation | invitation.ts | Convites |
| createHealthLog | health.ts | Registro de saude |
| uploadDocument | documents.ts | Upload de documentos |
| createAgreement | agreements.ts | Registro de acordos |
| createEvent | events.ts | Eventos gerais |
| createSchoolNote | school.ts | Notas escolares |
| createSensitiveTopic | sensitive.ts | Temas sensiveis |

---

## Variaveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=        # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Chave anonima (publica)
SUPABASE_SERVICE_ROLE_KEY=       # Chave de servico (privada, apenas server-side)
NEXT_PUBLIC_APP_URL=             # URL do app (http://localhost:3000 em dev)
```

---

## Usuarios de Teste

| Usuario | Email | Senha | Papel |
|---------|-------|-------|-------|
| Bruno Silva | bruno@2lares.test | 2Lares@2026 | Pai |
| Martina Oliveira | martina@2lares.test | 2Lares@2026 | Mae |

**Grupo:** Familia Kleber
**Crianca:** Kleber Silva Oliveira (5 anos)

---

## Deploy

- **Plataforma:** Vercel (Hobby plan)
- **URL:** https://2lares.vercel.app
- **Branch:** main
- **Auto-deploy:** Sim (push para main aciona deploy automatico)
- **Build:** `next build` (0 erros, 33 rotas)

---

## Conformidade

- **LGPD**: Campo `lgpd_consent_at` no perfil para registro de consentimento
- **Mensagens imutaveis**: Chat com triggers que impedem DELETE e UPDATE do texto (conformidade legal)
- **RLS**: Isolamento total de dados por grupo familiar
- **Tokens seguros**: iCal usa tokens hex de 32 bytes (nao exige autenticacao por cookie)

---

## Estrutura de Arquivos (66 arquivos em src/)

```
src/
├── actions/              # 12 server actions
│   ├── agreements.ts
│   ├── auth.ts
│   ├── calendar.ts
│   ├── checkin.ts
│   ├── documents.ts
│   ├── events.ts
│   ├── expenses.ts
│   ├── group.ts
│   ├── health.ts
│   ├── invitation.ts
│   ├── school.ts
│   └── sensitive.ts
├── app/
│   ├── (auth)/           # 5 paginas publicas + layout
│   ├── (app)/            # 23 paginas protegidas + layout
│   │   ├── calendario/   # CalendarGrid, WeekendPlanner, SwapRequestModal,
│   │   │   │             # SwapRequestList, CalendarExportButton, CalendarClient
│   │   │   ├── escala/   # ScheduleBuilder
│   │   │   └── novo/     # NewEventForm
│   │   ├── checkin/      # CheckinForm
│   │   ├── financeiro/   # FinancialDashboard
│   │   └── ...
│   ├── api/calendar/[token]/  # iCal feed endpoint
│   ├── globals.css
│   └── layout.tsx        # Root layout
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts
│   ├── calendar-utils.ts # Funcoes de data puras
│   ├── constants.ts      # Cores, categorias, labels
│   └── ical.ts           # Gerador RFC 5545
└── middleware.ts          # Auth middleware
```
