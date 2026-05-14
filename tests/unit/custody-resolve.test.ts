/**
 * Testes do helper de resolução de custody (src/lib/custody-resolve.ts).
 *
 * Espelha a view SQL `custody_resolved` (migration 00079) — regra:
 *   swap > exception > regular, tie-break por created_at DESC.
 *
 * Cobre o bug Barata 2026-05-14 (iOS): "PRÓXIMA TROCA · AMANDA" mostrado
 * no card quando havia swap aprovado pra próximo fim de semana fazendo
 * Barata ficar com Bernardo.
 */

import { describe, it, expect } from "vitest";
import {
  custodyPriority,
  pickCustodyWinner,
  resolveCustodyOnDate,
  findNextCustodyHandover,
  resolveTodayCustody,
  type CustodyEvent,
} from "@/lib/custody-resolve";

function ev(p: Partial<CustodyEvent> & { id: string; custody_type: string }): CustodyEvent {
  return {
    id: p.id,
    child_id: p.child_id ?? "c1",
    start_date: p.start_date ?? "2026-05-15",
    end_date: p.end_date ?? "2026-05-15",
    responsible_user_id: p.responsible_user_id ?? "u1",
    custody_type: p.custody_type,
    created_at: p.created_at ?? null,
  };
}

describe("custodyPriority", () => {
  it("swap < exception < regular < outro", () => {
    expect(custodyPriority("swap")).toBeLessThan(custodyPriority("exception"));
    expect(custodyPriority("exception")).toBeLessThan(custodyPriority("regular"));
    expect(custodyPriority("regular")).toBeLessThan(custodyPriority("special"));
  });
});

describe("pickCustodyWinner", () => {
  it("swap vence regular pro mesmo dia", () => {
    const swap = ev({ id: "s", custody_type: "swap", responsible_user_id: "barata" });
    const reg = ev({ id: "r", custody_type: "regular", responsible_user_id: "amanda" });
    expect(pickCustodyWinner([reg, swap])?.id).toBe("s");
    expect(pickCustodyWinner([swap, reg])?.id).toBe("s");
  });

  it("exception vence regular", () => {
    const exc = ev({ id: "e", custody_type: "exception" });
    const reg = ev({ id: "r", custody_type: "regular" });
    expect(pickCustodyWinner([reg, exc])?.id).toBe("e");
  });

  it("swap vence exception", () => {
    const swap = ev({ id: "s", custody_type: "swap" });
    const exc = ev({ id: "e", custody_type: "exception" });
    expect(pickCustodyWinner([exc, swap])?.id).toBe("s");
  });

  it("dois swaps no mesmo dia → tie-break por created_at DESC", () => {
    const old = ev({ id: "o", custody_type: "swap", created_at: "2026-05-01T10:00:00Z" });
    const new_ = ev({ id: "n", custody_type: "swap", created_at: "2026-05-12T10:00:00Z" });
    expect(pickCustodyWinner([old, new_])?.id).toBe("n");
    expect(pickCustodyWinner([new_, old])?.id).toBe("n");
  });

  it("array vazio retorna undefined", () => {
    expect(pickCustodyWinner([])).toBeUndefined();
  });

  it("array com 1 item retorna ele", () => {
    const only = ev({ id: "x", custody_type: "regular" });
    expect(pickCustodyWinner([only])?.id).toBe("x");
  });
});

describe("resolveCustodyOnDate", () => {
  it("filtra por child_id + cobertura de data", () => {
    const events: CustodyEvent[] = [
      ev({ id: "a", child_id: "c1", custody_type: "regular", start_date: "2026-05-10", end_date: "2026-05-20", responsible_user_id: "amanda" }),
      ev({ id: "b", child_id: "c2", custody_type: "swap", start_date: "2026-05-15", end_date: "2026-05-15", responsible_user_id: "barata" }),
    ];
    expect(resolveCustodyOnDate(events, "c1", "2026-05-15")?.id).toBe("a");
    expect(resolveCustodyOnDate(events, "c2", "2026-05-15")?.id).toBe("b");
    expect(resolveCustodyOnDate(events, "c1", "2026-05-25")).toBeNull();
  });

  it("aplica prioridade quando há swap+regular cobrindo o mesmo dia", () => {
    const events: CustodyEvent[] = [
      ev({ id: "reg", custody_type: "regular", start_date: "2026-05-10", end_date: "2026-05-21", responsible_user_id: "amanda" }),
      ev({ id: "swp", custody_type: "swap", start_date: "2026-05-15", end_date: "2026-05-17", responsible_user_id: "barata" }),
    ];
    // 15-17 swap (Barata) — bug original retornaria Amanda
    expect(resolveCustodyOnDate(events, "c1", "2026-05-15")?.responsible_user_id).toBe("barata");
    expect(resolveCustodyOnDate(events, "c1", "2026-05-16")?.responsible_user_id).toBe("barata");
    expect(resolveCustodyOnDate(events, "c1", "2026-05-17")?.responsible_user_id).toBe("barata");
    // 14 e 18-21 só tem regular → Amanda
    expect(resolveCustodyOnDate(events, "c1", "2026-05-14")?.responsible_user_id).toBe("amanda");
    expect(resolveCustodyOnDate(events, "c1", "2026-05-18")?.responsible_user_id).toBe("amanda");
  });
});

