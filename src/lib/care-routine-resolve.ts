/**
 * Resolver puro da Rotina de Leva & Busca (care routine).
 *
 * Espelha o estilo de `custody-resolve.ts`/`custody-hero.ts`: puro,
 * serializável, testável sem banco. NÃO faz I/O.
 *
 * # O que resolve
 *
 * Pra um dia (dateKey YYYY-MM-DD) e uma criança, quem LEVA (dropoff) e quem
 * BUSCA (pickup). A regra é:
 *
 *   override do dia  >  slot semanal do weekday
 *
 * (análogo a swap > regular na guarda). O weekday é computado no read — a
 * rotina NÃO materializa occurrences (é minúscula: <=10 slots/criança/semana).
 *
 * # Camadas independentes da guarda
 *
 * A rotina é ORTOGONAL à guarda noturna. Só `pattern_type='custody_based'`
 * (Fase 3) lê a guarda — e mesmo assim só LEITURA, via `custodyResolver`
 * injetado. Fase 1 implementa apenas `pattern_type='weekly'`.
 *
 * # Timezone
 *
 * weekday vem de `new Date(dateKey + "T12:00:00").getDay()` (0=Dom). A âncora
 * meio-dia evita o off-by-one de UTC que já mordeu a guarda (datas YYYY-MM-DD
 * tratadas como UTC viram dia-1 em BRT).
 */

export type RoutineLeg = "dropoff" | "pickup";

export type RoutinePatternType = "weekly" | "alternating_week" | "custody_based";

export type RoutineSlot = {
  id: string;
  child_id: string;
  /** 0=Dom .. 6=Sáb (igual getDay / EXTRACT(DOW) / DAY_NAMES). */
  weekday: number;
  leg: RoutineLeg;
  pattern_type: RoutinePatternType;
  /** NULL só p/ custody_based (derivado da guarda no read). */
  responsible_id: string | null;
  /** "HH:MM" ou "HH:MM:SS" — opcional. */
  time_of_day: string | null;
  /** Destino p/ copy humana ("escola", "creche") — opcional. */
  label: string | null;
  /** Paridade A/B (0/1) p/ alternating_week. null/ausente = vale toda semana. */
  week_parity?: number | null;
};

/** Resolve o responsável da GUARDA num dia (p/ slots custody_based). */
export type CustodyResolver = (childId: string, dateKey: string) => string | null;

export type RoutineOverride = {
  id: string;
  child_id: string;
  /** YYYY-MM-DD. */
  occurrence_date: string;
  leg: RoutineLeg;
  responsible_id: string;
};

export type ResolvedLeg = {
  responsibleId: string;
  time: string | null;
  label: string | null;
  /** De onde veio: slot semanal ou override pontual do dia. */
  source: "slot" | "override";
};

export type ResolvedRoutine = {
  dropoff: ResolvedLeg | null;
  pickup: ResolvedLeg | null;
};

/**
 * weekday (0=Dom) de uma date key YYYY-MM-DD, com âncora meio-dia local pra
 * evitar o off-by-one de UTC.
 */
export function weekdayOf(dateKey: string): number {
  return new Date(dateKey + "T12:00:00").getDay();
}

/**
 * Resolve uma perna (dropoff ou pickup) de uma criança num dia.
 *
 * Override do dia vence o slot semanal. Fase 1: só `pattern_type='weekly'`
 * (slots de outros pattern_type são ignorados — entram nas Fases 2/3 com o
 * `custodyResolver` injetado).
 *
 * Retorna null quando ninguém está atribuído àquela perna.
 */
// Paridade A/B (0/1) ancorada numa segunda fixa (2024-01-01 = segunda-feira).
const PARITY_ANCHOR_MS = new Date("2024-01-01T12:00:00").getTime();
export function weekParityOf(dateKey: string): number {
  const d = new Date(dateKey + "T12:00:00");
  const daysFromMonday = (d.getDay() + 6) % 7; // dom=6, seg=0, ter=1, ...
  const mondayMs = d.getTime() - daysFromMonday * 86_400_000;
  const weeks = Math.round((mondayMs - PARITY_ANCHOR_MS) / (7 * 86_400_000));
  return ((weeks % 2) + 2) % 2;
}

/** Se o slot se aplica numa data, considerando o pattern_type. */
function slotAppliesOn(slot: RoutineSlot, dateKey: string): boolean {
  switch (slot.pattern_type) {
    case "weekly":
    case "custody_based":
      return true;
    case "alternating_week":
      return slot.week_parity == null || weekParityOf(dateKey) === slot.week_parity;
    default:
      return false;
  }
}

