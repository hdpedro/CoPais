
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
