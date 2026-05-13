
## Regra de Desenvolvimento

**Após QUALQUER mudança no código, SEMPRE atualizar as documentações:**
- `README.md` — se features ou arquitetura mudaram
- `DOCUMENTACAO.md` — se tabelas, actions ou módulos mudaram  
- `MANUAL_DEV.md` — se padrões, convenções ou stack mudaram
- `docs/` — se algum documento específico foi afetado
- Arquivos de tradução (`src/i18n/locales/*.json`) — todas as novas strings em 5 idiomas

## Regra crítica: paridade PWA ↔ Nativo ↔ WhatsApp

**Padrão preferido**: extrair regra de negócio para `src/lib/services/<dominio>.ts` (função pura que recebe `SupabaseClient` + payload + retorna `ServiceResult`). Os três callers viram wrappers finos:
- `src/actions/*.ts` (PWA — server actions com FormData)
- `src/app/api/*/route.ts` (Native — endpoints REST com Bearer auth)
- `src/lib/ai/tools.ts` (Assistente in-app + WhatsApp)

Cada caller só faz: auth + parsing + adaptação do retorno (NextResponse vs redirect vs ToolResult). Lógica de negócio e side-effects (push, chat, notify) ficam **somente** no service.

Pares já consolidados via service:
- `services/swap.ts` ← `actions/calendar.ts:{createSwapRequest,respondToSwapRequest}` + `api/swaps/route.ts:{POST,PATCH}` + tools `create_swap_request`/`respond_swap_request`/`get_pending_approvals`
- `services/expenses.ts` ← `actions/expenses.ts:{createExpense,updateExpenseStatus,deleteExpense}` + tool `create_expense`. Native (`kindar-native/src/services/expenses.ts`) ainda escreve direto via `safeWrite` para suporte offline — divergência conhecida que requer refactor offline-first separado para fechar.
- `services/notes.ts` ← `actions/notes.ts:{createNote,updateNote,deleteNote}` + tool `create_note`.
- `services/checkin.ts` ← `actions/checkin.ts:createCheckin` + tool `create_checkin` (broadcast no chat para o coparente).
- `services/decisions.ts` ← `actions/decisions.ts:{createDecision,castVote,addArgument}` + tool `create_decision` (resolução automática quando todos votam).

Pares ainda em paridade direta (a migrar para services):
- `actions/subscription-split.ts:enableSubscriptionSplit` ↔ `api/subscription/split/route.ts:POST`
- `actions/subscription-split.ts:disableSubscriptionSplit` ↔ `api/subscription/split/route.ts:DELETE`

Quando descobrir um par novo, adicione aqui. Quando extrair um service, mova-o da seção "em paridade direta" para "consolidados".

Bugs anteriores causados por esquecer essa regra:
- `2026-05-01` swap proposed_date direction: corrigido no PWA mas não no native, depois descoberto e corrigido no commit 6b273c0. Solução estrutural: a partir de hoje a lógica vive em `services/swap.ts` única.
- `2026-05-07` calendar_occurrences não geradas no native: PWA `actions/activities.ts` chamava `generateOccurrences`, native `services/activities.ts` não. Hailla criou Jiu-Jitsu 4× e nada apareceu no calendário. **Solução estrutural definitiva (migration `00074`): trigger AFTER INSERT/UPDATE em `child_activities` chama `generate_activity_occurrences()` PL/pgSQL. Banco é a fonte de verdade — independe do client. Lib JS no PWA + native continua existindo como defesa em profundidade (UI otimista + ambiente sem migration), mas idempotente via `ON CONFLICT DO NOTHING`.**

## Padrão "responsabilidade do banco" pra side-effects derivados

Quando uma tabela B é **derivada** de uma tabela A (ex: `calendar_occurrences` ← `child_activities`), prefira gerar B via trigger no banco em vez de exigir que cada client lembre de chamar a lib JS. Triggers garantem cobertura 100% — PWA, native, AI, importação, edge function, SQL direto, qualquer caller futuro. Lib JS continua valendo como defesa em profundidade (UI otimista) mas a fonte de verdade é o banco.

