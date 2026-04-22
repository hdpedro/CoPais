# Plano de Replicação Native — Paridade 100% com PWA

**Objetivo**: app nativo iOS/Android com 100% das features do PWA + UX nativa premium.
**Data de início**: 2026-04-22
**Status**: em execução

---

## Escala real

- **PWA**: 68 telas, ~25.000 LOC TypeScript/React (src/app + components + lib)
- **Native atual**: 67 telas (paridade de rotas), **8144 LOC** RN/Expo
- **Delta estimado**: +15.000-20.000 LOC pra chegar em paridade funcional e visual 1:1
- **Esforço honesto**: 2-4 semanas em tempo contínuo de dev sênior focado

Esta é uma entrega incremental. Cada sprint abaixo é um lote de trabalho com critérios claros de pronto.

---

## Backlog priorizado

### 🚨 Sprint 0 — Fundação de auth (EM ANDAMENTO)
- [x] Login: Apple button apenas iOS, Google apenas Android
- [x] Guard defensivo em `signInWithGoogle()` refutando iOS
- [x] Divider "ou entre com email" só aparece se há social button acima
- [ ] `/auth/callback` deep link — validar fluxo Google em Android
- [ ] Teste e2e: login Apple em TestFlight, sessão persistida, re-login silencioso

### 📱 Sprint 1 — Telas existentes mas visualmente divergentes (13 telas)
Telas que têm arquivo no native mas divergem do PWA. Priorizadas por visibilidade:

| Tela | LOC native | LOC PWA | Delta | Prioridade |
|---|---|---|---|---|
| `(tabs)/index` (dashboard) | 332 | 1865 | -1533 | **P0** — é a home |
| `auth/login` | 293 | ~500 | -207 | P0 — primeira impressão |
| `calendario/index` | - | ~800 | - | P0 — mais usado |
| `saude/timeline` | 227 | ~400 | -173 | P1 |
| `despesas/index` | - | ~500 | - | P1 |
| `chat/[channelId]` | - | ~600 | - | P1 |
| `criancas/index` | - | ~300 | - | P2 |
| `decisoes/index` | - | ~400 | - | P2 |
| `notificacoes/index` | - | ~200 | - | P2 |
| `perfil/index` | - | ~300 | - | P2 |
| `saude/index` | - | ~200 | - | P2 |
| `familia/index` | - | ~250 | - | P2 |
| `acordos/index` | - | ~200 | - | P3 |

### 🆕 Sprint 2 — 14 telas AUSENTES no native (CRUD)
Novas rotas que precisam ser criadas do zero:

- [ ] `calendario/convite` — gerar link iCal público
- [ ] `calendario/escala` — configurar modelo de custódia (50/50, semanal)
- [ ] `criancas/nova` — formulário de cadastro de criança
- [ ] `criancas/[id]` — perfil detalhado da criança
- [ ] `saude/emergencia` — card de emergência público
- [ ] `saude/export` — export PDF histórico médico
- [ ] `saude/receita` — OCR de receita médica com IA
- [ ] `saude/sintomas` — diário de sintomas
- [ ] `saude/doencas` + `saude/doencas/nova` — episódios de doença
- [ ] `convite/enviar` — form standalone de envio
- [ ] `convite/[token]` — landing pós-clique em convite
- [ ] `onboarding/convite` — step 2 do onboarding com convite
- [ ] `atividades/nova` — formulário de nova atividade

### 🔁 Sprint 3 — 8 workflows de aprovação
Os fluxos multi-parte (ver RELATORIO-PWA.md §4) precisam UI dedicada:

- [ ] Convites (invitations)
- [ ] Event Requests (edit/cancel/reschedule/delete)
- [ ] Swap Requests (trocar dia de custódia)
- [ ] Custody Balance Operations (ajuste de saldo)
- [ ] Decisões + votos + argumentos
- [ ] Despesas (approve/reject)
- [ ] Sensitive Notes Deletion
- [ ] Agreements

Cada um precisa de:
- Tela de lista de pendências
- Tela de detalhe com diff (original vs proposto)
- Botões Aprovar/Rejeitar com haptic + chat notify
- Estado pending/approved/rejected bem marcado visualmente

### 📤 Sprint 4 — Push notifications (7 tipos)

