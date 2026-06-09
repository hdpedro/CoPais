/**
 * Resolver puro da Rotina de Leva & Busca (care routine) — cópia native do
 * `src/lib/care-routine-resolve.ts` do PWA (mesmo padrão de duplicação do
 * `custody-resolve.ts`). Mantenha em sincronia com a versão do PWA.
 *
 * Puro, serializável, testável sem banco. NÃO faz I/O.
 *
 * Regra: override do dia > slot semanal do weekday. weekday 0=Dom, via âncora
 * meio-dia (`new Date(dateKey + "T12:00:00").getDay()`) pra evitar o off-by-one
 * de UTC. Fase 1 implementa apenas `pattern_type='weekly'`.
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
};

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
  source: "slot" | "override";
};

export type ResolvedRoutine = {
  dropoff: ResolvedLeg | null;
  pickup: ResolvedLeg | null;
};

export function weekdayOf(dateKey: string): number {
  return new Date(dateKey + "T12:00:00").getDay();
}

export function resolveLegOnDate(
  slots: readonly RoutineSlot[],
  overrides: readonly RoutineOverride[],
  childId: string,
  dateKey: string,
  leg: RoutineLeg,
): ResolvedLeg | null {
  const ov = overrides.find(
    (o) => o.child_id === childId && o.occurrence_date === dateKey && o.leg === leg,
  );
  if (ov) {
    return { responsibleId: ov.responsible_id, time: null, label: null, source: "override" };
  }

  const wd = weekdayOf(dateKey);
  const slot = slots.find(
    (s) =>
      s.child_id === childId &&
      s.leg === leg &&
      s.weekday === wd &&
      s.pattern_type === "weekly" &&
      s.responsible_id != null,
  );
  if (slot && slot.responsible_id != null) {
    return {
      responsibleId: slot.responsible_id,
      time: slot.time_of_day,
      label: slot.label,
      source: "slot",
    };
  }

  return null;
}

export function resolveRoutineOnDate(
  slots: readonly RoutineSlot[],
  overrides: readonly RoutineOverride[],
  childId: string,
  dateKey: string,
): ResolvedRoutine {
  return {
    dropoff: resolveLegOnDate(slots, overrides, childId, dateKey, "dropoff"),
    pickup: resolveLegOnDate(slots, overrides, childId, dateKey, "pickup"),
  };
}

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
  sameAllDay: boolean;
};

export type RoutineToday =
  | { mode: "none"; entries: [] }
  | { mode: "together"; entries: [RoutineHeroEntry] }
  | { mode: "split"; entries: RoutineHeroEntry[] };

export type RoutineChild = { id: string; firstName: string };

function groupKey(r: ResolvedRoutine): string {
  const part = (l: ResolvedLeg | null) =>
    l ? `${l.responsibleId}@${l.time ?? ""}#${l.label ?? ""}` : "-";
  return `${part(r.dropoff)}|${part(r.pickup)}`;
}

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