## Foundation: Collaborative Records (awareness + read receipts + priority)

A migration `00077_collab_foundation.sql` introduz infraestrutura compartilhada para **records colaborativos** — qualquer tipo de registro onde múltiplos coparentes precisam de awareness, read receipts e prioridade. Primeiro consumidor: `school_logs` (Fase 1). Próximos: Saúde, Decisões, Financeiro, Calendário, Ocorrências.

**Princípio**: o valor do Kindar não está em armazenar dados — está em garantir que os responsáveis compartilhem contexto no momento certo. Cada módulo colaborativo herda esse comportamento via foundation, sem reimplementar.

### Tabela única `collab_reads`

```sql
collab_reads (record_type TEXT, record_id UUID, user_id UUID, read_at TIMESTAMPTZ)
PRIMARY KEY (record_type, record_id, user_id)
```

Uma linha por (record, user) quando o user explicitamente abre o detalhe do record. Polimórfica por convenção, não por FK — cada adoção adiciona um WHEN branch em `collab_record_group(record_type, record_id)` pra RLS resolver o group.

### Enum `collab_priority`

`('info', 'important', 'urgent')`. Cada tabela colaborativa opta-in com `ADD COLUMN priority collab_priority NOT NULL DEFAULT 'info'`. Urgente envia push priority="high" (FCM/APNs) mas sem time-sensitive entitlement por enquanto (Fase 2).

### Server helper: `src/lib/services/collab.ts`

- `notifyCollabCreate({recordType, recordId, groupId, actorUserId, priority, title, message, link})` — fan-out de push pros outros membros (role admin/member), com **coalescing**: pushes do mesmo (recipient, type, actor) em até 60s usam tag estável e mensagem agregada ("Amanda adicionou 3 registros escolares"). In-app notification row é criada sempre (inbox não coalesce).
- `unreadCollabCount({userId, groupId, recordType})` — count de records sem `collab_reads` row pro user. Drives dashboard badges.

### Client helpers

PWA: chama RPC `mark_collab_read(record_type, record_id)` via Supabase client. Server action `markSchoolLogRead(logId)` em `actions/school.ts` é o wrapper.
Native: `markSchoolLogRead` em `kindar-native/app/_src/services/school.ts` chama o mesmo RPC.

### Regras de UX firmadas em Fase 1

1. **Read receipt sempre ON** — Kindar vende transparência entre coparentes; não tem opt-out por user. Opção por-grupo é Fase 2 caso vire arma de conflito.
2. **`urgent` usa push normal por enquanto** — time-sensitive entitlement Apple requer capability change + rebuild EAS. Visual emphasis sim, channel diferente não.
3. **Edit não dispara push** — só `create`. Evita spam. Escalation re-notify (info → urgent) é Fase 2.
4. **Criador auto-marcado como lido** — trigger `school_logs_auto_mark_creator_read` insere row em `collab_reads`. Padrão a replicar pra novos módulos.
5. **Marcar lido APENAS no detalhe** — nunca em scroll/list-mount/preload. O valor emocional do "Visto por Amanda · 14:32" depende dessa disciplina.
6. **Anti-spam de notificação** — coalescing 60s via tag estável. Push individual + push agregado substituindo o anterior no device (FCM `tag`, APNs `thread-id`, web-push `tag`).

### Adoção por novo módulo (~20 linhas)

1. **Migration**: `ALTER TABLE <module> ADD COLUMN priority collab_priority NOT NULL DEFAULT 'info';` + `WHEN '<record_type>'` em `collab_record_group()` + trigger `<module>_auto_mark_creator_read` (cópia do school).
2. **Service**: chamar `notifyCollabCreate` no fim do create do service.
3. **UI**: `useUnread` no dashboard + badge "Novo" + chip de priority + `mark_collab_read` no tap-to-expand. PWA + native idênticos.
4. **i18n**: namespace `collab` já tem todas as strings compartilhadas (priority labels, "Novo", "Visto"). Acrescente só o que for específico do módulo.
5. **Analytics**: eventos `notification_sent`, `notification_opened`, `<module>_read`, `unread_count`, `urgent_created` já existem — basta passar `record_type: '<module>'`.

