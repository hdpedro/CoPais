# Performance - Kindar

> Otimizacoes implementadas, metricas alvo e estrategias de melhoria.
> Versao: 1.0 | Atualizado: Marco 2026

---

## 1. Otimizacoes Server-Side

### 1.1 SSR Completo (Server Components)

Todas as paginas do Kindar sao Server Components. O beneficio direto:
- HTML completo renderizado no servidor
- Zero JavaScript para data fetching no browser
- First Contentful Paint extremamente rapido
- SEO nativo (embora nao seja prioridade para app autenticado)

### 1.2 Parallel Data Fetching com Promise.all()

O padrao mais critico de performance no Kindar. O Dashboard executa 10+ queries em paralelo:

```
SEQUENCIAL (ruim - ~2000ms):
  query1 (200ms) --> query2 (200ms) --> ... --> query10 (200ms)
  Total: 200ms x 10 = 2000ms

PARALELO (implementado - ~250ms):
  Promise.all([
    query1,    --|
    query2,    --|
    query3,    --|--> Todas executam simultaneamente
    ...        --|
    query10    --|
  ])
  Total: max(200ms) = ~250ms (com overhead de rede)
```

**Implementacao em batches quando ha dependencias:**
```
// BATCH 1: profile + activeGroup (independentes)
const [profile, activeGroup] = await Promise.all([...]);

// BATCH 2: members + children (dependem de groupId)
const [members, children] = await Promise.all([...]);

// BATCH 3: TUDO em paralelo (dependem de groupId)
const [custodyEvents, expenses, swaps, medications, ...] = await Promise.all([...]);
```

### 1.3 Consolidacao de Queries

**Antes (5 queries separadas para custody_events):**
```sql
-- Query 1: eventos de hoje
SELECT * FROM custody_events WHERE start_date <= today AND end_date >= today;
-- Query 2: eventos futuros
SELECT * FROM custody_events WHERE start_date > today LIMIT 5;
-- Query 3: eventos da semana
SELECT * FROM custody_events WHERE start_date >= weekStart AND end_date <= weekEnd;
-- Query 4: eventos especiais proximos
SELECT * FROM custody_events WHERE custody_type != 'regular' AND start_date >= today;
-- Query 5: eventos para swap balance
SELECT * FROM custody_events WHERE start_date >= threeMonthsAgo;
```

**Depois (1 query, filtro em memoria):**
```sql
-- UMA query cobrindo 3 meses
SELECT * FROM custody_events
WHERE group_id = $1
  AND end_date >= threeMonthsAgo
  AND start_date <= threeMonthsAhead
ORDER BY start_date;
```

Filtros derivados em JavaScript:
```javascript
const todayEvents = all.filter(e => e.start_date <= today && e.end_date >= today);
const futureEvents = all.filter(e => e.start_date > today).slice(0, 5);
const weekEvents = all.filter(e => /* week range */);
```

**Impacto:** 5 round-trips ao banco reduzidos para 1. Latencia reduzida em ~80%.

### 1.4 Streaming com Suspense

```jsx
// layout.tsx - Shell renderiza imediatamente
<Suspense fallback={null}>
  <I18nProvider>
    <ResponsiveShell>
      {children}  {/* Pagina streama depois */}
    </ResponsiveShell>
  </I18nProvider>
</Suspense>
```

O shell (sidebar/bottom nav) aparece instantaneamente. O conteudo da pagina streama conforme as queries completam.

---

## 2. Otimizacoes Client-Side

### 2.1 Code Splitting Automatico

Next.js faz code splitting automatico por rota. Cada pagina carrega apenas o JS necessario:

| Rota           | JS Estimado (gzip) | Conteudo                    |
|----------------|--------------------|-----------------------------|
| /dashboard     | ~45 KB             | DashboardClient + deps       |
| /calendario    | ~35 KB             | CalendarGrid + modais        |
| /chat          | ~30 KB             | ChatRoom + Realtime client   |
| /saude         | ~25 KB             | SaudeClient + sub-pages      |
| /despesas      | ~20 KB             | Listagem + formulario        |

### 2.2 Prefetch Desabilitado

```jsx
<Link href="/calendario" prefetch={false}>
```

