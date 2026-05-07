/**
 * Tests for kindar-native/app/_src/lib/calendar-balance.ts — porta do
 * cálculo de saldo de dias do PWA pro native. Estes testes garantem
 * paridade com o PWA (src/lib/calendar-utils.ts) e travam regressão.
 *
 * Cenário canônico (relatado em produção em 2026-05-07): Hailla cedeu 5
 * dias ao Gustavo via debt swaps. Gustavo aceitou todos. Saldo esperado:
 * -5 / +5. Antes do fix, native mostrava 0/0 porque calculava de
 * custody_balance_operations e ignorava custody_events type='swap'.
 */
import { describe, it, expect } from "vitest";
import {
  computeSwapBalance,
  getEffectiveBalance,
  type CustodyEventRaw,
  type BalanceOperationRaw,
} from "../../kindar-native/app/_src/lib/calendar-balance";

const HAILLA = "user-hailla";
const GUSTAVO = "user-gustavo";
const PARENTS = [HAILLA, GUSTAVO];

function regularEvent(
  startDate: string,
  endDate: string,
  ownerId: string,
): CustodyEventRaw {
  return {
    id: `reg-${startDate}-${ownerId}`,
    responsible_user_id: ownerId,
    start_date: startDate,
    end_date: endDate,
    custody_type: "regular",
  };
}

function swapEvent(date: string, newOwnerId: string): CustodyEventRaw {
  return {
    id: `swap-${date}-${newOwnerId}`,
    responsible_user_id: newOwnerId,
    start_date: date,
    end_date: date,
    custody_type: "swap",
  };
}

function balanceOp(
  type: BalanceOperationRaw["operation_type"],
  status: BalanceOperationRaw["status"],
  proposerId: string,
  targetId: string,
  days = 1,
  createdAt = "2026-05-07T08:00:00Z",
): BalanceOperationRaw {
  return {
    id: `op-${type}-${createdAt}`,
    operation_type: type,
    status,
    days,
    proposed_by: proposerId,
    target_user_id: targetId,
    responded_at: status === "approved" ? createdAt : null,
    created_at: createdAt,
  };
}

