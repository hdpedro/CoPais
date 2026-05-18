
## Regras Canônicas (INEGOCIÁVEIS — leia antes de tocar qualquer texto)

**18 regras** sobre português impecável + i18n obrigatória pra TODO texto visível ao usuário (JSX, atributos, push, email, OG images, a11y labels, mensagens de erro). Doc oficial: [`docs/03-architecture/REGRAS_CANONICAS.md`](../docs/03-architecture/REGRAS_CANONICAS.md).

**Resumo do que NÃO pode passar em PR**:

1. String literal em JSX/TSX visível ao usuário (sempre via `t('chave')`)
2. Chave nova em pt-BR sem correspondência nos 5 locales
3. Português com acento faltando (`voce`, `nao`, `acoes`) — texto é PRODUÇÃO, não rascunho
4. Renomear chave existente (chaves são append-only — Regra 3)
5. Mensagem de erro com termo técnico vazado (`PostgreSQL error 23505` etc.)
6. `placeholder`, `alt`, `aria-label`, `accessibilityLabel/Hint` hardcoded
7. Plural via `if (count === 1)` em vez de ICU MessageFormat
8. Datas/números/moedas sem `Intl.*` respeitando locale
9. Naming de chave fora da convenção: `<scope>.<entity>.<property>` / `action.<verb>` / `status.<entity>.<state>` / `error.<domain>.<specific>` / `empty.<screen>` / `a11y.<context>.<role>`
10. Copy legal/médica/financeira/onboarding traduzida por LLM (essas DEVEM ser humano nativo)

**Linguagem inclusiva** (Regra 12): "coparente"/"responsável" > "marido/esposa/pais"; sem pressupor número de pais; pronome neutro em EN; informal em DE/ES/FR (du/tú/tu).

**Standards**: BCP 47 (`pt-BR`, não `pt_BR`), CLDR pra regras culturais, ISO 4217 pra moeda (`BRL`/`USD`/`EUR`).

**Para IA neste projeto**: ao criar chave nova, sempre entregue snippets JSON pros 5 locales. Sem certeza da tradução? marque `// TODO: review translation`, nunca invente.

## Regra de Desenvolvimento

**Após QUALQUER mudança no código, SEMPRE atualizar as documentações:**
- `README.md` — se features ou arquitetura mudaram
- `DOCUMENTACAO.md` — se tabelas, actions ou módulos mudaram  
- `MANUAL_DEV.md` — se padrões, convenções ou stack mudaram
- `docs/` — se algum documento específico foi afetado
- Arquivos de tradução (`src/i18n/locales/*.json`) — todas as novas strings em 5 idiomas (ver Regras Canônicas acima)

## Regra crítica: paridade PWA ↔ Nativo ↔ WhatsApp

**Padrão preferido**: extrair regra de negócio para `src/lib/services/<dominio>.ts` (função pura que recebe `SupabaseClient` + payload + retorna `ServiceResult`). Os três callers viram wrappers finos:
- `src/actions/*.ts` (PWA — server actions com FormData)
- `src/app/api/*/route.ts` (Native — endpoints REST com Bearer auth)
- `src/lib/ai/tools.ts` (Assistente in-app + WhatsApp)

Cada caller só faz: auth + parsing + adaptação do retorno (NextResponse vs redirect vs ToolResult). Lógica de negócio e side-effects (push, chat, notify) ficam **somente** no service.

### Adoção `vaccine` (Motor de Saúde Preventiva — migration 00082)

Vacinação é o primeiro pilar de uma futura Central de Saúde da Criança. **Não é puxadinho de Saúde** — integra na arquitetura de Saúde existente (Foundation Collab, calendar_occurrences, services, push) e estende.

Padrões consolidados nessa adoção (referência pra próximos módulos de saúde):

1. **"Banco como source of truth" para dados derivados** (mesmo de calendar_occurrences 00074):
   - `vaccine_catalog` (21 vacinas PNI 2026 + SBIm 2026 BR, com `source_url`+`source_version` por linha), `vaccine_schedule_rules` (42 regras com `valid_until_age_months` separado de `tolerance_months`), `vaccine_recommended_doses` (derivada por trigger).
   - Função `compute_vaccine_recommendations(child_id)` PL/pgSQL SECURITY DEFINER, idempotente (DELETE+INSERT). Re-disparada por triggers em `children` (birth_date/sex/calendar_preference) e `vaccination_records` (insert/update/delete) e `medical_appointments` (cancel reabre pendência).
   - **UNIQUE inclui `rule_id`** (não só vaccine_id+dose_number) pra permitir HPV PNI (network=public, 1 dose) + HPV SBIm (network=private, 2 doses) coexistirem quando user tem `vaccination_calendar_preference='both'`.