### Eventos PostHog (Fase 1)

- `notification_sent` (server, recipient distinctId) — props: `record_type`, `actor_user_id`, `priority`, `coalesced`, `coalesced_count`
- `notification_opened` (client, ao abrir via deep link com `?highlight=`) — props: `record_type`, `record_id`
- `school_log_read` / `expense_read` (server, ao markRead action) — props: `log_id` ou `expense_id`
- `unread_count` (client, ao montar dashboard) — props: `record_type`, `count`
- `urgent_created` (server, quando priority='urgent' no create) — props: `record_type`

### Adoções consolidadas
- `school_log` (migration 00077) — Escola: badges, visto-por, priority chips, push coalescing.
- `expense` (migration 00078) — Despesas: TUDO acima + extensão Fase 1B (Edit/Cancel/Reopen) + audit trail (vide próxima seção).

## Fase 1B: Edit / Cancel / Reopen + Audit Trail (Despesas pioneer)

Despesas estendeu a Foundation com 4 endpoints novos + tabela de audit. Padrão a replicar quando outros módulos precisarem de "corrigir depois de criar":

### Novos endpoints (service `src/lib/services/expenses.ts`)

- **`editExpense({ expenseId, actorId, patch })`**
  - SÓ o criador (`paid_by`) pode editar — server enforce (403 senão).
  - `pending`/`rejected`: edita livre, status mantém ou volta a pending.
  - `approved`: **edit REVERTE pra pending** (qualquer mudança em valor/data/descrição invalida aprovação — senão vira arma de "depois que aprovou, mudo o valor"). Re-notifica coparentes via `notifyCollabCreate`.
  - `cancelled`/`cancel_pending`: bloqueado.
  - Sempre grava audit `'edited'` com snapshot `before`/`after`.

- **`requestCancelExpense({ expenseId, actorId, reason })`**
  - Motivo obrigatório (transparência).
  - `pending`/`rejected`: cancela direto, status='cancelled'.
  - `approved`: status='cancel_pending', notifica reviewer original com priority='important'. Aguarda concordância via `respondToCancelRequest`.
  - Audit `'cancelled'` ou `'cancel_requested'`.

- **`respondToCancelRequest({ expenseId, reviewerId, approved, reason? })`**
  - Reviewer ≠ criador (server enforce).
  - `approved=true`: status='cancelled' (cancelled_by = reviewer).
  - `approved=false`: status volta pra 'approved', limpa cancel_requested_*. Audit `'restored'`.

- **`reopenApproval({ expenseId, actorId, reason })`**
  - SÓ o approver original. Server enforce.
  - Janela rígida 24h após `approved_at` (constante `REOPEN_WINDOW_MS`).
  - Motivo obrigatório.
  - Status volta pra 'pending'. Notifica criador com priority='important'. Audit `'reopened'`.

### Tabela de audit `expense_history`

Padrão a replicar pra outros módulos colaborativos. Schema (vide migration 00078):

```sql
expense_history (id, expense_id, actor_id, action TEXT, before JSONB, after JSONB, reason TEXT, at TIMESTAMPTZ)
```

- **Imutável**: RLS sem UPDATE/DELETE policies.
- **Read = group members** (transparência total entre coparentes).
- **Insert = actor self** (`actor_id = auth.uid()`).
- **Helper**: `src/lib/services/expense-history.ts:logExpenseHistory(...)` — fire-and-forget, nunca bloqueia ação principal.

Para Saúde/Decisões/Financeiro adotarem audit: criar `<module>_history` com mesmo shape + helper paralelo. Pattern uniforme.

### Eventos novos (despesas)
- `expense_edited` (server, no editExpense) — props: `expense_id`, `status_was`, `reverted_to_pending`
- `expense_cancelled` (server, cancel direct) — props: `expense_id`, `from_status`
- `expense_cancel_requested` (server, approved → cancel_pending) — props: `expense_id`
- `expense_cancel_approved` / `expense_cancel_rejected` (server, no respondToCancelRequest)
- `expense_reopened` (server, no reopenApproval) — props: `expense_id`
