
## Regra de Desenvolvimento

**Após QUALQUER mudança no código, SEMPRE atualizar as documentações:**
- `README.md` — se features ou arquitetura mudaram
- `DOCUMENTACAO.md` — se tabelas, actions ou módulos mudaram  
- `MANUAL_DEV.md` — se padrões, convenções ou stack mudaram
- `docs/` — se algum documento específico foi afetado
- Arquivos de tradução (`src/i18n/locales/*.json`) — todas as novas strings em 5 idiomas

## Regra crítica: paridade PWA ↔ Nativo

**Sempre que mudar lógica server-side, corrigir EM AMBOS:**
- `src/actions/*.ts` (PWA — server actions com FormData usadas no web)
- `src/app/api/*/route.ts` (Native — endpoints REST com Bearer auth usados pelo iOS/Android)

Os dois têm a mesma lógica de negócio mas vivem em arquivos separados. Se mudar
em um só, o outro fica divergente e o bug aparece só no fluxo que não foi tocado.

Pares conhecidos:
- `actions/calendar.ts:respondToSwapRequest` ↔ `api/swaps/route.ts:PATCH`
- `actions/calendar.ts:requestSwap` ↔ `api/swaps/route.ts:POST`
- `actions/subscription-split.ts:enableSubscriptionSplit` ↔ `api/subscription/split/route.ts:POST`
- `actions/subscription-split.ts:disableSubscriptionSplit` ↔ `api/subscription/split/route.ts:DELETE`

Quando descobrir um par novo, adicione aqui.

Bugs anteriores causados por esquecer essa regra:
- `2026-05-01` swap proposed_date direction: corrigido no PWA mas não no native, depois descoberto e corrigido no commit 6b273c0.
