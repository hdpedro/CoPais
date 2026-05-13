# Onboarding wizard — arquitetura

Documento de referência pra qualquer dev mexendo no wizard de
`/onboarding`. Vale pra PWA (`src/app/(app)/onboarding/`) e nativo
(`kindar-native/app/onboarding/`) — os dois seguem o mesmo desenho.

## Estrutura de arquivos

```
onboarding/
├── OnboardingForm.tsx (PWA) / index.tsx (native)   ← orquestrador
├── _lib/                                           ← lógica pura
│   ├── types.ts          Tipos compartilhados (Step, Child, InviteRole...)
│   ├── format.ts         Helpers determinísticos (ageLabel, avatarEmoji...)
│   ├── errors.ts         Classificador de erros de fetch → mensagem i18n
│   ├── wizard-state.ts   Reducer + Action discriminated union
│   └── useReduceMotion.ts (só native) Hook AccessibilityInfo
└── _components/                                    ← UI memoizada
    ├── ProgressDots.tsx
    ├── FamilyStep.tsx
    ├── ChildForm.tsx     Unificado pra first/another/edit (prop `kind`)
    ├── FamilySummary.tsx Hero + lista + form de convite inline
    ├── ChildCard.tsx     ⚡ memoizado pesado (1 por criança)
    ├── InviteForm.tsx
    └── InviteSentCard.tsx
```

## Máquina de estados

Steps válidos:

```
[checking] → [family] → [first-child] → [family-summary] ⇄ [add-child]
                                                         ⇄ [edit-child]
```

- `checking` (só nativo): auto-aceita convites pendentes antes de mostrar
  o form. Timeout 3s — se a rede está ruim, cai pro form silenciosamente.
- `family`: 1 campo (nome do grupo).
- `first-child`: form da 1ª criança. Submit chama `POST /api/create-group`
  que cria grupo + membership + criança atomicamente (com rollback de
  compensação se a 2ª ou 3ª INSERT falhar).
- `family-summary`: **screen central**. Renderiza:
  - Hero animado (checkmark + sparkles)
  - Lista de cards (`ChildCard` com edit/remove)
  - CTA "adicionar outra criança" → `add-child`
  - Form de convite inline (`InviteForm`) ou estado "convite enviado"
    (`InviteSentCard`) — mesmo screen, sem trocar de rota.
  - CTA final ("Concluir" se já enviou convite, "Ir pro app · convido
    depois" se não).
- `add-child`: form pra Nx criança. Submit chama `POST /api/children`.
- `edit-child`: form preenchido com a criança alvo. Submit chama
  `PATCH /api/children/[id]`.

Todas as transições passam por `wizardReducer` em
[`_lib/wizard-state.ts`](../_lib/wizard-state.ts). Toda Action é
discriminada por `type` — TypeScript garante exaustividade no `switch`.

## Endpoints REST (dual-auth Bearer + cookie)

| Endpoint | Métodos | Quando |
|----------|---------|--------|
| `/api/create-group` | POST | 1ª criança + grupo (atomic com rollback) |
| `/api/children` | POST | Adicionar Nx criança |
| `/api/children/[childId]` | PATCH / DELETE | Editar / remover |
| `/api/invitations` | POST | Enviar convite inline |

Todos validam membership do grupo via `createAdminClient` (sem confiar só
em RLS porque o usuário precisa criar o próprio grupo antes de ter
membership).

## Padrões de performance

**Reducer + useMemo + useCallback**: o orquestrador é o único stateful;
sub-componentes são memoizados (`React.memo`). Handlers são memoizados
com `useCallback` pra preservar identidade — sem isso, o `memo` seria
inútil. Esse combo evita que **digitar no e-mail do convite** re-renderize
os cards de crianças (com 5 filhos era 5 renders inúteis por keystroke).

**AbortController** em `controllersRef` (Set): cada `fetch` registra seu
controller, dispose no `finally`. `useEffect` cleanup aborta tudo no
unmount — sem warning "setState on unmounted component" + sem memory leak.

**Optimistic delete**: `REMOVE_CHILD_OPTIMISTIC` remove da lista e guarda
snapshot. Em sucesso, `REMOVE_CHILD_CONFIRM` limpa o snapshot. Em falha,
`REMOVE_CHILD_REVERT` restaura na posição original + seta `summaryError`.

## Padrões de acessibilidade

- **Reducer pra focus management**: `summaryHeadingRef` é focado
  programaticamente quando entra em `family-summary` (PWA). No nativo,
  `AccessibilityInfo.announceForAccessibility` anuncia "{groupName}.
  Sua família tem N crianças" via TalkBack/VoiceOver.
- **aria-busy** em forms submetendo (PWA) + `accessibilityState.busy`
  (nativo).
- **aria-live="polite"** no contador de crianças (announce de mudanças).
- **role="alert"** nos containers de erro de form (anúncio imediato).
- **Skip link** "Pular pro convite" (PWA, `sr-only` até receber focus).
- **prefers-reduced-motion** (PWA via `@media`) e
  `AccessibilityInfo.isReduceMotionEnabled()` (nativo via
  `useReduceMotion`) neutralizam animações decorativas.

## Classificação de erros

`resolveFetchErrorMessage` em [`_lib/errors.ts`](../_lib/errors.ts)
mapeia:

- `AbortError` → `null` (não mostrar — cleanup intencional)
- `TypeError` de fetch → `errorNetwork`
- HTTP 401 → `common.sessionExpired`
- HTTP 403 → `errorPermission`
- HTTP 409 → `errorConflict`
- HTTP 5xx → `errorServer`
- HTTP 4xx genérico + serverMessage → mensagem do servidor
- Fallback → chave i18n do caller

Cada caller passa um `fallbackKey` específico
(`errorAddingChild`, `errorUpdatingChild`, etc.).

## Paridade PWA ↔ Native

Os dois `_lib/` são quase idênticos por design — o nativo tem coisas a
mais (parser de máscara DD/MM/AAAA, hook de reduce-motion, sintaxe
`{{var}}` no i18n vs `{var}` no PWA). Mudanças na lógica de transição
**precisam ser replicadas nos dois**. Se você divergir, o bug aparece em
uma plataforma e não na outra (vide histórico do projeto).

Como o native bundle não pode importar de `src/`, a duplicação é
estrutural. Testes do reducer PWA estão em
[`tests/unit/onboarding-wizard-state.test.ts`](../../../../../tests/unit/onboarding-wizard-state.test.ts)
— ao mexer no native, replique os mesmos casos no `kindar-native/tests/`
(quando essa estrutura existir).

## Testes

Suite em [`tests/unit/onboarding-*.test.ts`](../../../../../tests/unit/):

- `onboarding-wizard-state.test.ts` — 32 testes do reducer (navegação,
  CRUD, optimistic delete, invite, erros).
- `onboarding-format.test.ts` — 13 testes de `formatBR`, `avatarEmoji`,
  `ageLabel` (com clock fixo).
- `onboarding-errors.test.ts` — 9 testes do classificador de erro.

Cobre todas as transições críticas. Mexeu no reducer? Atualize os testes.
