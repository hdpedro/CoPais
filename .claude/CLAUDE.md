
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