2. **`equivalence_group`** pra famílias intercambiáveis (`dtpa_family`: Penta+Hexa+DTPa+dTpa; `scr_family`: SCR+SCRV; `polio_family`: VIP+VOP). Registrar Hexa dose 1 conta como Penta dose 1 (motor cruza no match).

3. **Status estável `historical_gap`** — criança com <3 vaccination_records E idade >6m e overdue_days >180 marca doses antigas como gap (não como overdue). **Nunca dispara push** pra esse status. Quando criança ganha 3+ registros (pais usando o app), doses novas overdue viram overdue real.

4. **Status `out_of_window`** — passou de `valid_until_age_months`. UI mostra "Janela passou — converse com pediatra". Sem push.

5. **Service consolidado** `src/lib/services/vaccines.ts` — `getVaccineStatus`, `recordVaccination` (inferência dose_number via equivalence_group + detecção duplicata + cria `child_activity` kind=health pra aparecer no calendário compartilhado), `markRecommendedDoseTaken`, `dismissPendingDose`, `setVaccinationCalendarPreference`, `inferCatalogMatch`. Três callers finos: `src/actions/vaccines.ts` (PWA), `src/app/api/health/vaccines/route.ts` (native), `src/lib/ai/tools.ts` (`record_vaccination`, `get_vaccine_status`).

6. **Tom premium**: linguagem CALMA (statusLabel pré-formatado: "Em dia", "1 reforço pendente", "Complete o histórico"); coverage_pct vive em segunda camada (tap no hero); paleta verde aconchegante / âmbar suave / cinza neutro — **nunca vermelho**. Push: "ainda não está marcada" / "está na hora", nunca "atrasada/vencida/em risco".

7. **Cron premium**: dois jobs Vercel (`/api/cron/vaccine-due-notify` 12 UTC = 09 BRT; `/api/cron/vaccine-snooze-reentry` 11 UTC = 08 BRT). Trigger fino:
   - `upcoming` (pre-due) com daysUntil ∈ {30,7,1}
   - `due_soon` (dentro tolerance) com daysUntil = 0
   - `overdue` (pós-tolerance) com overdueDays ∈ {1,7,30}
   - + contextual: 24h antes de medical_appointment futuro com pendência da criança → "leve a carteirinha"
   - Filtra `vaccine_notification_dismissals` ativos. TTL reentrada: `already_scheduled` expira em 30d, push suave se ainda não registrado.

8. **Dashboard tile premium** (PWA `DashboardClient.tsx` + Native `(tabs)/index.tsx`): "Saúde preventiva · N reforços pendentes" — paleta âmbar-suave, mostra `nextDue` em linguagem calma. Separada da `saudeUnread` (que é awareness Foundation Collab) porque essa é ACAO motor-driven.

9. **`/saude` (hub) integrado**: card "Saúde preventiva" como pilar logo após hero/alergias, usa `getVaccineStatus()` direto. Bloco antigo `compareVaccinations()` foi removido — `sbp-vaccine-calendar.ts` está deprecado (mantém export por compat).

10. **Telemetria PostHog**: `vaccine_recommendation_computed`, `vaccine_status_viewed`, `vaccine_timeline_scrolled`, `vaccine_marked_taken`, `vaccine_due_push_sent` / `opened`, `vaccine_pending_dismissed`, `vaccine_calendar_preference_changed`.

11. **NÃO somos assistente médico**. Sem contraindicação, diagnóstico, juízo clínico. OCR Fase 2 (futuro) só `confidence_score` + duplicate detection. Modo Escola (Fase 3) PDF mostra APENAS registros brutos — sem cobertura/status/pendências. Kindar = transportador.

