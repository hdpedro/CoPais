# Feature: Período de Férias (Vacation)

> **Status**: ✅ Em produção desde 2026-05-15 (commit `273a08a` + migration `00082`).
> **Origem**: Bug Amanda 2026-05-14 — admin tentou criar férias do Bê via "Novo Evento" e ficou travada porque era a ferramenta errada (evento social vs período de custódia).

## Princípio

Férias **NÃO** é evento social. É **período de custódia que sobrepõe a escala regular**. Quando Amanda marca "Férias do Bê 10-20/jul com ela", a escala regular do Barata pra esses dias deve ficar **invisível** no calendário, dashboard, agenda da semana, próxima troca e cálculo de streak.

## Modelo de dados

Vacation reusa `custody_events` com `custody_type='vacation'` (enum existente desde a migration 00001). Sem tabela nova.

```sql
INSERT INTO custody_events (
  group_id,
  child_id,            -- NULL = vale pra família toda
  custody_type,        -- 'vacation'
  responsible_user_id, -- obrigatório (quem está com a criança)
  start_date,
  end_date,
  notes                -- "Viagem pra Caraguá", opcional
);
```

## Hierarquia de prioridade (migration 00082)

A view `custody_resolved` resolve "quem é responsável no dia X":

| custody_type | Prioridade | Vence quem? |
|--------------|------------|-------------|
| `swap`       | 1          | Vence tudo — acordo pontual entre coparentes |
| `vacation`   | 2          | Sobrepõe regular/holiday/special |
| `exception`  | 2          | Mesmo nível de vacation (futuro) |
| `regular`    | 3          | Default — escala normal |
| `holiday`    | 3          | Feriado nacional, sem override |
| `special`    | 3          | Ad-hoc |

**Tie-break dentro do mesmo prio**: `created_at DESC` (mais recente vence).

**Por que swap > vacation?** Acordo pontual entre coparentes ("eu pego dia 15 mesmo que seja seu período de férias") deve respeitar a vontade explícita das partes. Se Amanda+Barata trocaram o dia, swap vence.

**Por que vacation > regular?** O ponto inteiro do vacation é sobrepor a escala. Senão é só uma anotação solta.

## Side-effects ao criar

Em ordem, quando `createVacationPeriod` retorna sucesso:

1. Row em `custody_events` (trigger 00079 rejeita overlap com outra vacation do mesmo grupo+criança)
2. View `custody_resolved` reflete imediatamente (view não-materializada)
3. PostHog event `vacation_created` (props: group_id, child_id, responsible_user_id, days, has_notes)
4. Push notification pros outros membros do grupo (não pra quem criou)
5. In-app notification row inserida pra cada outro membro
6. Calendário, dashboard, streak, próxima troca recalculam automaticamente no próximo refetch

## Arquitetura

### PWA (web)

```
src/lib/services/vacation.ts          ← single source of truth
  ├── createVacationPeriod(supabase, input): ServiceResult
  ├── updateVacationPeriod(supabase, input): ServiceResult
  ├── deleteVacationPeriod(supabase, input): ServiceResult
  └── listVacations(supabase, groupId, opts): ServiceResult<VacationListItem[]>

src/actions/vacation.ts                ← server actions wrapping service
  ├── createVacation (useActionState — retorna { error? })
  ├── updateVacation
  └── deleteVacation (FormData)

src/app/(app)/calendario/ferias/
  ├── page.tsx                          ← server component (lista + form)
  └── NewVacationForm.tsx               ← client form com useActionState

src/lib/calendar-utils.ts:buildCustodyMap
  └── ordering: regular/holiday/special FIRST, then exception/vacation,
      then swap LAST (map.set overwrites — later wins)

src/app/(app)/calendario/CalendarHeader.tsx
  └── botão ✈️ → /calendario/ferias

src/app/(app)/calendario/DayDetailSheet.tsx
  └── label "✈️ Em férias com X" quando custodyType='vacation'
```

### Native (iOS + Android)

```
kindar-native/app/_src/services/vacation.ts
  ├── createVacationPeriod(params): safeWrite + notifyAction('vacation_created')
  ├── listUpcomingVacations(groupId, limit)
  └── deleteVacationPeriod(vacationId)

kindar-native/app/calendario/ferias.tsx
  ├── Form (criança + datas + responsável obrigatório + notas)
  ├── Lista "Próximas / em andamento" (com botão delete)
  └── Banner explicativo

kindar-native/app/_src/lib/custody-resolve.ts
  └── custodyPriority: swap=1, vacation/exception=2, regular/holiday/special=3
      (espelho exato da view SQL)

kindar-native/app/_src/hooks/useCalendar.ts
  └── orderedCustody dedup: swap > vacation/exception > resto

kindar-native/app/(tabs)/calendario.tsx
  ├── Botão ✈️ no header → /calendario/ferias
  └── Day sheet mostra "✈️ Férias" pra custodyType='vacation'
```

### Backend (PWA-served, usado por Native via /api/native/notify)

