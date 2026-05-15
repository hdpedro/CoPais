# Arquitetura do Sistema - Kindar

> Visao completa da arquitetura tecnica da plataforma Kindar.
> Versao: 1.3 | Atualizado: 14/05/2026
>
> **Mudancas estruturais pos-versao 1.0 (Abril-Maio/2026):**
> - **Arquitetura dual**: PWA (`src/`) + Kindar Native (`kindar-native/`) compartilhando 100% do backend Supabase (mesmo schema, RLS, storage, push).
> - **Camada `src/lib/services/<dominio>.ts`**: fonte unica de regra de negocio chamada por actions (PWA), API routes (native), e tools (assistente/WhatsApp). Pares consolidados: `swap.ts`, `expenses.ts`, `notes.ts`, `checkin.ts`, `decisions.ts`, `collab.ts`, `health-collab.ts`.
> - **Banco como fonte de verdade para side-effects derivados**: `calendar_occurrences` (migration 00074), `custody_resolved` view (00079), trigger `illness_episodes_grave_to_urgent` (00080). Client/JS continua existindo como UI otimista mas o banco garante.
> - **Foundation polimorfica**: tabela `collab_reads (record_type, record_id, user_id, read_at)` + funcao `collab_record_group()` resolve grupo por modulo via WHEN branches. Adocao por novo modulo custa ~20 linhas.
> - **Pipeline auto-fix**: `app_errors` → Claude API (claude-sonnet) → GitHub PR (Contents API) → Discord (interactions).
> - **WebView hibrida**: telas com forms 1000+ LOC reaproveitadas em native via session injection Supabase (`localStorage.setItem('sb-...auth-token', ...)`). Hoje cobre `/criancas/[id]` e `/calendario/novo`.

---

## 1. Diagrama de Arquitetura

```
                          +------------------+
                          |   Vercel Edge    |
                          |   CDN Network    |
                          +--------+---------+
                                   |
                                   v
+------------------+      +------------------+      +------------------+
|                  |      |                  |      |                  |
|   Browser/PWA    +----->+   Next.js 16     +----->+    Supabase      |
|   (React 19)     |      |   App Router     |      |    Platform      |
|                  |<-----+   (Vercel)       |<-----+                  |
+------------------+      +------------------+      +--+--+--+--+-----+
                                   |                   |  |  |  |
                                   |                   |  |  |  |
                          +--------+---------+         |  |  |  |
                          |   PostHog        |         |  |  |  |
                          |   Analytics      |         |  |  |  |
                          +------------------+         |  |  |  |
                                                       |  |  |  |
                          +------------------+         |  |  |  |
                          |   Sentry         |         |  |  |  |
                          |   Error Tracking |         |  |  |  |
                          +------------------+         |  |  |  |
                                                       |  |  |  |
                    +----------------------------------+  |  |  |
                    |  PostgreSQL (DB principal)          |  |  |
                    +----------------------------------+  |  |  |
                                                          |  |  |
                    +-------------------------------------+  |  |
                    |  Supabase Auth (email + OAuth)         |  |
                    +-------------------------------------+  |  |
                                                             |  |
                    +----------------------------------------+  |
                    |  Supabase Realtime (WebSocket)            |
                    +----------------------------------------+  |
                                                                |
                    +-------------------------------------------+
                    |  Supabase Storage (receipts, documents)
                    +-------------------------------------------+
```

---

## 2. Padrao Server/Client Split

Todas as paginas do Kindar seguem o mesmo padrao arquitetural:

```
+---------------------------+     +---------------------------+
|   Server Component        |     |   Client Component        |
|   (page.tsx)              |     |   (*Client.tsx)           |
|                           |     |                           |
|   1. getUser()            |     |   1. Recebe props         |
|   2. getActiveGroup()     |     |      serializaveis        |
|   3. Promise.all([        |     |   2. useI18n() para       |
|        query1,            |     |      traducoes            |
|        query2,            |     |   3. useState/useCallback |
|        query3,            |     |      para interatividade  |
|      ])                   |     |   4. Renderiza UI         |
|   4. Processa dados       |     |                           |
|   5. Serializa props      |     |                           |
|   6. Renderiza Client     |     |                           |
+---------------------------+     +---------------------------+
         SERVER                            CLIENT
```

### Exemplo Concreto: Dashboard