Pares já consolidados via service:
- `services/swap.ts` ← `actions/calendar.ts:{createSwapRequest,respondToSwapRequest}` + `api/swaps/route.ts:{POST,PATCH}` + tools `create_swap_request`/`respond_swap_request`/`get_pending_approvals`
- `services/expenses.ts` ← `actions/expenses.ts:{createExpense,updateExpenseStatus,deleteExpense}` + tool `create_expense`. Native (`kindar-native/src/services/expenses.ts`) ainda escreve direto via `safeWrite` para suporte offline — divergência conhecida que requer refactor offline-first separado para fechar.
- `services/notes.ts` ← `actions/notes.ts:{createNote,updateNote,deleteNote}` + tool `create_note`.
- `services/checkin.ts` ← `actions/checkin.ts:createCheckin` + tool `create_checkin` (broadcast no chat para o coparente).
- `services/decisions.ts` ← `actions/decisions.ts:{createDecision,castVote,addArgument}` + tool `create_decision` (resolução automática quando todos votam).
- `services/vaccines.ts` ← `actions/vaccines.ts:{registerVaccination,markDoseTaken,dismissDose,updateCalendarPreference}` + `api/health/vaccines/route.ts` (GET/POST/PATCH) + tools `record_vaccination` + `get_vaccine_status`. Motor consome `vaccine_recommended_doses` mantida por trigger (00082) e dispara push via Foundation Collab + cria `child_activity` kind='health' pra integrar calendário compartilhado.
- `services/vaccine-notifier.ts` (server-only) ← cron rotas `/api/cron/vaccine-due-notify` + `/api/cron/vaccine-snooze-reentry`. Lógica de identificação de candidates + fan-out de push via `createNotificationWithPush`. Reentrada de snooze `already_scheduled` 30d.
- `services/children.ts` ← `actions/group.ts:{createGroup,addChild,updateChild}` (PWA) + `api/children/route.ts:POST` (Native add) + `api/children/[childId]/route.ts:{PATCH,DELETE}` (Native edit/remove) + `api/create-group/route.ts` (primeira criança no onboarding). Centraliza validações (ISO date, future date, sex enum), mapeamento PG → mensagem humana (`23503` FK → "tem registros vinculados, apague-os antes" / `23514` check / `23505` unique / `42501` RLS / `PGRST116` not-found), reportServerError com PG code/details/hint, e captureServerEvent (`child_added`/`child_updated`/`child_deleted`). Suporta `enforceMembership=true` quando caller usa admin client (Native paths) e confia em RLS quando caller usa cookie client (PWA actions).

Pares ainda em paridade direta (a migrar para services):
- `actions/subscription-split.ts:enableSubscriptionSplit` ↔ `api/subscription/split/route.ts:POST`
- `actions/subscription-split.ts:disableSubscriptionSplit` ↔ `api/subscription/split/route.ts:DELETE`

Quando descobrir um par novo, adicione aqui. Quando extrair um service, mova-o da seção "em paridade direta" para "consolidados".

