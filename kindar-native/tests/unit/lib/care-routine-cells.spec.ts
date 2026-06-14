/**
 * Testes da lógica de células do editor de rotina native
 * (app/_src/lib/care-routine-cells.ts). Espelho do PWA
 * (tests/unit/care-routine-cells.test.ts) — a lib é cópia byte-fiel e
 * alimenta o mesmo POST /api/care-routine (op save_grid). Mantê-los em
 * paridade trava a regressão silenciosa entre as duas cópias.
 *
 * Cobre buildRoutineCells nos 3 modos (weekly/custody/alternating) +
 * isCellMapEmpty + mapCells.
 */

import { describe, it, expect } from 'vitest';
import {
  buildRoutineCells,
  mapCells,
  isCellMapEmpty,
  CUSTODY,
  type RoutineGridState,
  type CellMap,
} from '../../../app/_src/lib/care-routine-cells';

const DAYS = [1, 2, 3, 4, 5];

function grid(p: Partial<RoutineGridState> = {}): RoutineGridState {
  return {
    mode: p.mode ?? 'weekly',
    cells: p.cells ?? {},
    cellsB: p.cellsB ?? {},
    dropoffTime: p.dropoffTime ?? '',
    pickupTime: p.pickupTime ?? '',
    dropoffLabel: p.dropoffLabel ?? '',
    pickupLabel: p.pickupLabel ?? '',
  };
}

describe('buildRoutineCells — weekly', () => {
  it('célula preenchida vira RoutineCellInput weekly com responsável', () => {
    const cells: CellMap = { 1: { dropoff: 'fernanda', pickup: 'henrique' } };
    const out = buildRoutineCells(grid({ cells }), DAYS);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ weekday: 1, leg: 'dropoff', responsibleId: 'fernanda', patternType: 'weekly', weekParity: null });
    expect(out[1]).toMatchObject({ weekday: 1, leg: 'pickup', responsibleId: 'henrique' });
  });
  it('perna null é pulada', () => {
    const out = buildRoutineCells(grid({ cells: { 1: { dropoff: 'fernanda', pickup: null } } }), DAYS);
    expect(out).toHaveLength(1);
    expect(out[0]?.leg).toBe('dropoff');
  });
  it('dia fora de `days` é ignorado', () => {
    const out = buildRoutineCells(grid({ cells: { 0: { dropoff: 'fernanda', pickup: null } } }), DAYS);
    expect(out).toHaveLength(0);
  });
  it('horário e label aplicados por perna', () => {
    const out = buildRoutineCells(
      grid({ cells: { 1: { dropoff: 'f', pickup: 'h' } }, dropoffTime: '08:00', pickupTime: '17:30', dropoffLabel: 'escola', pickupLabel: 'casa' }),
      DAYS,
    );
    expect(out[0]).toMatchObject({ timeOfDay: '08:00', label: 'escola' });
    expect(out[1]).toMatchObject({ timeOfDay: '17:30', label: 'casa' });
  });
  it('time/label vazios viram null', () => {
    const out = buildRoutineCells(grid({ cells: { 1: { dropoff: 'f', pickup: null } } }), DAYS);
    expect(out[0]?.timeOfDay).toBeNull();
    expect(out[0]?.label).toBeNull();
  });
  it('dia inteiro (mesmo responsável nas 2 pernas) gera 2 inputs', () => {
    const out = buildRoutineCells(grid({ cells: { 3: { dropoff: 'f', pickup: 'f' } } }), DAYS);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.responsibleId === 'f')).toBe(true);
  });
  it('fim de semana incluído quando days tem 0/6', () => {
    const out = buildRoutineCells(grid({ cells: { 6: { dropoff: 'f', pickup: null } } }), [...DAYS, 6, 0]);
    expect(out).toHaveLength(1);
    expect(out[0]?.weekday).toBe(6);
  });
});

describe('buildRoutineCells — custody', () => {
  it('célula CUSTODY vira custody_based com responsável null', () => {
    const out = buildRoutineCells(grid({ mode: 'custody', cells: { 1: { dropoff: CUSTODY, pickup: CUSTODY } } }), DAYS);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ patternType: 'custody_based', responsibleId: null, weekParity: null });
  });
  it('célula off (null) é pulada no custody', () => {
    const out = buildRoutineCells(grid({ mode: 'custody', cells: { 1: { dropoff: CUSTODY, pickup: null } } }), DAYS);
    expect(out).toHaveLength(1);
  });
  it('custody nunca emite week_parity', () => {
    const out = buildRoutineCells(grid({ mode: 'custody', cells: { 1: { dropoff: CUSTODY, pickup: null } } }), DAYS);
    expect(out[0]?.weekParity).toBeNull();
  });
});

describe('buildRoutineCells — alternating', () => {
  it('semana A (cells) → parity 0; semana B (cellsB) → parity 1', () => {
    const out = buildRoutineCells(
      grid({ mode: 'alternating', cells: { 1: { dropoff: 'f', pickup: null } }, cellsB: { 1: { dropoff: 'h', pickup: null } } }),
      DAYS,
    );
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.responsibleId === 'f')).toMatchObject({ patternType: 'alternating_week', weekParity: 0 });
    expect(out.find((c) => c.responsibleId === 'h')).toMatchObject({ patternType: 'alternating_week', weekParity: 1 });
  });
  it('só semana A preenchida → só parity 0', () => {
    const out = buildRoutineCells(grid({ mode: 'alternating', cells: { 1: { dropoff: 'f', pickup: null } }, cellsB: {} }), DAYS);
    expect(out).toHaveLength(1);
    expect(out[0]?.weekParity).toBe(0);
  });
  it('ambas vazias → []', () => {
    expect(buildRoutineCells(grid({ mode: 'alternating' }), DAYS)).toHaveLength(0);
  });
});

describe('buildRoutineCells — vazio', () => {
  it('grade vazia → []', () => {
    expect(buildRoutineCells(grid(), DAYS)).toHaveLength(0);
  });
});

describe('isCellMapEmpty', () => {
  it('grade vazia → true', () => {
    expect(isCellMapEmpty({})).toBe(true);
  });
  it('células sem perna preenchida → true', () => {
    expect(isCellMapEmpty({ 1: { dropoff: null, pickup: null } })).toBe(true);
  });
  it('uma perna preenchida → false', () => {
    expect(isCellMapEmpty({ 1: { dropoff: 'fernanda', pickup: null } })).toBe(false);
  });
  it('sentinela custody conta como preenchida → false', () => {
    expect(isCellMapEmpty({ 2: { dropoff: CUSTODY, pickup: null } })).toBe(false);
  });
});

describe('mapCells', () => {
  it('aplica fn a cada perna', () => {
    const out = mapCells({ 1: { dropoff: 'x', pickup: null } }, (v) => (v ? 'Y' : null));
    expect(out[1]).toEqual({ dropoff: 'Y', pickup: null });
  });
  it('vazio → vazio', () => {
    expect(mapCells({}, (v) => v)).toEqual({});
  });
  it('converte preenchidas pra CUSTODY (troca de modo → custody)', () => {
    const out = mapCells({ 2: { dropoff: 'uid', pickup: null } }, (v) => (v ? CUSTODY : null));
    expect(out[2]).toEqual({ dropoff: CUSTODY, pickup: null });
  });
});
