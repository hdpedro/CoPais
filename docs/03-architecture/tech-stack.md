# Tech Stack - Kindar

> Cada tecnologia escolhida com justificativa. Nada e por acaso.
> Versao: 1.3 | Atualizado: 14/05/2026
>
> **Adicoes pos-versao 1.0 (Abril-Maio/2026):**
> - **Mobile principal:** Expo SDK 54 (React Native 0.76 New Architecture) em `kindar-native/` — Capacitor entrou em modo legado/deprecado
> - **Billing:** Stripe + Apple StoreKit IAP + Google Play Billing + RevenueCat (unifica mobile)
> - **PostHog cross-platform** com super-property `platform` (web/ios/android/server) — `posthog-react-native` no native, `posthog-node` no server
> - **Foundation Collab:** padrao polimorfico (`collab_reads`) compartilhado, push coalescing 60s via tag estavel (FCM `tag`, APNs `thread-id`, web-push `tag`)
> - **Vision AI estendida:** Vaccine Card Parser e Prescription Parser (alem do Invite Parser)
> - **Native version atual:** v1.0.5

---

## 1. Stack Principal

### Framework: Next.js 16.1.7

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Versao**       | 16.1.7 (App Router)                                              |
| **Por que**      | Server Components para SSR nativo, Server Actions para mutacoes sem API REST, streaming com Suspense, deploy zero-config na Vercel |
| **Uso no Kindar**| Todas as paginas sao Server Components que fazem fetch de dados. Client Components apenas para interatividade (i18n, formularios, estado local) |
| **Alternativas descartadas** | Remix (menos maduro em 2025), SvelteKit (ecossistema menor), Astro (nao ideal para SPAs interativos) |

### Runtime: React 19.2.3

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Versao**       | 19.2.3                                                           |
| **Por que**      | Server Components nativos, `use()` hook, melhor hydration, concurrent features |
| **Uso no Kindar**| Server Components para data fetching, Client Components com hooks (useState, useCallback, useEffect, useMemo) |

### Backend: Supabase

| Servico            | Uso no Kindar                                                  |
|--------------------|----------------------------------------------------------------|
| **PostgreSQL**     | Banco principal. 22+ tabelas com RLS. Enums, UUIDs, JSONB, arrays |
| **Auth**           | Email/senha + Google OAuth. JWT tokens. Session refresh via middleware |
| **Realtime**       | WebSocket para chat. Subscribe por `group_id` em `chat_messages` |
| **Storage**        | 3 buckets: receipts, documents, chat. Upload via service role key |
| **RLS**            | Row Level Security em TODAS as tabelas. `is_group_member()` helper |
| **Versao SDK**     | `@supabase/supabase-js` 2.99.2, `@supabase/ssr` 0.9.0         |

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Por que**      | Backend completo (DB + Auth + Realtime + Storage) em um servico. RLS elimina necessidade de middleware de autorizacao custom. Free tier generoso para MVP |
| **Alternativas descartadas** | Firebase (vendor lock-in, NoSQL nao ideal), PlanetScale (sem auth/storage integrado), Neon + Clerk (mais complexo de integrar) |

### Estilizacao: Tailwind CSS 4

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Versao**       | 4.x (com @tailwindcss/postcss)                                  |
| **Por que**      | Utility-first permite prototipacao rapida. Sem CSS custom exceto globals minimos. Bundle final otimizado (purge) |
| **Uso no Kindar**| 100% das estilos via classes Tailwind. Cores hardcoded em hex (ex: `text-[#1A3B3A]`). Responsive via `md:` breakpoint |
| **Alternativas descartadas** | styled-components (runtime CSS-in-JS, pior performance), CSS Modules (mais verbose), Panda CSS (ecossistema menor) |

### Linguagem: TypeScript 5

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Versao**       | 5.x                                                             |
| **Por que**      | Tipagem forte previne bugs em runtime. Props interfaces garantem contrato server/client. Autocompletion acelera desenvolvimento |
| **Strictness**   | `strict: true` no tsconfig                                      |

---

## 2. Infraestrutura

### Deploy: Vercel

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Por que**      | Deploy automatico a cada push. Preview deploys por PR. Edge Network global. Integracao nativa com Next.js (mesmo time). Serverless functions sem config |
| **Features usadas** | SSR, Cron Jobs (vercel.json), Environment Variables, Preview Deploys, Analytics (via PostHog) |
| **Alternativas descartadas** | AWS Amplify (mais complexo), Cloudflare Pages (menos integracao com Next.js), Railway (sem edge network) |

### Analytics: PostHog

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Pacotes**      | `posthog-js` 1.363.1 (client), `posthog-node` 5.28.5 (server)  |
| **Por que**      | Open-source, self-hostable, event tracking + feature flags. LGPD-friendly com opcao de EU cloud |
| **Uso no Kindar**| `captureServerEvent()` em Server Actions para tracking de acoes (event_created, expense_created, etc). Client via `PostHogProvider` |

### Error Tracking: Sentry

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Pacote**       | `@sentry/nextjs` 10.45.0                                         |
| **Por que**      | Captura erros de runtime no servidor e cliente. Source maps para debugging. Alertas automaticos |
| **Uso no Kindar**| Integrado via plugin Next.js. Captura exceptions nao tratadas automaticamente |