describe("calendar-balance (native) — cenário Hailla/Gustavo (-5/+5 → -3/+3)", () => {
  it("estado inicial sem swaps aprovados: saldo 0/0", () => {
    // Escala original sem trocas: Hailla cuida segundas/terças, Gustavo
    // quartas/quintas. Saldo deve ser zero.
    const events = [
      regularEvent("2026-07-27", "2026-07-28", HAILLA),
      regularEvent("2026-07-29", "2026-07-30", GUSTAVO),
    ];
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-07-27",
      "2026-07-30",
    );
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
    expect(result.totalSwapDays).toBe(0);
  });

  it("Hailla cede 5 dias (debt swap, sem proposed_date) → -5/+5", () => {
    // Cenário real reproduzido: 5 swap_requests aprovados, 5
    // custody_events type='swap' criados apontando Gustavo, mantendo
    // os custody_events regular originais (Hailla) também presentes.
    // computeSwapBalance compara regular vs swap pra cada dia.
    const events = [
      // Escala regular: Hailla owns 27-jul a 02-ago (range único)
      regularEvent("2026-07-27", "2026-08-02", HAILLA),
      // 5 swaps aprovados: Gustavo passa a cuidar nesses dias
      swapEvent("2026-07-27", GUSTAVO),
      swapEvent("2026-07-29", GUSTAVO),
      swapEvent("2026-07-31", GUSTAVO),
      swapEvent("2026-08-01", GUSTAVO),
      swapEvent("2026-08-02", GUSTAVO),
    ];
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-07-27",
      "2026-08-02",
    );
    expect(result.balanceByUser[HAILLA]).toBe(-5);
    expect(result.balanceByUser[GUSTAVO]).toBe(+5);
    expect(result.totalSwapDays).toBe(5);
  });

  it("após -5/+5, Hailla pega 2 dias do Gustavo → -3/+3", () => {
    // Continuação do cenário: Hailla solicita 2 novos dias cuja guarda
    // regular era do Gustavo. Após aprovação, custody_events type='swap'
    // adicionais sao criados apontando Hailla. Saldo se move 2 unidades
    // pra cada lado (em direção ao zero).
    const events = [
      // Escala regular bilateral: Hailla owns alguns dias, Gustavo owns outros
      regularEvent("2026-07-27", "2026-08-02", HAILLA),
      regularEvent("2026-08-08", "2026-08-09", GUSTAVO),
      // 5 swaps anteriores (Gustavo cuida dos dias da Hailla)
      swapEvent("2026-07-27", GUSTAVO),
      swapEvent("2026-07-29", GUSTAVO),
      swapEvent("2026-07-31", GUSTAVO),
      swapEvent("2026-08-01", GUSTAVO),
      swapEvent("2026-08-02", GUSTAVO),
      // 2 swaps reversos (Hailla cuida dos dias do Gustavo)
      swapEvent("2026-08-08", HAILLA),
      swapEvent("2026-08-09", HAILLA),
    ];
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-07-27",
      "2026-08-09",
    );
    expect(result.balanceByUser[HAILLA]).toBe(-3); // -5 + 2
    expect(result.balanceByUser[GUSTAVO]).toBe(+3); // +5 - 2
    expect(result.totalSwapDays).toBe(7);
  });

  it("simetria: cada dia trocado movimenta exatamente 1 unidade pra cada lado", () => {
    // Garantia matemática: para qualquer N de swaps numa direção, o saldo
    // se move exatamente N. O total da família sempre soma zero.
    const events: CustodyEventRaw[] = [
      regularEvent("2026-09-01", "2026-09-30", HAILLA),
    ];
    for (let i = 1; i <= 10; i++) {
      const date = `2026-09-${String(i).padStart(2, "0")}`;
      events.push(swapEvent(date, GUSTAVO));
    }
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-09-01",
      "2026-09-30",
    );
    expect(result.balanceByUser[HAILLA]).toBe(-10);
    expect(result.balanceByUser[GUSTAVO]).toBe(+10);
    // Soma sempre zero — propriedade de conservação
    expect(
      result.balanceByUser[HAILLA] + result.balanceByUser[GUSTAVO],
    ).toBe(0);
  });

  it("regular sem swap = saldo zero (no-op)", () => {
    // Escala regular intacta, sem nenhum swap. Saldo deve ser 0/0
    // independente de quantos dias cada um tenha.
    const events = [
      regularEvent("2026-07-01", "2026-07-15", HAILLA),
      regularEvent("2026-07-16", "2026-07-31", GUSTAVO),
    ];
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-07-01",
      "2026-07-31",
    );
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
    expect(result.totalSwapDays).toBe(0);
  });

  it("swap que confirma o owner regular (no-op) não movimenta saldo", () => {
    // Edge case: swap_request foi criado mas o approve restaurou o owner
    // original (raro mas possível). Não deve contar como troca.
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", HAILLA), // mesmo owner — no-op
    ];
    const result = computeSwapBalance(
      events,
      PARENTS,
      "2026-07-28",
      "2026-07-28",
    );
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
    expect(result.totalSwapDays).toBe(0);
  });
});