- [ ] APNs (iOS) registro + navigation on tap
- [ ] FCM (Android) registro + navigation on tap
- [ ] Badge count por categoria (chat, approvals, health)
- [ ] Handle notification tap → deep link correto
- [ ] Cada tipo testado end-to-end:
  - [ ] `chat_message` → abre /chat/[channelId]
  - [ ] `swap_request` → abre /calendario
  - [ ] `swap_response` → abre /notificacoes
  - [ ] `expense_new` → abre /despesas
  - [ ] `expense_approved/rejected` → abre /financeiro
  - [ ] `custody_change` → abre /calendario (hoje)
  - [ ] `invitation` → abre /familia ou /convite/[token]

### 🎨 Sprint 5 — UX Premium
Elevar cada tela pra qualidade Apple/Linear/Nubank:

- [ ] Safe area insets consistentes
- [ ] Haptics em todas as ações (já parcialmente)
- [ ] Skeleton loading em toda tela async
- [ ] Pull-to-refresh em todas listas
- [ ] Empty states com ilustração + CTA
- [ ] Error states com retry
- [ ] Transições suaves (reanimated entry animations)
- [ ] Pull-down sheets pros formulários
- [ ] Dark mode (se PWA tiver)
- [ ] Tipografia consistente (já tem tokens)

### ⚡ Sprint 6 — Performance
- [ ] FlatList com getItemLayout pros calendarios/chat
- [ ] useMemo/useCallback em renders pesados
- [ ] Cache Supabase queries (react-query ou swr)
- [ ] Prefetch de rotas adjacentes
- [ ] Lazy load de imagens (expo-image + placeholder)
- [ ] Startup < 2s (mesureable via Sentry transactions)
- [ ] Navigation < 200ms
- [ ] Scroll 60fps em lista de 500 items

### 👥 Sprint 7 — Multiusuário (cenários)
- [ ] Cenário A: pai + mãe + 1 filho — basic flow
- [ ] Cenário B: 2 resp + 3 filhos — com swaps
- [ ] Cenário C: mesmo lar — edge case
- [ ] Cenário D: usuário solo — sem sync
- [ ] Cenário E: avó/cuidador — permissões custom
- [ ] Realtime Supabase: chat + notifications sincronizando
- [ ] Invalidação de cache cross-device
- [ ] Handling de conflito de escrita (swap pendente de A aprovado por B)

### ✅ Sprint 8 — Testes
- [ ] Playwright tests adaptados pra parity web ↔ native
- [ ] Detox ou Maestro pros flows nativos específicos
- [ ] Matrix: iPhone SE + iPhone 16 Pro + Pixel 7
- [ ] Offline scenarios (criar despesa offline, sync depois)
- [ ] Session expired handling
- [ ] First-launch flow

### 🚀 Sprint 9 — Ship
- [ ] TestFlight com 10+ beta testers
- [ ] Play Store internal track
- [ ] Monitor crashes via Sentry
- [ ] A/B test no onboarding (opcional)
- [ ] Release candidate 1.0.0

---

## Critério de pronto por sprint

Cada sprint só é considerado fechado quando:
1. Código implementado + lintado + typecheck OK
2. Teste manual no TestFlight funcionando
3. PR mergeado na main
4. Documentação atualizada em README.md, DOCUMENTACAO.md, MANUAL_DEV.md

---

## Tracking

**Commits por sprint**: prefixos convencionais (feat/fix/refactor)
**Progress**: atualizar este arquivo a cada sprint com ✅ e commit SHA

**Status atual (atualizado 2026-04-22 sessão 4):**

### Progresso consolidado
Native LOC foi de 8.144 → **16.012** (+7.868, quase 2× em uma sessão autônoma, 43 commits).

- ✅ Sprint 0: auth platform rule + plano
- ✅ Sprint 2: 14/14 telas novas criadas (criancas nova+[id], atividades/nova,
  saude sintomas/doencas/doencas-nova/emergencia/export/receita, convite
  enviar+[token], onboarding/convite, calendario escala/convite)
- 🔶 Sprint 1: Dashboard actionable cards ✓, Login platform-correct ✓, saude
  hub com 12 modulos. Remanente: streakDays, pendingReports, onboardingChecklist