### Push Notifications: Web Push

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Pacote**       | `web-push` 3.6.7                                                 |
| **Por que**      | Web Push nativo, sem dependencia de servico terceiro. Funciona em PWA |
| **Uso no Kindar**| `PushNotificationManager` registra subscription. `createNotificationWithPush()` envia via VAPID keys. Subscriptions armazenadas no Supabase |

### PDF Generation

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Pacote**       | `pdf-lib` 1.17.1                                                 |
| **Por que**      | Leve, zero dependencias nativas, funciona em serverless          |
| **Uso no Kindar**| Exportacao de relatorios de saude (/saude/export)                |

---

## 3. Internacionalizacao (i18n)

### Sistema Custom

| Aspecto          | Detalhe                                                          |
|------------------|------------------------------------------------------------------|
| **Por que custom**| Libs i18n para Next.js (next-intl, next-i18next) adicionam complexidade de routing e middleware. Nosso sistema e ~100 linhas e faz tudo que precisamos |
| **Arquitetura**  | `I18nProvider` (Context) + `useI18n()` hook + JSON locales       |
| **Locales**      | `pt.json`, `en.json`, `es.json`, `fr.json`, `de.json`           |
| **Deteccao**     | 1. localStorage, 2. `navigator.language`, 3. fallback para `pt` |
| **Interpolacao** | Suporte a variaveis: `t("greeting", { name: "Carlos" })`        |
| **Fallback**     | Se chave nao existe no idioma: tenta `pt`. Se nao existe em `pt`: retorna a chave |

---

## 4. Banco de Dados

### Schema (22+ tabelas)

```
profiles              # Extensao de auth.users
coparenting_groups    # Grupos familiares
group_members         # Membros dos grupos (com roles)
children              # Criancas do grupo
custody_events        # Eventos de guarda (calendario)
swap_requests         # Pedidos de troca
expenses              # Despesas compartilhadas
settlements           # Liquidacoes financeiras
chat_messages         # Mensagens do chat
chat_channels         # Canais do chat (geral, crianca, financeiro)
daily_checkins        # Check-ins diarios
illness_episodes      # Episodios de doenca
active_medications    # Medicamentos ativos
child_allergies       # Alergias
vaccinations          # Vacinas aplicadas
medical_appointments  # Consultas medicas
medical_professionals # Profissionais de saude
growth_records        # Registros de crescimento
health_views          # Rastreamento de visualizacoes de saude
child_activities      # Atividades recorrentes
activity_checklist_items  # Itens de checklist por atividade
documents             # Documentos compartilhados
events                # Eventos sociais
notifications         # Notificacoes internas
push_subscriptions    # Subscriptions de push
invitations           # Convites de grupo
private_notes         # Notas privadas por responsavel
decisions             # Decisoes compartilhadas
decision_votes        # Votos em decisoes
agreements            # Acordos formais
```

### Migrations
22 arquivos de migration em `supabase/migrations/`, aplicados sequencialmente:
- `00001_initial_schema.sql` - Schema base (profiles, groups, children, calendar, expenses, chat)
- `00002_rls_policies.sql` - Todas as RLS policies + helpers
- `00005_health_module.sql` - Modulo de saude completo
- `00009_financial_module_v2.sql` - Modulo financeiro v2 (settlements, split ratios)
- `00019_private_notes.sql` - Notas privadas
- `00020_decisions.sql` - Decisoes compartilhadas
- `00021_chat_channels.sql` - Canais de chat
- `00022_child_profile_tabs.sql` - Perfil de crianca com abas

---

## 5. Consideracoes Futuras

### Curto Prazo (proximos 3 meses)
| Tecnologia           | Motivo                                              |
|----------------------|-----------------------------------------------------|
| Redis (Upstash)      | Cache de sessao e dados frequentes (dashboard)       |
| BullMQ               | Fila para push notifications (evitar timeout)        |
| Next.js Image        | Otimizacao de imagens com Supabase Storage            |

### Medio Prazo (6-12 meses)
| Tecnologia           | Motivo                                              |
|----------------------|-----------------------------------------------------|
| API separada (Hono)  | Se Server Actions ficarem lentas com escala           |
| Drizzle ORM          | Type-safe queries, migracao mais controlada           |
| Resend               | Email transacional (convites, alertas)                |

### Longo Prazo (12+ meses)
| Tecnologia           | Motivo                                              |
|----------------------|-----------------------------------------------------|
| React Native         | App nativo se PWA nao for suficiente                  |
| Supabase Read Replicas| Se leitura se tornar gargalo                        |
| PostHog Feature Flags | A/B testing de features                             |

---

## 6. Versoes Fixadas (package.json)

| Pacote                 | Versao    | Tipo      |
|------------------------|-----------|-----------|
| next                   | 16.1.7    | dep       |
| react                  | 19.2.3    | dep       |
| react-dom              | 19.2.3    | dep       |
| @supabase/supabase-js  | ^2.99.2   | dep       |
| @supabase/ssr          | ^0.9.0    | dep       |
| @sentry/nextjs         | ^10.45.0  | dep       |
| posthog-js             | ^1.363.1  | dep       |
| posthog-node           | ^5.28.5   | dep       |
| web-push               | ^3.6.7    | dep       |
| pdf-lib                | ^1.17.1   | dep       |
| postgres               | ^3.4.8    | dep       |
| tailwindcss            | ^4        | devDep    |
| typescript             | ^5        | devDep    |

---

*Stack deve ser reavaliada trimestralmente com base em metricas de performance e feedback do time.*
