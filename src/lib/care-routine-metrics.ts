/**
 * Corresponsabilidade da rotina (Fase 2) — agregação PURA, NEUTRA.
 *
 * REGRA DE MARCA (inegociável): só CONTAGENS. SEM porcentagem, SEM ranking,
 * SEM ordenar por quantidade, SEM vermelho. "Fernanda realizou 18 buscas,
 * Henrique 16" — dados, não disputa. Retorna na ORDEM DOS MEMBROS (não por
 * contagem) de propósito, pra não insinuar competição.
 *
 * "Quem realizou" = o RESPONSÁVEL resolvido (override do dia vence o slot),
 * não quem tocou o botão. Só conta logs `done`.
 */

import { weekdayOf, type RoutineSlot, type RoutineOverride } from "./care-routine-resolve";

export interface RoutineLogEntry {
  child_id: string;
  occurrence_date: string; // YYYY-MM-DD
  leg: "dropoff" | "pickup";
  status: "done" | "missed";
}

export interface CorresponsibilityRow {
  userId: string;
  name: string;
  dropoff: number;
  pickup: number;
  total: number;
}

export function computeCorresponsibility(
  slots: readonly RoutineSlot[],
  overrides: readonly RoutineOverride[],
  logs: readonly RoutineLogEntry[],
  members: readonly { id: string; name: string }[],
): CorresponsibilityRow[] {
  const overrideMap = new Map<string, string>();
  for (const o of overrides) overrideMap.set(`${o.child_id}::${o.occurrence_date}::${o.leg}`, o.responsible_id);

  // Slot semanal vigente como aproximação do padrão histórico (pattern estável).
  const slotMap = new Map<string, string>();
  for (const s of slots) {
    if (s.pattern_type === "weekly" && s.responsible_id) {
      slotMap.set(`${s.child_id}::${s.weekday}::${s.leg}`, s.responsible_id);
    }
  }

  const counts = new Map<string, { dropoff: number; pickup: number }>();
  for (const m of members) counts.set(m.id, { dropoff: 0, pickup: 0 });

  for (const log of logs) {
    if (log.status !== "done") continue;
    const wd = weekdayOf(log.occurrence_date);
    const responsible =
      overrideMap.get(`${log.child_id}::${log.occurrence_date}::${log.leg}`) ??
      slotMap.get(`${log.child_id}::${wd}::${log.leg}`);
    if (!responsible) continue;
    const c = counts.get(responsible);
    if (!c) continue; // responsável não está nos membros (ex-membro) → ignora
    if (log.leg === "dropoff") c.dropoff += 1;
    else c.pickup += 1;
  }

  // Ordem dos MEMBROS (não por contagem) — sem ranking.
  return members.map((m) => {
    const c = counts.get(m.id)!;
    return { userId: m.id, name: m.name, dropoff: c.dropoff, pickup: c.pickup, total: c.dropoff + c.pickup };
  });
}