Todos os links de navegacao tem `prefetch={false}`. Motivo:
- App autenticado - usuario navega intencionalmente
- Economiza ~60% de bandwidth de pre-fetch
- Evita queries desnecessarias no servidor

### 2.3 useMemo e useCallback

Usados estrategicamente em componentes com re-renders frequentes:

| Componente     | Hook            | O que memoiza                        |
|----------------|-----------------|--------------------------------------|
| ChatRoom       | `useCallback`   | `handleSubmit`, `analyzeTone`        |
| CalendarGrid   | `useMemo`       | Calculos de datas, cores             |
| DashboardClient| `useMemo`       | Formatacao de listas de props        |

### 2.4 Lazy Loading (Nao Implementado - Recomendado)

| Componente               | Prioridade | Impacto Estimado              |
|--------------------------|------------|-------------------------------|
| ReceiptViewer            | Alta       | PDF/image viewer carrega sob demanda |
| GrowthChart              | Media      | Grafico de crescimento pesado |
| SwapRequestModal         | Media      | Modal so abre com interacao    |
| CompleteAppointmentForm  | Baixa      | Formulario complexo raro       |

---

## 3. Otimizacoes de Database

### 3.1 Indices

Indices em todas as colunas de FK e colunas usadas em WHERE/ORDER BY:

```sql
-- Indices criticos (implementados)
CREATE INDEX idx_custody_events_group ON custody_events(group_id);
CREATE INDEX idx_custody_events_dates ON custody_events(start_date, end_date);
CREATE INDEX idx_custody_events_child ON custody_events(child_id);
CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_chat_messages_group ON chat_messages(group_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_illness_episodes_status ON illness_episodes(group_id, status);
CREATE INDEX idx_medications_status ON active_medications(group_id, status);
```

Migration dedicada: `00017_health_indexes.sql`

### 3.2 RLS Policies Otimizadas

A funcao `is_group_member()` e `SECURITY DEFINER STABLE`:
- `SECURITY DEFINER`: executa com permissoes do owner (nao do caller)
- `STABLE`: resultado e consistente dentro da mesma transacao (permite cache de plano)

