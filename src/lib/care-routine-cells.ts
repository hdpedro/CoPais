/**
 * Lógica PURA de construção das células do editor de rotina (RoutineBuilder).
 * Extraída do componente pra ser testável isolada. Converte o estado da grade
 * (por modo) em RoutineCellInput[] pro saveRoutineGrid.
 */

import type { RoutineCellInput, CareRoutineLeg } from "@/lib/services/care-routine";

export type LegState = string | null; // responsible_id | CUSTODY | null
export type CellMap = Record<number, { dropoff: LegState; pickup: LegState }>;
export type PatternMode = "weekly" | "custody" | "alternating";

/** Sentinela "segue a guarda" no estado da célula (UUID nunca é isto). */
export const CUSTODY = "__custody__";

const LEGS: CareRoutineLeg[] = ["dropoff", "pickup"];

export interface RoutineGridState {
  mode: PatternMode;
  cells: CellMap; // weekly / custody / Semana A
  cellsB: CellMap; // Semana B (só alternating)
  dropoffTime: string;
  pickupTime: string;
  dropoffLabel: string;
  pickupLabel: string;
}

function cellsToInputs(g: RoutineGridState, cells: CellMap, parity: number | null, days: number[]): RoutineCellInput[] {
  const out: RoutineCellInput[] = [];
  for (const wd of days) {
    const cell = cells[wd];
    if (!cell) continue;
    for (const leg of LEGS) {
      const v = cell[leg];
      if (!v) continue;
      out.push({
        weekday: wd,
        leg,
        responsibleId: g.mode === "custody" ? null : v,
        patternType:
          g.mode === "custody" ? "custody_based" : g.mode === "alternating" ? "alternating_week" : "weekly",
        weekParity: g.mode === "alternating" ? parity : null,
        timeOfDay: (leg === "dropoff" ? g.dropoffTime : g.pickupTime) || null,
        label: (leg === "dropoff" ? g.dropoffLabel : g.pickupLabel) || null,
      });
    }
  }
  return out;
}

/**
 * Constrói os RoutineCellInput[] do save. Alternating envia AS DUAS semanas
 * (parity 0 e 1) num único conjunto — saveRoutineGrid faz upsert + delete-missing.
 */
export function buildRoutineCells(g: RoutineGridState, days: number[]): RoutineCellInput[] {
  if (g.mode === "alternating") {
    return [...cellsToInputs(g, g.cells, 0, days), ...cellsToInputs(g, g.cellsB, 1, days)];
  }
  return cellsToInputs(g, g.cells, null, days);
}

/** Uma grade está vazia se nenhuma célula tem perna preenchida. */
export function isCellMapEmpty(cells: CellMap): boolean {
  return Object.values(cells).every((c) => !c.dropoff && !c.pickup);
}

/** Aplica fn a cada perna de cada célula (usado em troca de modo). */
export function mapCells(cells: CellMap, fn: (v: LegState) => LegState): CellMap {
  const out: CellMap = {};
  for (const [wd, cell] of Object.entries(cells)) {
    out[Number(wd)] = { dropoff: fn(cell.dropoff), pickup: fn(cell.pickup) };
  }
  return out;
}