describe("findNextCustodyHandover — regression do bug Barata", () => {
  // Cenário do bug:
  //   Hoje (qui 14/mai): Bernardo com Barata via swap
  //   Regular escala: 08-21/mai → Amanda (escala dela)
  //   Swap aprovado (sex 15-dom 17): Barata fica com Bernardo
  //   ESPERADO: próxima troca acontece SEG 18/mai (Amanda retoma)
  //   BUG ORIGINAL: card mostrava SEX 15 · AMANDA (regular vencia)
  const TODAY = "2026-05-14";
  const REGULAR_FULL = ev({
    id: "reg",
    custody_type: "regular",
    start_date: "2026-05-08",
    end_date: "2026-05-21",
    responsible_user_id: "amanda",
  });
  const SWAP_TODAY = ev({
    id: "swap-today",
    custody_type: "swap",
    start_date: TODAY,
    end_date: TODAY,
    responsible_user_id: "barata",
  });
  const SWAP_WEEKEND = ev({
    id: "swap-weekend",
    custody_type: "swap",
    start_date: "2026-05-15",
    end_date: "2026-05-17",
    responsible_user_id: "barata",
  });

  it("hoje resolvido pra Barata (swap > regular)", () => {
    const today = resolveTodayCustody([REGULAR_FULL, SWAP_TODAY], TODAY);
    expect(today.get("c1")?.responsible_user_id).toBe("barata");
  });

  it("próxima troca pula sex 15 (continua Barata via swap) e cai em seg 18 (Amanda)", () => {
    const events = [REGULAR_FULL, SWAP_TODAY, SWAP_WEEKEND];
    const handover = findNextCustodyHandover(events, "c1", TODAY, "barata");
    expect(handover).not.toBeNull();
    // Bug original retornava 2026-05-15 com Amanda. Fix tem que retornar
    // o primeiro dia onde regular retoma — segunda 18/mai.
    expect(handover!.dateKey).toBe("2026-05-18");
    expect(handover!.event.responsible_user_id).toBe("amanda");
  });

  it("sem swap futuro, próxima troca é sex 15 (Amanda assume normalmente)", () => {
    // Mesmo cenário mas SEM swap_weekend (só hoje foi swap, restante regular)
    const events = [REGULAR_FULL, SWAP_TODAY];
    const handover = findNextCustodyHandover(events, "c1", TODAY, "barata");
    expect(handover).not.toBeNull();
    expect(handover!.dateKey).toBe("2026-05-15"); // amanhã retoma regular
    expect(handover!.event.responsible_user_id).toBe("amanda");
  });

  it("retorna null se ninguém difere no horizonte", () => {
    // Só Barata, sempre
    const onlyBarata = ev({
      id: "x",
      custody_type: "regular",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      responsible_user_id: "barata",
    });
    const handover = findNextCustodyHandover([onlyBarata], "c1", TODAY, "barata");
    expect(handover).toBeNull();
  });
});

describe("resolveTodayCustody — multi-criança", () => {
  it("resolve winner por criança aplicando prioridade", () => {
    const TODAY = "2026-05-14";
    const events: CustodyEvent[] = [
      // Bernardo: swap + regular hoje → swap wins (Barata)
      ev({ id: "b-reg", child_id: "bernardo", custody_type: "regular", start_date: "2026-05-08", end_date: "2026-05-21", responsible_user_id: "amanda" }),
      ev({ id: "b-swap", child_id: "bernardo", custody_type: "swap", start_date: TODAY, end_date: TODAY, responsible_user_id: "barata" }),
      // Outra criança só regular
      ev({ id: "o-reg", child_id: "outra", custody_type: "regular", start_date: "2026-05-08", end_date: "2026-05-21", responsible_user_id: "amanda" }),
    ];
    const today = resolveTodayCustody(events, TODAY);
    expect(today.get("bernardo")?.responsible_user_id).toBe("barata");
    expect(today.get("outra")?.responsible_user_id).toBe("amanda");
  });

  it("não inclui criança sem evento hoje", () => {
    const events: CustodyEvent[] = [
      ev({ id: "a", child_id: "c1", custody_type: "regular", start_date: "2026-05-08", end_date: "2026-05-13", responsible_user_id: "amanda" }),
    ];
    // today=14/mai, evento termina 13 → não cobre
    const today = resolveTodayCustody(events, "2026-05-14");
    expect(today.size).toBe(0);
  });
});