- ✅ Sprint 3: 7/8 workflows end-to-end
  - ✓ Swap requests (calendario banner)
  - ✓ Decisoes (voto + argumentos + tally)
  - ✓ Invitations (share + accept via deep link)
  - ✓ Agreements (aceite + categorias + inegociavel)
  - ✓ Sensitive notes deletion (2-party approval)
  - ✓ Event requests (action types edit/cancel/reschedule/delete + inbox)
  - ✓ Despesas (approve/reject inline no despesas screen)
  - ⏳ Custody Balance Operations detalhado (swaps ja atualizam, falta UI standalone)
- ✅ Sprint 4: Push notifications — setupNotificationHandler + APNs/FCM
  register + deep link on tap + clearBadge. Inbox notificacoes integrado.
- 🔶 Sprint 5: UX premium parcial (haptics em ~todas as actions, skeleton em
  alguns spots, animations FadeInDown no dashboard/calendario). Sistematizar
  em todas as telas pendente.
- ⏳ Sprint 6-9: performance tuning, multi-user realtime sync, testes, release.

### Comprehensive summary
- **Services novos**: swaps.ts, health.ts, invitations.ts, schedule.ts,
  sensitive.ts, push-setup.ts (6 novos)
- **Services estendidos**: decisions.ts, agreements.ts, events.ts, notify.ts
- **Telas novas**: 14 (todas do Sprint 2)
- **Telas aprimoradas**: dashboard, calendar, login, decisoes (+[id]), acordos,
  despesas, familia, notificacoes, temas-sensiveis, saude (tab)
- **PWA API estendida**: `/api/native/notify` com 12 novas actions cobrindo
  todos os workflows (swap/decision/invitation/agreement/sensitive)

### O que falta pra 100%
1. Event Requests workflow (2/8)
2. Custody Balance Operations (4/8)
3. Dashboard: streakDays, pendingReports, onboarding checklist
4. Login: visual polish pra match do PWA
5. Calendar DayDetailSheet completo (tap no dia → modal rico)
6. Saude sub-screens polish (alergias, medicamentos, consultas, vacinas,
   crescimento, profissionais, receita detalhe)
7. Chat realtime com supabase subscriptions + send message inline
8. Performance: FlatList optimization + useMemo em renders pesados
9. Tests automatizados (Detox ou Maestro)
10. Release pipeline (TestFlight ja validado, Play Store precisa setup)

### Sprint 0 — Auth ✅ 3/5
- [x] Login platform rules (commit `de988ab`)
- [x] Guard defensivo Google iOS
- [x] Divider condicional
- [ ] `/auth/callback` deep link e2e teste no Android real
- [ ] Re-login silencioso validado via TestFlight

### Sprint 1 — Dashboard ✅ 60%
- [x] Actionable pending cards (swaps + decisions + expenses) (commit `b22e0bc`)
- [x] Critical child alert banner
- [x] Decision category taxonomy (icons + colors) pt-BR
- [x] Deadline urgency (expired / near / normal)
- [x] Hook extends: pendingSwapsList, pendingDecisionsList, pendingExpensesList,
      groupName, memberCount, hasAnyCriticalChild
- [ ] streakDays (consecutive custody days calc)
- [ ] pendingReports (activity reports awaiting completion)
- [ ] Onboarding checklist card pra usuários novos
- [ ] Visible sections user-toggleable preferences

### Sprint 3 — Workflows de aprovação ✅ 1/8
- [x] **Swap requests end-to-end** (commit `4c64c34`):
  - `src/services/swaps.ts` com loadMyPendingSwaps/respondToSwap/createSwap
  - Banner no calendar com Accept/Reject inline
  - PWA `/api/native/notify` estende com 3 ações swap (push + chat + analytics)
- [ ] Event Requests (edit/cancel/reschedule/delete)
- [ ] Custody Balance Operations
- [ ] Decisões + votos + argumentos (UI de detalhe com arguments)
- [ ] Despesas (approve/reject inline)
- [ ] Sensitive Notes Deletion
- [ ] Agreements
- [ ] Invitations (accept/decline inline)

### Próximo batch (ordem de execução)
1. **Saúde timeline detalhado** — 227→400 LOC, adicionar filtros + swipe actions
2. **Despesas approve inline** — estender despesas index com accept/reject (workflow 6 of 8)
3. **Decisoes + votos + argumentos** — workflow 5 of 8, inclui thread
4. **/criancas/nova** + **/criancas/[id]** — Sprint 2, telas ausentes
5. **/calendario/escala** — configurar modelo de custódia
6. **Login visual parity** — ajustar tipografia, cores e gradient match do PWA