Bugs anteriores causados por esquecer essa regra:
- `2026-05-01` swap proposed_date direction: corrigido no PWA mas não no native, depois descoberto e corrigido no commit 6b273c0. Solução estrutural: a partir de hoje a lógica vive em `services/swap.ts` única.
- `2026-05-07` calendar_occurrences não geradas no native: PWA `actions/activities.ts` chamava `generateOccurrences`, native `services/activities.ts` não. Hailla criou Jiu-Jitsu 4× e nada apareceu no calendário. **Solução estrutural definitiva (migration `00074`): trigger AFTER INSERT/UPDATE em `child_activities` chama `generate_activity_occurrences()` PL/pgSQL. Banco é a fonte de verdade — independe do client. Lib JS no PWA + native continua existindo como defesa em profundidade (UI otimista + ambiente sem migration), mas idempotente via `ON CONFLICT DO NOTHING`.**
- `2026-05-15` Luísa (3 users) "não foi possível adicionar a 2ª criança" + Jucilande Android "erro ao remover criança": cada caller (`actions/group.ts`, `api/children/route.ts`, `api/children/[childId]/route.ts`, `api/create-group/route.ts`) fazia INSERT/UPDATE/DELETE direto no Supabase com try/catch divergente. PG errors (FK violation 23503, check 23514, RLS 42501) viravam HTML do Next que Native parseava como `{}` → fallback genérico sem contexto. **Solução estrutural: extraí `services/children.ts` (commit pendente). 28 testes cobrem mapPgError + createChild/updateChild/deleteChild incluindo gate enforceMembership (admin client) e cenários FK/check/RLS/not-found/wrong-group.**
- `2026-05-18` Henrique reportou erro "Could not find the 'stance' column of 'decision_arguments' in the schema cache" em produção (1.0.6). Causa: native (`kindar-native/app/_src/services/decisions.ts` + `app/decisoes/[id].tsx`) escrevia/lia coluna `stance` com valores `favor|contra|neutro`, mas o DB tem `argument_type` com CHECK (`pro|contra`) — mismatch silencioso desde sempre. PWA sempre usou `argument_type` correto. **Solução tática (commit `78f951c`)**: rename `stance → argument_type`, valores `favor → pro`, remove botão "Neutro" do composer (DB não suporta + PWA também não tem). **Solução estrutural pendente (M2)**: extrair `services/decisions.ts` no PWA pra um service compartilhado e fazer native consumir via `api/decisions/arguments/route.ts`, eliminando a duplicação dos schemas tipados. Atualmente o tipo `DecisionArgument` é definido SEPARADAMENTE no PWA (`src/lib/services/decisions.ts:AddArgumentInput.argumentType`) e no native — o esquema de migração já tinha um nome canônico há tempos mas o native nunca foi alinhado.

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
- `medical_appointment`, `illness_episode`, `active_medication`, `child_allergy`, `vaccination_record` (migration 00080) — Saúde Fase 3:
  - 5 ALTER TABLE com priority (appointments/illness/medications/allergies default `important`, vaccines default `info`)
  - `collab_record_group()` estendida com 5 WHEN branches
  - Trigger `saude_auto_mark_creator_read` genérico (1 função, 5 instâncias com TG_ARGV[0])
  - Trigger `illness_episodes_grave_to_urgent` BEFORE INSERT/UPDATE — quando `severity='grave'` E `priority='important'` (default), promove pra `'urgent'` automaticamente server-side. Respeita override explícito do cliente (não sobrescreve `urgent` ou `info` já passados).
  - Backfill em 5 tabelas pros `created_by` históricos.
  - Wrapper `src/lib/services/health-collab.ts:notifySaudeCreate({recordType, recordId, groupId, actorUserId, actorFirstName, childFirstName?, description, priorityOverride?})` — resolve priority efetivo da row (reflete trigger SQL `grave→urgent`) + monta título PT-BR por record_type + monta body com criança + deep link `/saude/<modulo>?highlight=<id>`. Server-side only; falha silenciosa.
  - Endpoint `POST /api/health/notify-create` — wrapper compacto pro native chamar após `safeWrite` (offline-first). Valida `created_by = auth.uid()` + membership; resolve nomes server-side; chama `notifySaudeCreate`.
  - `safeWrite` estendido com flag opcional `returnInsertedId: true` (backward-compatible) — quando passada em insert online, retorna `id` da row criada via `.select('id').single()`. Permite o caller (`createIllness`, `createAppointment`, `createMedication`, `createVaccinationRecord` em `kindar-native/app/_src/services/health.ts`) disparar `notifySaudeCreateNative` após sucesso.
  - Dashboard tile **consolidada** (PWA + Native): "Saúde · N novos" agregando os 5 record_types (em vez de 5 tiles separadas — princípio "dashboard tight"). Tap leva a `/saude`. Telemetria PostHog `unread_count` com `record_type: 'saude_aggregate'` (1 event por mount).
  - Strings i18n nos 5 idiomas: `collab.dashboardSaudeUnreadOne/Other/Hint`.
  - **Fora da adoção (deliberado, anti-spam):** `medication_doses` (alto volume, várias/dia → fica scoped ao card do remédio); `symptom_entries` (alto volume; coalesce no episode parent); `growth_records` (medição rotineira, sem ação pro outro pai); `child_medical_info` (update raro de tipo sanguíneo/convênio); `medical_professionals` (cadastro/diretório, não evento).
  - **Pendência conhecida (Fase 3.5 — não bloqueia adoção):** UI inline em cada uma das 5 telas individuais com chip "Novo" por card + chip de priority + linha "Visto por X · time" + `mark_collab_read` no tap-to-expand. Foundation entrega 80% do valor (push coalescing + dashboard tile + audit) sem isso; cards detail viram iteração quando o time validar uso em prod.

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
