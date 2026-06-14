/**
 * Testes de `composeAttention` (app/_src/lib/briefing.ts) — a régua UNIFICADA
 * "Sua Atenção" do dashboard native. Espelho do PWA (tests/unit/briefing.test.ts)
 * adaptado ao shape native (sem campos de herói; só os pendentes) e às rotas
 * do expo-router. Mantê-los em paridade trava regressão entre as duas cópias.
 */

import { describe, it, expect } from 'vitest';
import { composeAttention, type BriefingInput } from '../../../app/_src/lib/briefing';

function baseInput(over: Partial<BriefingInput> = {}): BriefingInput {
  return {
    pendingSwaps: [],
    routineAwaitingTheirAck: false,
    routinePendingAck: null,
    pendingReports: [],
    pendingExpenses: [],
    pendingDecisions: [],
    schoolUnreadCount: 0,
    expensesUnreadCount: 0,
    saudeUnreadCount: 0,
    vaccinePendingCount: 0,
    vaccineNextDue: null,
    ...over,
  };
}

describe('composeAttention — régua de prioridade', () => {
  it('dia tranquilo: nada pendente → lista vazia', () => {
    expect(composeAttention(baseInput())).toEqual([]);
  });

  it('inclui swap quando há pedido de troca', () => {
    const a = composeAttention(baseInput({ pendingSwaps: [{ id: 's1', requesterName: 'Fernanda' }] }));
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('swap');
    expect(a[0].count).toBe(1);
    expect(a[0].data.firstName).toBe('Fernanda');
    expect(a[0].link).toBe('/calendario');
  });

  it('routine_ack via pendingAck (o outro mudou, eu vejo) — link nativo "/"', () => {
    const a = composeAttention(baseInput({ routinePendingAck: { fromName: 'Fernanda', overrideIds: ['o1'] } }));
    expect(a[0].kind).toBe('routine_ack');
    expect(a[0].data.fromName).toBe('Fernanda');
    expect(a[0].data.awaiting).toBe(0);
    expect(a[0].link).toBe('/');
  });

  it('routine_ack via awaitingTheirAck (eu mudei, aguardo ciência)', () => {
    const a = composeAttention(baseInput({ routineAwaitingTheirAck: true }));
    expect(a[0].kind).toBe('routine_ack');
    expect(a[0].data.awaiting).toBe(1);
  });

  it('pending_report: primeiro como amostra + count total', () => {
    const a = composeAttention(
      baseInput({
        pendingReports: [
          { activityName: 'Futsal', childName: 'Otto', daysAgo: 1 },
          { activityName: 'Teatro', childName: 'Martim', daysAgo: 2 },
        ],
      }),
    );
    expect(a[0].kind).toBe('pending_report');
    expect(a[0].count).toBe(2);
    expect(a[0].data.activity).toBe('Futsal');
    expect(a[0].data.child).toBe('Otto');
    expect(a[0].link).toBe('/atividades/pendentes');
  });

  it('pending_report de família (child vazio) preserva data.child=""', () => {
    const a = composeAttention(baseInput({ pendingReports: [{ activityName: 'Praia', childName: '', daysAgo: 0 }] }));
    expect(a[0].kind).toBe('pending_report');
    expect(a[0].data.child).toBe('');
  });

  it('pending_expense agregado por count → /despesas', () => {
    const a = composeAttention(
      baseInput({ pendingExpenses: [{ id: 'e1', description: 'Escola' }, { id: 'e2', description: 'Médico' }] }),
    );
    expect(a[0].kind).toBe('pending_expense');
    expect(a[0].count).toBe(2);
    expect(a[0].link).toBe('/despesas');
  });

  it('pending_decision com título de amostra → /decisoes', () => {
    const a = composeAttention(baseInput({ pendingDecisions: [{ id: 'd1', title: 'Escola nova' }] }));
    expect(a[0].kind).toBe('pending_decision');
    expect(a[0].data.title).toBe('Escola nova');
    expect(a[0].link).toBe('/decisoes');
  });

  it('as 3 novidades (escola/despesa/saúde) com seus counts e rotas', () => {
    const a = composeAttention(baseInput({ schoolUnreadCount: 2, expensesUnreadCount: 1, saudeUnreadCount: 3 }));
    const byKind = Object.fromEntries(a.map((i) => [i.kind, i]));
    expect(byKind.school_unread.count).toBe(2);
    expect(byKind.school_unread.link).toBe('/escola');
    expect(byKind.expenses_unread.count).toBe(1);
    expect(byKind.saude_unread.count).toBe(3);
    expect(byKind.saude_unread.link).toBe('/saude');
  });

  it('vacina entra CALMA (tone calm) com nome/data nos params', () => {
    const a = composeAttention(
      baseInput({ vaccinePendingCount: 23, vaccineNextDue: { dueDate: '2026-06-20', vaccineName: 'VIP' } }),
    );
    expect(a[0].kind).toBe('vaccine');
    expect(a[0].tone).toBe('calm');
    expect(a[0].count).toBe(23);
    expect(a[0].data.vaccineName).toBe('VIP');
    expect(a[0].link).toBe('/saude/vacinas');
  });

  it('ordena pela régua: o plano de hoje sobe, vacina afunda', () => {
    const a = composeAttention(
      baseInput({
        vaccinePendingCount: 5,
        schoolUnreadCount: 1,
        pendingExpenses: [{ id: 'e1', description: 'x' }],
        pendingReports: [{ activityName: 'Futsal', childName: 'Otto', daysAgo: 1 }],
        pendingSwaps: [{ id: 's1', requesterName: 'Fernanda' }],
      }),
    );
    expect(a.map((i) => i.kind)).toEqual(['swap', 'pending_report', 'pending_expense', 'school_unread', 'vaccine']);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].priority).toBeGreaterThan(a[i - 1].priority);
    }
  });

  it('tom: plano/ações = attention; novidades + vacina = calm', () => {
    const a = composeAttention(
      baseInput({
        pendingSwaps: [{ id: 's1', requesterName: 'F' }],
        pendingExpenses: [{ id: 'e1', description: 'x' }],
        saudeUnreadCount: 1,
        vaccinePendingCount: 1,
      }),
    );
    const byKind = Object.fromEntries(a.map((i) => [i.kind, i.tone]));
    expect(byKind.swap).toBe('attention');
    expect(byKind.pending_expense).toBe('attention');
    expect(byKind.saude_unread).toBe('calm');
    expect(byKind.vaccine).toBe('calm');
  });
});
