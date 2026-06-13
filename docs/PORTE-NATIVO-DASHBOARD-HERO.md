# Porte Nativo — Herói do Dashboard (Arco do Dia + Guarda universal + Dia em Família)

Estado: **componentes prontos e type-corretos (native `tsc --noEmit` limpo)**. Falta a
**fiação de dados** (`useDashboard` + `index.tsx`) + aplicar i18n + **validar em device**
+ publicar OTA. Nada foi publicado (OTA empacota working tree e há sessão paralela ativa).

## O que JÁ está commitado (arquivos novos, type-correto no Expo)

| Arquivo | Papel |
|---|---|
| `app/_src/lib/care-routine-journey.ts` | Cópia pura do PWA — `buildChildJourney` + dedupe (alimenta o arco). Coberto pelos testes do PWA (lógica idêntica). |
| `app/_src/lib/briefing.ts` | `selectHeroKind` (puro, paridade PWA). |
| `app/_src/components/DayArc.tsx` | **Arco do Dia** em `react-native-svg`. Geometria byte-a-byte do PWA (bezier + de Casteljau + clamp 06h–21h + zigzag). Filtros DROPADOS (blur/shadow sem suporte estável em RN) → brilho do sol por halos translúcidos. |
| `app/_src/components/DashboardHero.tsx` | **Herói universal** props-driven: guarda (voz+badge+ritmo+troca) · dia em família (voz de presença) · rotina (leva/busca). Compõe o `DayArc`. |
| `scripts/i18n/_keys-native-hero.json` | 13 chaves i18n faltantes (×5 locales), prontas pra aplicar. |

## Falta 1 — i18n (deferido pela regra de session-tree)

A sessão paralela está editando os locales nativos. Quando assentar:
```
node scripts/i18n/add-keys.mjs --keys-file=scripts/i18n/_keys-native-hero.json --target=native
node scripts/i18n/generate-types.mjs   # se o native tiver tipos gerados
```
⚠️ **Custody voice é count-agnostic de propósito**: o `t()` nativo (`app/_src/i18n/index.ts`)
é **regex-only, NÃO suporta ICU plural**. Por isso `heroCustodyWithYou/WithOther` viraram
`"{kids} com você"` / `"{kids} com {name}"` (espelham o "com você" do dia-em-família),
sem `{count, plural, …}`. NÃO copiar as versões ICU do PWA.

## Falta 2 — fiação de dados em `app/_src/hooks/useDashboard.ts`

Adicionar ao `DashboardData` (e popular no fetch, reusando os resolvers já importados:
`resolveTodayCustody`, `findNextCustodyHandover`, `computeCustodyStreak`, `PARENT_COLORS`):

```ts
arrangement: 'rotating' | 'together' | 'single' | 'custom';   // de coparenting_groups.arrangement (default 'rotating')
heroKind: BriefingHeroKind;                                   // selectHeroKind({ arrangement, hasCustody, hasRoutineSlots })
heroTimeline: JourneyItem[];                                  // buildChildJourney({ dropoff, pickup, activities: todayActivities (com time), homeMorning, homeEvening })
custodyContext: HeroCustodyContext | null;                    // monta quando rotating/custom + hasTodayCustody
familyDayContext: HeroFamilyDayContext | null;               // { mode: arrangement, kids: childrenFirstNames } quando together/single
routineEntries: RoutineHeroEntry[];                          // já vem do care-routine-resolve (hoje no useCareRoutineToday)
hasRoutineSlots: boolean;
```

**`custodyContext.week` (semana colorida)** — replicar o `weekCustodyEntries` do PWA: pra cada
dia [Dom..Sáb] da semana corrente, `resolveTodayCustody(eventsDoDia)` → `{ label: DAY_INITIAL[i],
color: PARENT_COLORS[responsibleId] ?? null, isToday: i === hoje.getDay() }`. `streakDays/Total`
já existem. `groups` (modo split) = um por responsável distinto hoje, com `colorHex` do PARENT_COLORS.
`handoff` = quando `findNextCustodyHandover` cai hoje/amanhã cedo → `{ name, isMe }`. `untilLabel`
= fim do bloco atual de guarda.

**`heroTimeline`**: `homeMorning`/`homeEvening` = nome do responsável da guarda (null pra família
intacta); `activities` = `todayActivities` (têm `timeStr`, `childId`, `location`). No dia de troca,
`homeEvening` = próximo responsável (mostra o handoff no arco).

## Falta 3 — render em `app/(tabs)/index.tsx`

Trocar o hero inline (≈ linhas 360–479) **e** o `<RoutineTodayCard />` por:
```tsx
{data.heroKind === 'custody' && data.custodyContext ? (
  <DashboardHero heroTimeline={data.heroTimeline} nowMin={nowMin}
    custodyContext={data.custodyContext} hasRoutineSlots={data.hasRoutineSlots} />
) : data.heroKind === 'routine' || (data.familyDayContext && data.hasTodayEvents) ? (
  <DashboardHero heroTimeline={data.heroTimeline} nowMin={nowMin}
    familyDayContext={data.hasRoutineSlots ? null : data.familyDayContext}
    routineEntries={data.routineEntries} hasRoutineSlots={data.hasRoutineSlots} />
) : (
  /* card de saudação/ativação atual (setup) */
)}
```
`nowMin` = relógio do device: `const [nowMin,setNowMin]=useState(()=>{const d=new Date();return d.getHours()*60+d.getMinutes()})` + `setInterval(…,60000)` (rollover à meia-noite → refetch). Igual ao PWA.

> Regra de paridade do projeto: o hero inline antigo vive no git (rollback = revert). Não
> empilhar 2 cards ("é um OU outro"). Ver memórias `project_kindar_dashboard_hero_section_gating`
> e `project_kindar_family_day_hero`.

## Falta 4 — validar em device (gate do dono — não dá no ambiente de dev)

EAS build (runtime nativa: `react-native-svg@15.12.1` já está no binário → **OTA basta**, sem novo build).
Checklist de paridade com o PWA (rodar nas 3 formas de família + locales pt/en):
- [ ] Guarda: voz com perspectiva, badge "Guarda ativa", ritmo da semana colorido + "N de M consecutivos", "Próxima troca/Você pega".
- [ ] Dia em família COM evento: "{filhos} com vocês/você hoje" + arco com estação + "Próximo momento".
- [ ] Dia em família VAZIO: arco **só com o sol** + voz calma + header "Montar rotina".
- [ ] Rotina leva/busca: voz "{quem} leva · {quem} busca" + arco.
- [ ] Sol na posição do relógio; percorrido sólido / futuro tracejado.
- [ ] **Android**: emoji 🏠 das casas renderiza no `<SvgText>` (risco conhecido — se falhar, trocar por `<Circle>` rotulado).
- [ ] Deep-links do arco (atividade → `/atividades/[id]`; resto → `/calendario`).

## Falta 5 — publicar OTA (DELIBERADO, nunca por acidente)

Regra do projeto: **sempre `--platform` explícito**, **sequencial android→ios**, e **stashar a
sessão paralela antes** (OTA empacota o working tree, não o HEAD). Ver memórias
`feedback_eas_update_working_tree_and_no_parallel` e `feedback_never_touch_ios`.
```
# com a tree limpa (só o que vai pro bundle):
eas update --branch <runtime> --platform android --message "feat: dashboard hero nativo"
eas update --branch <runtime> --platform ios     --message "feat: dashboard hero nativo"
```