```
dashboard/page.tsx (Server Component)
  |
  +--> getUser() via supabase.auth
  +--> getActiveGroup() - grupo ativo do usuario
  +--> Promise.all([
  |      custody_events (3 meses),
  |      expenses (mes atual),
  |      pending_swaps,
  |      medications,
  |      allergies,
  |      appointments,
  |      illnesses,
  |      checkins,
  |      pending_expenses,
  |      open_decisions
  |    ])
  +--> Processa: filtra por data, calcula saldos, formata labels
  +--> Serializa para DashboardClientProps (sem objetos Date, sem funcs)
  |
  v
DashboardClient.tsx (Client Component)
  |
  +--> Recebe ~30 props serializaveis
  +--> useI18n() para textos traduzidos
  +--> Renderiza cards, graficos, listas
```

### Por Que Este Padrao?

| Beneficio                   | Explicacao                                              |
|-----------------------------|---------------------------------------------------------|
| SEO e performance           | SSR completo, HTML renderizado no servidor               |
| Seguranca                   | Queries SQL nunca chegam ao client                       |
| Bundle size                 | Supabase client nao vai para o bundle JS do browser      |
| i18n client-side            | Traducoes reativas sem re-render do servidor              |
| Tipagem forte               | Props interface garante contrato entre server e client    |

---

## 3. Fluxo de Dados

### 3.1 Leitura (Read Path)

```
Browser REQUEST
     |
     v
Vercel Edge (middleware.ts)
     |
     +--> updateSession() - refresh token de auth
     |
     v
Server Component (page.tsx)
     |
     +--> createClient() - Supabase client server-side
     +--> supabase.auth.getUser() - valida sessao
     +--> Queries com RLS (Row Level Security)
     |    (usuario so ve dados do seu grupo)
     +--> Processa e serializa dados
     |
     v
Client Component (*Client.tsx)
     |
     +--> Renderiza HTML + hydration
     |
     v
Browser RESPONSE (HTML completo)
```

### 3.2 Escrita (Write Path)

```
Browser FORM SUBMIT
     |
     v
Server Action (src/actions/*.ts)
     |
     +--> "use server" - executa no servidor
     +--> supabase.auth.getUser() - valida sessao
     +--> verifyGroupMembership() - valida autorizacao
     +--> Valida inputs (trim, parse, type check)
     +--> INSERT/UPDATE no Supabase
     +--> Push notification (se aplicavel)
     +--> postChatNotification() (se aplicavel)
     +--> captureServerEvent() - analytics
     +--> revalidatePath() - invalida cache da pagina
     |
     v
Browser REDIRECT ou REVALIDATE
```

### 3.3 Realtime (Chat)

```
Client Component (ChatRoom.tsx)
     |
     +--> createClient() - Supabase client browser-side
     +--> supabase.channel(`chat-${groupId}`)
     |      .on('postgres_changes', { table: 'chat_messages' })
     |      .subscribe()
     |
     v
Supabase Realtime (WebSocket)
     |
     +--> INSERT em chat_messages dispara evento
     +--> Broadcast para todos os subscribers do canal
     |
     v
Todos os browsers conectados recebem a mensagem
```

---

## 4. Fluxo de Autenticacao

```
+-------------------+
| /login            |
| Email + Senha     |
| ou Google OAuth   |
+--------+----------+
         |
         v
+-------------------+
| Supabase Auth     |
| Emite JWT token   |
| Seta cookies      |
+--------+----------+
         |
         v
+-------------------+     +-------------------+
| middleware.ts     |     | Cada page.tsx     |
| updateSession()  |---->| getUser()         |
| Refresh token    |     | Se null: redirect |
| a cada request   |     | para /login       |
+-------------------+     +-------------------+
```

### Cookies de Auth
- Gerenciados por `@supabase/ssr`
- HttpOnly, Secure, SameSite=Lax
- Refresh automatico no middleware a cada request
- Expiracao: 1 hora (access), 60 dias (refresh)

### OAuth (Google)
- Configurado no Supabase Dashboard
- Redirect callback: `/auth/callback`
- Cria profile automaticamente no primeiro login

---

## 5. Storage de Arquivos

### Buckets