export function resolveLegOnDate(
  slots: readonly RoutineSlot[],
  overrides: readonly RoutineOverride[],
  childId: string,
  dateKey: string,
  leg: RoutineLeg,
  custodyResolver?: CustodyResolver,
): ResolvedLeg | null {
  // 1) Override pontual do dia vence.
  const ov = overrides.find(
    (o) => o.child_id === childId && o.occurrence_date === dateKey && o.leg === leg,
  );
  if (ov) {
    return { responsibleId: ov.responsible_id, time: null, label: null, source: "override" };
  }

  // 2) Slot do weekday que SE APLICA na data (weekly / semana A-B / custody).
  const wd = weekdayOf(dateKey);
  const slot = slots.find(
    (s) => s.child_id === childId && s.leg === leg && s.weekday === wd && slotAppliesOn(s, dateKey),
  );
  if (!slot) return null;

  // 3) Responsável: custody_based deriva da guarda; senão é o do slot.
  const responsibleId =
    slot.pattern_type === "custody_based"
      ? custodyResolver
        ? custodyResolver(childId, dateKey)
        : null
      : slot.responsible_id;
  if (responsibleId == null) return null;

  return { responsibleId, time: slot.time_of_day, label: slot.label, source: "slot" };
}

/**
 * Resolve as duas pernas (leva + busca) de uma criança num dia.
 */
export function resolveRoutineOnDate(
  slots: readonly RoutineSlot[],
  overrides: readonly RoutineOverride[],
  childId: string,
  dateKey: string,
  custodyResolver?: CustodyResolver,
): ResolvedRoutine {
  return {
    dropoff: resolveLegOnDate(slots, overrides, childId, dateKey, "dropoff", custodyResolver),
    pickup: resolveLegOnDate(slots, overrides, childId, dateKey, "pickup", custodyResolver),
  };
}

/* ------------------------------------------------------------------ */
/*  Agregação pro painel (together / split), espelha buildCustodyHero  */
/* ------------------------------------------------------------------ */

export type RoutineHeroLeg = {
  responsibleId: string;
  responsibleName: string;
  isMe: boolean;
  time: string | null;
  label: string | null;
};

export type RoutineHeroEntry = {
  childIds: string[];
  childNames: string[];
  dropoff: RoutineHeroLeg | null;
  pickup: RoutineHeroLeg | null;
  /** Mesmo responsável nas 2 pernas → "X — dia inteiro". */
  sameAllDay: boolean;
};

export type RoutineToday =
  | { mode: "none"; entries: [] }
  | { mode: "together"; entries: [RoutineHeroEntry] }
  | { mode: "split"; entries: RoutineHeroEntry[] };

export type RoutineChild = { id: string; firstName: string };

/** Chave de agrupamento: crianças com o MESMO par (leva, busca) — inclusive
 *  horário/label — colapsam numa linha só ("Os meninos: X leva · Y busca"). */
function groupKey(r: ResolvedRoutine): string {
  const part = (l: ResolvedLeg | null) =>
    l ? `${l.responsibleId}@${l.time ?? ""}#${l.label ?? ""}` : "-";
  return `${part(r.dropoff)}|${part(r.pickup)}`;
}

/**
 * Agrega a rotina de HOJE de todas as crianças num "herói" pro painel,
 * colapsando crianças que vão/voltam juntas (mesmo par leva/busca) e
 * separando quando divergem.
 *
 * @param children          Crianças do grupo (id + primeiro nome).
 * @param resolvedByChild   childId → ResolvedRoutine de hoje.
 * @param resolveName       id de responsável → nome de exibição.
 * @param currentUserId     id do usuário logado (pra marcar "você").
 */
export function buildRoutineToday(
  children: readonly RoutineChild[],
  resolvedByChild: Record<string, ResolvedRoutine>,
  resolveName: (userId: string) => string,
  currentUserId: string,
): RoutineToday {
  const withRoutine = children.filter((c) => {
    const r = resolvedByChild[c.id];
    return r && (r.dropoff || r.pickup);
  });
  if (withRoutine.length === 0) return { mode: "none", entries: [] };

  const order: string[] = [];
  const byKey = new Map<string, RoutineChild[]>();
  for (const c of withRoutine) {
    const key = groupKey(resolvedByChild[c.id]);
    const arr = byKey.get(key);
    if (arr) {
      arr.push(c);
    } else {
      byKey.set(key, [c]);
      order.push(key);
    }
  }

  const toLeg = (l: ResolvedLeg | null): RoutineHeroLeg | null =>
    l
      ? {
          responsibleId: l.responsibleId,
          responsibleName: resolveName(l.responsibleId),
          isMe: l.responsibleId === currentUserId,
          time: l.time,
          label: l.label,
        }
      : null;

  const entries: RoutineHeroEntry[] = order.map((key) => {
    const kids = byKey.get(key)!;
    const r = resolvedByChild[kids[0].id];
    const dropoff = toLeg(r.dropoff);
    const pickup = toLeg(r.pickup);
    return {
      childIds: kids.map((k) => k.id),
      childNames: kids.map((k) => k.firstName),
      dropoff,
      pickup,
      sameAllDay:
        dropoff != null && pickup != null && dropoff.responsibleId === pickup.responsibleId,
    };
  });

  if (entries.length === 1) {
    return { mode: "together", entries: [entries[0]] };
  }
  return { mode: "split", entries };
}