```
src/app/api/native/notify/route.ts
  └── ActionType 'vacation_created':
      - notificationType: 'custody_change'
      - title: '✈️ Novo período de férias'
      - body: '{creator} marcou férias de {child}: {start} – {end} ({N} dias)'
      - link: '/calendario'
      - chatMessageFn: '✈️ {creator} marcou férias de {child}'
```

## Validações

| Camada | Validação | Mensagem ao user |
|--------|-----------|------------------|
| Client UI | end ≥ start | "A data final deve ser depois da inicial." |
| Client UI | days ≤ 90 | "Período muito longo (máx 90 dias)." |
| Client UI | responsável obrigatório | "Escolha quem está com a criança nas férias." |
| Service | Membership do responsável no grupo | "O responsável escolhido não é membro deste grupo." |
| DB Trigger 00079 | Sem overlap com outra vacation do mesmo (group, child) | "Já existe um período de férias que sobrepõe esse intervalo." |
| RLS | usuário só lê/escreve no próprio grupo | (403 silent) |

## Integração com outras features

| Feature | Comportamento |
|---------|---------------|
| **Dashboard "Próxima troca"** | `findNextCustodyHandover` itera dia-a-dia → detecta troca quando responsável muda. Vacation sobrepõe → próxima troca pode ser começo OU fim da vacation. |
| **Streak X/Y** | `computeCustodyStreak` agrupa por responsável consecutivo → vacation+regular do MESMO responsável = mesmo streak; vacation+regular DIFERENTES = streak quebrado. |
| **Card "Hoje com X"** | `resolveTodayCustody` aplica view `custody_resolved` → mostra responsável da vacation se hoje está dentro do range. |
| **WeekendPlanner (PWA)** | Usa `custodyMap` (via `buildCustodyMap`) → fins de semana dentro de vacation refletem o responsável das férias, não da escala. |
| **Calendar export iOS (calendar-sync.ts)** | Exporta vacation com título "Com {nome}" (mesma cor do responsável). Não tem badge especial — refinement futuro. |
| **Swap requests** | Trigger 00079 ALLOW swap+vacation no mesmo dia (tipos diferentes). View resolve swap>vacation. Hoje NÃO há warning UX ao criar swap dentro de vacation aprovada — refinement futuro. |
| **Activities recorrentes** | Activities seguem o horário/dia delas independente da custódia. Vacation não suspende atividades. |
| **Push notification** | PWA: via `createNotificationWithPush` direto no service. Native: via `notifyAction('vacation_created')` → `/api/native/notify` → push + in-app row + analytics. |

## Edge cases cobertos por testes (`tests/unit/vacation-scenarios.test.ts`, 50/50)

1. Vacation sobrepõe regular do mesmo dia
2. Vacation de 1 dia (start==end)
3. Vacation longa (30 dias)
4. Dia fora do range: regular prevalece
5. Multi-criança independente
6. Vacation grupal (child_id=null)
7. Streak captura período inteiro
8. Handover após vacation
9. Handover ANTES do início da vacation
10. Streak conta dias passados corretamente
11-15. Priority enum (swap < vacation < regular, holiday=regular, special=regular)
16-20. Ties, single events, ranges inclusivos
21-30. buildCustodyMap, swap > vacation override, cross-month, cross-year, fins de semana/dias úteis
31-40. Integração com streak, próxima troca, vacations consecutivas, overlap defensivo
41-50. 1 dia, passado, futuro distante, fuso, notes com emoji, data inválida, 0 events, horizonte 60/120

## Limitações conhecidas (Fase 2)

- **Edit vacation na UI**: hoje só delete + recriar. Notes se perdem.
- **AI tool**: `create_vacation_period` em `src/lib/ai/tools.ts` não existe → não dá pra criar via WhatsApp/AI in-app.
- **Visual badge no calendar grid**: dia de férias mostra cor do responsável, mas não tem ✈️ no quadradinho. Só day-sheet (após clicar).
- **Warning ao criar swap dentro de vacation**: hoje aceita silenciosamente.
- **i18n**: strings hardcoded PT-BR. Refinement quando outros mercados adotarem.
- **Audit trail (vacation_history)**: Expenses Foundation Fase 1B tem; vacation não. Refinement.
- **Banner "Em férias agora"**: dashboard não destaca proativamente período de férias em andamento.

## Como criar (UX)

**PWA**: Calendário → ✈️ → preencher → Salvar
**iOS/Android**: tab Calendário → ✈️ no header → preencher → Salvar

Ambos: criança opcional (default família toda), datas obrigatórias, responsável obrigatório, anotação opcional.

## Como rotacionar credenciais / mudar prio

Pra mudar a hierarquia de prioridade, criar nova migration que `CREATE OR REPLACE VIEW public.custody_resolved` com novo CASE. View não-materializada propaga imediatamente.

Mantém paridade com helper JS em DOIS lugares:
- `src/lib/custody-resolve.ts:custodyPriority` (PWA)
- `kindar-native/app/_src/lib/custody-resolve.ts:custodyPriority` (Native)

Esses dois precisam ter o mesmo CASE — divergência silenciosa é o risco. Os testes em `tests/unit/custody-resolve.test.ts` + `vacation-scenarios.test.ts` rodam tudo.