| Bucket       | Conteudo                     | Limite     | Acesso            |
|-------------|------------------------------|------------|-------------------|
| `receipts`  | Comprovantes de despesas      | 5MB/arquivo| Privado (grupo)   |
| `documents` | Documentos compartilhados     | 10MB/arquivo| Privado (grupo)  |
| `chat`      | Imagens enviadas no chat      | 5MB/arquivo| Privado (grupo)   |

### Padrao de Upload

```
1. Client seleciona arquivo
2. Valida MIME type + tamanho (client-side)
3. Server Action recebe File via FormData
4. Re-valida MIME + tamanho (server-side)
5. Upload via Supabase Admin Client (service role key)
   Path: {groupId}/{timestamp}-{tipo}.{ext}
6. Gera URL publica ou signed URL
7. Salva URL no registro do banco
```

### MIME Types Permitidos
- Imagens: `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/gif`, `image/webp`
- Documentos: `application/pdf`

---

## 6. Cron Jobs

### Implementados em `/api/cron/`

| Job                    | Frequencia     | Funcao                                  |
|------------------------|----------------|-----------------------------------------|
| Health reminders       | Diario         | Lembrete de medicamentos/consultas       |
| Swap deadline          | Diario         | Alerta de trocas nao respondidas         |
| Decision deadline      | Diario         | Alerta de decisoes com prazo proximo     |

### Execucao
- Disparados via Vercel Cron (vercel.json)
- Autenticados via `CRON_SECRET` header
- Cada job executa queries diretas no Supabase com service role

---

## 7. Multi-Grupo (Multi-Tenant)

### Modelo de Isolamento

```
Usuario A
  |
  +--> Grupo "Familia Silva" (admin)
  |      +--> Crianca: Lucas
  |      +--> Membros: A, B
  |
  +--> Grupo "Familia Santos" (member)
         +--> Crianca: Maria
         +--> Membros: A, C
```

### Como Funciona
- `getActiveGroup(supabase, userId)` busca todas as memberships
- Se usuario tem 1 grupo: retorna automaticamente
- Se usuario tem 2+ grupos: mostra `<GroupSelector>` na sidebar
- Grupo ativo e armazenado em cookie `active-group-id`
- Toda query filtra por `group_id` via RLS

### Isolamento de Dados
- **RLS**: `is_group_member(group_id)` em todas as policies
- **Server Actions**: `verifyGroupMembership()` antes de qualquer mutacao
- **Impossivel** um usuario acessar dados de um grupo do qual nao e membro

---

## 8. Mapa de Dependencias

```
src/
├── actions/           # Server Actions (mutacoes)
│   ├── auth.ts        # Login, logout, signup
│   ├── calendar.ts    # Custody events, swaps
│   ├── expenses.ts    # Despesas, liquidacoes
│   ├── health.ts      # Doencas, medicamentos, vacinas
│   ├── decisions.ts   # Decisoes compartilhadas
│   ├── invitation.ts  # Convites de grupo
│   └── ...
│
├── app/(app)/         # Paginas autenticadas
│   ├── layout.tsx     # Shell: auth + Sidebar/BottomNav
│   ├── dashboard/     # Dashboard (Server + Client)
│   ├── calendario/    # Calendario de guarda
│   ├── chat/          # Chat com Realtime
│   ├── saude/         # Modulo de saude (7+ sub-paginas)
│   ├── despesas/      # Gestao de despesas
│   ├── financeiro/    # Painel financeiro
│   ├── decisoes/      # Decisoes compartilhadas
│   └── ...
│
├── components/        # Componentes reutilizaveis
│   ├── BottomNav.tsx  # Navegacao mobile
│   ├── Sidebar.tsx    # Navegacao desktop
│   ├── ResponsiveShell.tsx  # Wrapper responsive
│   └── ...
│
├── lib/               # Utilitarios e clients
│   ├── supabase/      # Client server + browser + middleware
│   ├── calendar-utils.ts    # Logica de calendario
│   ├── constants.ts         # Constantes globais
│   ├── group-utils.ts       # Multi-grupo
│   ├── push.ts              # Push notifications
│   └── ...
│
├── i18n/              # Internacionalizacao
│   ├── provider.tsx   # I18nProvider + useI18n hook
│   ├── index.ts       # getDictionary, translate
│   └── locales/       # pt.json, en.json, es.json, fr.json, de.json
│
└── middleware.ts       # Auth session refresh
```

---

*Esta documentacao deve ser atualizada quando houver mudancas significativas na arquitetura.*