describe("calendar-balance (native) — getEffectiveBalance + operações manuais", () => {
  it("waive cancela o saldo de 1 swap (concessão amigável)", () => {
    // Hailla cedeu 1 dia ao Gustavo. Combinaram que foi favor amigável.
    // Hailla propõe waive — saldo bruto -1/+1 deve voltar a 0/0.
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    expect(raw.balanceByUser[HAILLA]).toBe(-1);
    expect(raw.balanceByUser[GUSTAVO]).toBe(+1);

    const ops = [balanceOp("waive", "approved", HAILLA, GUSTAVO, 1)];
    const effective = getEffectiveBalance(raw, ops);
    expect(effective.effectiveByUser[HAILLA]).toBe(0);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(0);
  });

  it("gift_day tem o mesmo efeito do waive", () => {
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    const ops = [balanceOp("gift_day", "approved", HAILLA, GUSTAVO, 1)];
    const effective = getEffectiveBalance(raw, ops);
    expect(effective.effectiveByUser[HAILLA]).toBe(0);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(0);
  });

  it("forgive_balance reduz dívida em N dias (Gustavo perdoa Hailla)", () => {
    // Hailla cedeu 5 dias (-5/+5). Gustavo perdoa 3 dias da dívida.
    // Resultado: Hailla -2 (menos dívida), Gustavo +2 (cedeu o crédito).
    const events: CustodyEventRaw[] = [
      regularEvent("2026-07-27", "2026-08-02", HAILLA),
      swapEvent("2026-07-27", GUSTAVO),
      swapEvent("2026-07-29", GUSTAVO),
      swapEvent("2026-07-31", GUSTAVO),
      swapEvent("2026-08-01", GUSTAVO),
      swapEvent("2026-08-02", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-27", "2026-08-02");
    // Gustavo (proposer) forgives Hailla (target)
    const ops = [balanceOp("forgive_balance", "approved", GUSTAVO, HAILLA, 3)];
    const effective = getEffectiveBalance(raw, ops);
    expect(effective.effectiveByUser[HAILLA]).toBe(-2); // -5 + 3
    expect(effective.effectiveByUser[GUSTAVO]).toBe(+2); // +5 - 3
  });

  it("reset_balance zera todos os saldos", () => {
    const events: CustodyEventRaw[] = [
      regularEvent("2026-07-27", "2026-08-02", HAILLA),
      swapEvent("2026-07-27", GUSTAVO),
      swapEvent("2026-07-29", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-27", "2026-08-02");
    expect(raw.balanceByUser[HAILLA]).toBe(-2);
    const ops = [balanceOp("reset_balance", "approved", HAILLA, GUSTAVO)];
    const effective = getEffectiveBalance(raw, ops);
    expect(effective.effectiveByUser[HAILLA]).toBe(0);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(0);
  });

  it("operações pending são contadas mas não aplicadas no saldo", () => {
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    const ops = [balanceOp("waive", "pending", HAILLA, GUSTAVO, 1)];
    const effective = getEffectiveBalance(raw, ops);
    // pending não cancela — saldo continua -1/+1
    expect(effective.effectiveByUser[HAILLA]).toBe(-1);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(+1);
    expect(effective.pendingOperations).toBe(1);
  });

  it("operações rejected/cancelled são ignoradas", () => {
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    const ops = [
      balanceOp("waive", "rejected", HAILLA, GUSTAVO, 1),
      balanceOp("forgive_balance", "cancelled", GUSTAVO, HAILLA, 5),
    ];
    const effective = getEffectiveBalance(raw, ops);
    expect(effective.effectiveByUser[HAILLA]).toBe(-1);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(+1);
  });

  it("debit/credit são no-op no ledger (já refletido em custody_events)", () => {
    // debit/credit são "marcadores" que custody_events já materializou —
    // não aplicar novamente no saldo evita contagem dupla.
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    const raw = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    const ops = [
      balanceOp("debit", "approved", HAILLA, GUSTAVO, 1),
      balanceOp("credit", "approved", GUSTAVO, HAILLA, 1),
    ];
    const effective = getEffectiveBalance(raw, ops);
    // Saldo continua -1/+1 (debit/credit não dobram a contagem)
    expect(effective.effectiveByUser[HAILLA]).toBe(-1);
    expect(effective.effectiveByUser[GUSTAVO]).toBe(+1);
  });
});

describe("calendar-balance (native) — paridade matemática com PWA", () => {
  it("array vazio retorna saldo zero pra todos os parents", () => {
    const result = computeSwapBalance([], PARENTS);
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
    expect(result.totalSwapDays).toBe(0);
  });

  it("user_id desconhecido (não em parents) é ignorado", () => {
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", "user-unknown"),
    ];
    const result = computeSwapBalance(events, PARENTS, "2026-07-28", "2026-07-28");
    // unknown owner não dispara contagem
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
    expect(result.totalSwapDays).toBe(0);
  });

  it("range fora dos events retorna zero", () => {
    const events = [
      regularEvent("2026-07-28", "2026-07-28", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    // Range em outro mês — saldo é zero porque o swap não está coberto
    const result = computeSwapBalance(events, PARENTS, "2026-09-01", "2026-09-30");
    expect(result.balanceByUser[HAILLA]).toBe(0);
    expect(result.balanceByUser[GUSTAVO]).toBe(0);
  });

  it("auto-derive range quando startDate/endDate não passados", () => {
    const events = [
      regularEvent("2026-07-25", "2026-07-29", HAILLA),
      swapEvent("2026-07-28", GUSTAVO),
    ];
    // Sem range explícito — usa min(start_date) / max(end_date) dos events
    const result = computeSwapBalance(events, PARENTS);
    expect(result.balanceByUser[HAILLA]).toBe(-1);
    expect(result.balanceByUser[GUSTAVO]).toBe(+1);
    expect(result.totalSwapDays).toBe(1);
  });
});
