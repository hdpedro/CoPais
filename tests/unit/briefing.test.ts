import { describe, it, expect } from "vitest";
import {
  composeAttention,
  composeBriefing,
  selectHeroKind,
  type BriefingInput,
} from "@/lib/briefing";

/** Input base — tudo vazio/calmo. Cada teste sobrescreve só o que precisa. */
function baseInput(over: Partial<BriefingInput> = {}): BriefingInput {
  return {
    arrangement: "together",
    hasCustody: false,
    hasRoutineSlots: true,
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

describe("composeAttention — régua de prioridade", () => {
  it("dia tranquilo: nada pendente → lista vazia", () => {
    expect(composeAttention(baseInput())).toEqual([]);
  });

  it("inclui swap quando há pedido de troca", () => {
    const a = composeAttention(baseInput({ pendingSwaps: [{ id: "s1", requesterName: "Fernanda" }] }));
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("swap");
    expect(a[0].count).toBe(1);
    expect(a[0].data.firstName).toBe("Fernanda");
    expect(a[0].link).toBe("/calendario");
  });

  it("inclui routine_ack via pendingAck (o outro mudou, eu vejo)", () => {
    const a = composeAttention(
      baseInput({ routinePendingAck: { fromName: "Fernanda", overrideIds: ["o1"] } }),
    );
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("routine_ack");
    expect(a[0].data.fromName).toBe("Fernanda");
    expect(a[0].data.awaiting).toBe(0);
  });

  it("inclui routine_ack via awaitingTheirAck (eu mudei, aguardo ciência)", () => {
    const a = composeAttention(baseInput({ routineAwaitingTheirAck: true }));
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("routine_ack");
    expect(a[0].data.awaiting).toBe(1);
  });

  it("inclui pending_report com o primeiro como amostra + count total", () => {
    const a = composeAttention(
      baseInput({
        pendingReports: [
          { activityName: "Futsal", childName: "Otto", daysAgo: 1 },
          { activityName: "Teatro", childName: "Martim", daysAgo: 2 },
        ],
      }),
    );
    expect(a[0].kind).toBe("pending_report");
    expect(a[0].count).toBe(2);
    expect(a[0].data.activity).toBe("Futsal");
    expect(a[0].data.child).toBe("Otto");
  });

  it("inclui pending_expense agregado por count", () => {
    const a = composeAttention(
      baseInput({ pendingExpenses: [{ id: "e1", description: "Escola" }, { id: "e2", description: "Médico" }] }),
    );
    expect(a[0].kind).toBe("pending_expense");
    expect(a[0].count).toBe(2);
    expect(a[0].link).toBe("/despesas");
  });

  it("inclui pending_decision com título de amostra", () => {
    const a = composeAttention(
      baseInput({ pendingDecisions: [{ id: "d1", title: "Escola nova" }] }),
    );
    expect(a[0].kind).toBe("pending_decision");
    expect(a[0].data.title).toBe("Escola nova");
  });

  it("inclui as 3 novidades (escola/despesa/saúde) com seus counts", () => {
    const a = composeAttention(
      baseInput({ schoolUnreadCount: 2, expensesUnreadCount: 1, saudeUnreadCount: 3 }),
    );
    const byKind = Object.fromEntries(a.map((i) => [i.kind, i]));
    expect(byKind.school_unread.count).toBe(2);
    expect(byKind.expenses_unread.count).toBe(1);
    expect(byKind.saude_unread.count).toBe(3);
  });

  it("vacina entra CALMA (tone calm) com nome/data nos params", () => {
    const a = composeAttention(
      baseInput({ vaccinePendingCount: 23, vaccineNextDue: { dueDate: "2026-06-20", vaccineName: "VIP" } }),
    );
    expect(a[0].kind).toBe("vaccine");
    expect(a[0].tone).toBe("calm");
    expect(a[0].count).toBe(23);
    expect(a[0].data.vaccineName).toBe("VIP");
    expect(a[0].data.dueDate).toBe("2026-06-20");
  });

  it("ordena pela régua: o plano de hoje sobe, vacina afunda", () => {
    const a = composeAttention(
      baseInput({
        vaccinePendingCount: 5,
        schoolUnreadCount: 1,
        pendingExpenses: [{ id: "e1", description: "x" }],
        pendingReports: [{ activityName: "Futsal", childName: "Otto", daysAgo: 1 }],
        pendingSwaps: [{ id: "s1", requesterName: "Fernanda" }],
      }),
    );
    expect(a.map((i) => i.kind)).toEqual([
      "swap",
      "pending_report",
      "pending_expense",
      "school_unread",
      "vaccine",
    ]);
    // priorities estritamente crescentes
    for (let i = 1; i < a.length; i++) {
      expect(a[i].priority).toBeGreaterThan(a[i - 1].priority);
    }
  });

  it("tom: plano/ações = attention; novidades + vacina = calm", () => {
    const a = composeAttention(
      baseInput({
        pendingSwaps: [{ id: "s1", requesterName: "F" }],
        pendingExpenses: [{ id: "e1", description: "x" }],
        schoolUnreadCount: 1,
        vaccinePendingCount: 1,
      }),
    );
    const byKind = Object.fromEntries(a.map((i) => [i.kind, i.tone]));
    expect(byKind.swap).toBe("attention");
    expect(byKind.pending_expense).toBe("attention");
    expect(byKind.school_unread).toBe("calm");
    expect(byKind.vaccine).toBe("calm");
  });
});

describe("selectHeroKind — herói por forma de família", () => {
  it("separados que revezam (rotating) com guarda → herói de GUARDA", () => {
    expect(selectHeroKind({ arrangement: "rotating", hasCustody: true, hasRoutineSlots: true })).toBe("custody");
  });

  it("rotating sem guarda mas com rotina → herói de ROTINA", () => {
    expect(selectHeroKind({ arrangement: "rotating", hasCustody: false, hasRoutineSlots: true })).toBe("routine");
  });

  it("rotating sem nada → setup", () => {
    expect(selectHeroKind({ arrangement: "rotating", hasCustody: false, hasRoutineSlots: false })).toBe("setup");
  });

  it("moram juntos (together) com rotina → herói de ROTINA (guarda perde sentido)", () => {
    expect(selectHeroKind({ arrangement: "together", hasCustody: true, hasRoutineSlots: true })).toBe("routine");
  });

  it("together sem rotina mas com guarda → cai pra guarda", () => {
    expect(selectHeroKind({ arrangement: "together", hasCustody: true, hasRoutineSlots: false })).toBe("custody");
  });

  it("single sem nada → setup", () => {
    expect(selectHeroKind({ arrangement: "single", hasCustody: false, hasRoutineSlots: false })).toBe("setup");
  });

  it("custom (revezamento avançado) com guarda → guarda", () => {
    expect(selectHeroKind({ arrangement: "custom", hasCustody: true, hasRoutineSlots: false })).toBe("custody");
  });
});

describe("composeBriefing — estrutura completa", () => {
  it("dia tranquilo: calm=true, attentionCount=0, herói de rotina", () => {
    const b = composeBriefing(baseInput());
    expect(b.calm).toBe(true);
    expect(b.attentionCount).toBe(0);
    expect(b.attention).toEqual([]);
    expect(b.heroKind).toBe("routine");
  });

  it("com pendências: calm=false e count bate com a lista", () => {
    const b = composeBriefing(
      baseInput({
        pendingSwaps: [{ id: "s1", requesterName: "F" }],
        vaccinePendingCount: 2,
      }),
    );
    expect(b.calm).toBe(false);
    expect(b.attentionCount).toBe(2);
    expect(b.attention).toHaveLength(2);
    expect(b.attention[0].kind).toBe("swap");
  });

  it("separados (rotating) com guarda → heroKind custody", () => {
    const b = composeBriefing(baseInput({ arrangement: "rotating", hasCustody: true }));
    expect(b.heroKind).toBe("custody");
  });
});
