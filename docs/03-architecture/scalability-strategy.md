# Estrategia de Escalabilidade - Kindar

> Plano de escalabilidade progressiva. Cada fase adiciona complexidade apenas quando necessario.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Arquitetura Atual e Limites

### Limites do Supabase (Pro Plan)

| Recurso                  | Limite Free     | Limite Pro      | Uso Atual Estimado |
|--------------------------|-----------------|-----------------|---------------------|
| Database size            | 500 MB          | 8 GB            | ~50 MB              |
| Bandwidth                | 2 GB/mes        | 250 GB/mes      | ~5 GB/mes           |
| Storage                  | 1 GB            | 100 GB          | ~500 MB             |
| Realtime connections     | 200 simultaneas | 500 simultaneas | ~20 simultaneas     |
| Auth users               | 50,000          | Ilimitado       | ~200                |
| Edge functions           | 500K invocacoes | 2M invocacoes   | ~10K/mes            |
| File upload              | 50 MB/arquivo   | 5 GB/arquivo    | 5 MB max            |

### Limites da Vercel (Pro Plan)

| Recurso                  | Limite          | Uso Atual Estimado |
|--------------------------|-----------------|---------------------|
| Serverless function time | 60s             | ~2s media            |
| Bandwidth                | 1 TB/mes        | ~10 GB/mes           |
| Builds                   | 6000/mes        | ~200/mes             |
| Concurrent executions    | 1000            | ~10                  |

---

## 2. Fase 1: 0 - 10.000 Usuarios

### Status: ATUAL

### O Que Funciona Hoje
- Stack atual (Next.js + Supabase + Vercel) comporta ate 10K usuarios sem mudancas
- Dashboard faz 10+ queries em paralelo via `Promise.all()` - tempo total ~200ms
- RLS policies sao eficientes com indices nos FKs
- Realtime para chat funciona bem com ~200 conexoes simultaneas

### Otimizacoes Ja Aplicadas

| Otimizacao                              | Impacto                                     |
|-----------------------------------------|---------------------------------------------|
| `Promise.all()` para queries paralelas   | Dashboard: 10 queries em ~200ms vs ~2000ms  |
| Query consolidada de custody_events      | 1 query para 3 meses vs 5 queries separadas |
| Indices em todas as FKs                  | Queries de listagem < 50ms                   |
| `prefetch={false}` em navegacao          | Economia de ~60% bandwidth de navegacao       |
| Skeleton screens                         | Percecao de velocidade sem overhead           |

### Gargalos Potenciais
- Dashboard page.tsx e a pagina mais pesada (~600 linhas de data fetching)
- Sem cache server-side (ISR nao usado porque dados sao dinamicos)
- Push notifications sao enviadas sequencialmente (pode timeout com muitos membros)

---

## 3. Fase 2: 10.000 - 100.000 Usuarios

### Quando Migrar
Sinais de que e hora:
- Dashboard response time > 1s consistentemente
- Supabase bandwidth > 100 GB/mes
- Realtime connections > 300 simultaneas
- Push notification queue causando timeouts

### Mudancas Necessarias

#### 3.1 Redis Cache (Upstash)

```
Browser --> Vercel --> Redis Cache --> Supabase
                         |
                         +-- HIT: retorna cache (< 5ms)
                         +-- MISS: query Supabase, armazena, retorna
```

**O que cachear:**

| Dado                     | TTL          | Invalidacao                          |
|--------------------------|--------------|--------------------------------------|
| Dashboard props          | 30 segundos  | Ao criar/editar evento, despesa, etc |
| Lista de membros         | 5 minutos    | Ao adicionar/remover membro          |
| Lista de criancas        | 5 minutos    | Ao editar crianca                    |
| Calendario do mes        | 1 minuto     | Ao criar/aprovar troca               |
| Saldo financeiro         | 1 minuto     | Ao criar/aprovar despesa             |