```sql
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 3.3 Query Patterns

| Padrao                     | Uso no Kindar                              |
|----------------------------|--------------------------------------------|
| SELECT com LIMIT           | Todas as listagens (max 5 no dashboard)    |
| Filter no servidor         | `.eq()`, `.gte()`, `.lte()` via Supabase   |
| Sort no servidor           | `.order()` via Supabase                    |
| Joins via FK               | `select("*, children(full_name)")`         |
| Contagem sem dados         | `select("id", { count: "exact" })`         |

---

## 4. Caching Strategy

### Situacao Atual: Sem Cache Server-Side

**Motivo:** Dados do Kindar sao altamente dinamicos. O calendario muda com trocas, despesas aparecem em tempo real, saude pode mudar a qualquer momento. ISR (Incremental Static Regeneration) nao e adequado.

### Invalidacao Atual: revalidatePath()

```typescript
// Apos criar despesa:
revalidatePath("/despesas");
revalidatePath("/financeiro");
revalidatePath("/dashboard");
```

Cada Server Action invalida as rotas afetadas via `revalidatePath()`.

### Cache Recomendado (Fase 2)

| Dado                     | Estrategia              | TTL      | Invalidacao                |
|--------------------------|-------------------------|----------|----------------------------|
| Dashboard completo       | Redis (Upstash)         | 30s      | Qualquer mutacao no grupo  |
| Lista de membros         | Redis                   | 5 min    | Mudanca de membros          |
| Calendario mensal        | Redis                   | 1 min    | Criacao/edicao de evento    |
| Perfil do usuario        | In-memory (request)     | Request  | -                           |
| Traducoes (locales)      | Client localStorage     | Infinito | Mudanca de idioma           |

---

## 5. Bundle Size

### Estrategia Atual
- Zero bibliotecas de UI (sem MUI, sem Chakra, sem shadcn)
- Zero bibliotecas de animacao (sem Framer Motion)
- Zero bibliotecas de state management (sem Zustand, sem Redux)
- Icones inline SVG (sem Lucide, sem Heroicons bundle)
- i18n custom (~100 linhas vs next-intl ~50KB)

### Impacto
| Decisao                    | Bundle Economizado (estimado) |
|----------------------------|-------------------------------|
| Sem UI library             | ~80-150 KB                     |
| Sem animacao library       | ~30-50 KB                      |
| Sem state management       | ~10-20 KB                      |
| SVG inline vs icon lib     | ~20-40 KB                      |
| i18n custom vs next-intl   | ~40-50 KB                      |
| **Total economizado**      | **~180-310 KB gzipped**        |

### Monitoramento
- `next build` mostra tamanho de cada rota
- Vercel build logs incluem bundle analysis
- Alerta se qualquer rota ultrapassar 100KB gzipped

---

## 6. Core Web Vitals

### Metas

| Metrica                     | Alvo     | Descricao                                    |
|-----------------------------|----------|-----------------------------------------------|
| LCP (Largest Contentful Paint) | < 2.5s | Tempo ate o maior elemento visivel renderizar |
| FID (First Input Delay)     | < 100ms  | Tempo ate o browser responder ao primeiro input |
| CLS (Cumulative Layout Shift)| < 0.1   | Estabilidade visual (sem pulos de layout)     |
| TTFB (Time to First Byte)   | < 800ms  | Tempo ate o primeiro byte da resposta          |
| INP (Interaction to Next Paint) | < 200ms | Responsividade a interacoes                |

### Como Atingimos

| Metrica | Tecnica                                                    |
|---------|------------------------------------------------------------|
| LCP     | SSR completo - HTML pronto no servidor, skeleton para dados |
| FID     | Minimal JS - sem bibliotecas pesadas, code split automatico |
| CLS     | Skeleton screens com dimensoes fixas, sem lazy load de imagens acima do fold |
| TTFB    | Vercel Edge Network - serverless function na regiao mais proxima |
| INP     | Event handlers leves, sem computacao pesada no main thread  |

---

## 7. Otimizacao de Imagens

### Status: PARCIALMENTE IMPLEMENTADO

**Atual:**
- Imagens de comprovantes/documentos servidas diretamente do Supabase Storage
- Sem otimizacao de tamanho ou formato
- Sem lazy loading explicito

**Recomendado:**
```jsx
// Usar Next.js Image com loader custom
import Image from "next/image";

const supabaseLoader = ({ src, width, quality }) => {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${src}?width=${width}&quality=${quality || 75}`;
};

<Image
  loader={supabaseLoader}
  src="receipts/group123/receipt.jpg"
  width={400}
  height={300}
  alt="Comprovante"
  loading="lazy"
/>
```

**Impacto estimado:**
- Reducao de ~60% no tamanho de imagens (WebP conversion)
- Lazy loading de imagens abaixo do fold
- Placeholder blur durante loading

---

## 8. Performance do Timezone

### Problema
O Brasil usa UTC-3 (BRT). Operacoes de data que usam `new Date()` no servidor Vercel podem estar em UTC, causando bugs de "dia errado" a noite (ex: sabado 21h BRT = domingo UTC).

### Solucao Implementada

```typescript
// calendar-utils.ts
export function getBrazilToday(): string {
  const now = new Date();
  const brazil = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return formatDateKey(brazil); // "YYYY-MM-DD"
}

export function getBrazilNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}
```

Todas as comparacoes de data no Dashboard usam `getBrazilToday()` em vez de `new Date()`.

---

## 9. Checklist de Performance para Novas Features

Antes de fazer merge de qualquer feature nova:

- [ ] Queries paralelas com `Promise.all()` quando possivel
- [ ] Indices SQL para novas colunas usadas em WHERE/ORDER
- [ ] `LIMIT` em todas as queries de listagem
- [ ] Dados serializados (sem Date objects, sem functions) nas props
- [ ] `prefetch={false}` em novos links de navegacao
- [ ] Skeleton screen para novos loading states
- [ ] Nenhuma biblioteca nova sem justificativa de bundle size
- [ ] `revalidatePath()` para invalidar rotas corretas apos mutacao
- [ ] Timezone-safe: usar `getBrazilToday()` para comparacoes de data

---

*Metricas de performance devem ser revisadas semanalmente no Vercel Analytics.*