**Implementacao:**
```typescript
// Exemplo de cache pattern
const cacheKey = `dashboard:${groupId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const data = await fetchDashboardData(groupId);
await redis.set(cacheKey, JSON.stringify(data), { ex: 30 });
return data;
```

#### 3.2 Fila de Push Notifications (BullMQ ou Upstash QStash)

```
Server Action
     |
     +--> Enfileira notificacao (< 1ms)
     |
     v
Queue Worker (background)
     |
     +--> Processa notificacao
     +--> web-push.sendNotification()
     +--> Retry se falhar (3x com backoff)
```

**Por que:** Atualmente push e sincrono na Server Action. Com 50+ membros em um grupo (avos, cuidadores), pode causar timeout.

#### 3.3 Otimizacao de Queries

| Query Atual                          | Otimizacao                              |
|--------------------------------------|-----------------------------------------|
| Dashboard: 10+ queries em Promise.all | Materializar em view ou function SQL     |
| Calendario: 3 meses de eventos       | Paginacao por mes, cache por mes         |
| Financeiro: recalculo a cada load     | Pre-calcular saldo em tabela auxiliar    |

#### 3.4 CDN para Imagens

```
Upload --> Supabase Storage --> Vercel Image Optimization --> Browser
                                        |
                                        +--> Resize automatico
                                        +--> WebP/AVIF conversion
                                        +--> Edge cache global
```

**Implementacao:** Usar `<Image>` do Next.js com loader custom para Supabase Storage.

---

## 4. Fase 3: 100.000 - 1.000.000 Usuarios

### Mudancas Estruturais

#### 4.1 API Layer Separada

```
Browser --> Vercel (Next.js) --> API (Hono/Fastify) --> Supabase
                                      |
                                      +--> Redis
                                      +--> Queue (BullMQ)
                                      +--> Rate Limiter
```

**Por que:** Server Actions tem overhead de SSR. API dedicada permite:
- Rate limiting granular
- Caching mais sofisticado
- Monitoring independente
- Escala horizontal independente do frontend

#### 4.2 Read Replicas

```
                    +--> Read Replica 1 (leituras)
                    |
Supabase Primary ---+--> Read Replica 2 (leituras)
(escritas)          |
                    +--> Read Replica 3 (analytics)
```

**Supabase Pro** ja suporta read replicas. Aplicar em:
- Todas as queries de listagem (SELECT)
- Dashboard data fetching
- Relatorios e exportacoes

#### 4.3 Connection Pooling

| Modo Atual           | Modo Otimizado                          |
|----------------------|-----------------------------------------|
| Conexao direta       | PgBouncer (transaction pooling)          |
| 1 conn por request   | Pool compartilhado (max 100 conns)       |
| Overhead de SSL      | Conexao persistente                      |

Supabase inclui PgBouncer. Usar URL de connection pooling em vez da URL direta.

#### 4.4 Queue System Completo

```
+------------------+     +------------------+     +------------------+
| Push Notifications|     | Email Alerts     |     | Analytics Events |
| (high priority)   |     | (normal)         |     | (low priority)   |
+--------+---------+     +--------+---------+     +--------+---------+
         |                         |                         |
         v                         v                         v
+----------------------------------------------------------+
|                    BullMQ / Redis                          |
|                    (3 filas separadas)                     |
+----------------------------------------------------------+
         |
         v
+------------------+
| Workers          |
| (1-3 processos)  |
+------------------+
```

---

## 5. Fase 4: 1.000.000+ Usuarios

### Consideracoes de Longo Prazo

#### 5.1 Multi-Regiao

```
Brasil (primario)     Europa           America do Norte
+---------------+    +---------------+  +---------------+
| Vercel Edge   |    | Vercel Edge   |  | Vercel Edge   |
| Supabase BR   |    | Supabase EU   |  | Supabase US   |
+---------------+    +---------------+  +---------------+
```

**Trigger:** Quando > 30% dos usuarios estiverem fora do Brasil.

#### 5.2 Microservicos (Se Necessario)

| Servico            | Responsabilidade                        |
|--------------------|-----------------------------------------|
| auth-service       | Autenticacao e autorizacao               |
| calendar-service   | Calendario e trocas                      |
| health-service     | Modulo de saude                          |
| financial-service  | Despesas e liquidacoes                   |
| notification-svc   | Push, email, SMS                         |
| chat-service       | Chat realtime                            |

**IMPORTANTE:** So migrar para microservicos se houver evidencia clara de que o monolito e um gargalo. Complexidade de microservicos e enorme e raramente necessaria antes de 1M+ usuarios.

#### 5.3 Database Sharding

Estrategia de sharding por `group_id`:
- Shard key: hash do `group_id`
- Dados de um grupo nunca precisam de cross-shard queries
- Cada shard e um PostgreSQL independente

**Provavelmente nunca necessario:** Grupos tem em media 2-5 membros. Mesmo com 1M usuarios, sao ~500K grupos. PostgreSQL moderno lida com isso em uma instancia.

---

## 6. Exit Strategy do Supabase

### Principio: Zero Vendor Lock-in

O Kindar foi projetado para ser portavel:

| Camada          | Supabase                | Alternativa Direta                |
|-----------------|-------------------------|-----------------------------------|
| Database        | PostgreSQL padrao       | Qualquer PostgreSQL (Neon, RDS)   |
| Auth            | Supabase Auth           | Clerk, Auth.js, Lucia             |
| Realtime        | Supabase Realtime       | Ably, Pusher, Socket.io           |
| Storage         | Supabase Storage        | S3, Cloudflare R2                 |
| RLS             | PostgreSQL nativo       | Middleware de autorizacao           |

### O Que Facilita a Migracao
- Queries usam SQL padrao (nao ORMs proprietarios)
- Migrations sao `.sql` puro
- Auth usa JWT padrao (qualquer provider pode emitir)
- Storage API e compativel com S3

### O Que Precisaria de Trabalho
- RLS policies precisariam virar middleware se sair do PostgreSQL
- Realtime subscriptions precisariam de adaptador
- `createClient()` precisaria ser substituido por outro DB client

---

## 7. Monitoramento de Escalabilidade

### Metricas a Acompanhar

| Metrica                    | Ferramenta   | Alerta em           |
|----------------------------|--------------|---------------------|
| Response time (p95)        | Vercel       | > 2 segundos        |
| Database query time (p95)  | Supabase     | > 500ms             |
| Realtime connections       | Supabase     | > 80% do limite     |
| Storage usage              | Supabase     | > 70% do limite     |
| Error rate                 | Sentry       | > 1% dos requests   |
| Bundle size                | Vercel       | > 300KB gzipped     |
| Core Web Vitals (LCP)      | PostHog      | > 2.5 segundos      |

### Dashboard de Monitoramento
- Supabase Dashboard: queries, conexoes, storage
- Vercel Analytics: response times, bandwidth, errors
- PostHog: user behavior, feature adoption
- Sentry: errors, performance transactions

---

*Esta estrategia deve ser revisada trimestralmente com base nas metricas de crescimento.*
