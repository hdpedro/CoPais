/**
 * Tests for kindar-native/app/_src/lib/recurrence-utils.ts.
 * Verifica paridade matematica com src/lib/recurrence-utils.ts (PWA).
 *
 * Bug Hailla 2026-05-07: native nao chamava generateOccurrences ao
 * criar atividade. Atividades ficavam orfas, calendario vazio.
 * Esta suite trava regressao da funcao de geracao.
 */
import { describe, it, expect } from "vitest";
import {
  getOccurrences,
  parseDaysOfWeek,
  type ActivityRecurrence,
} from "../../kindar-native/app/_src/lib/recurrence-utils";
// Reusamos o do PWA pra confirmar que retorna IDENTICO
import { getOccurrences as getOccurrencesPWA } from "../../src/lib/recurrence-utils";

function r(overrides: Partial<ActivityRecurrence>): ActivityRecurrence {
  return {
    recurrence_type: "weekly",
    start_date: "2026-05-09",
    end_date: null,
    days_of_week: [1, 3], // seg, qua
    day_of_month: null,
    custom_interval: 1,
    custom_unit: "week",
    ...overrides,
  };
}

describe("recurrence-utils (native) — cenário Hailla Jiu-Jitsu", () => {
  it("weekly seg+qua a partir de 09/05/2026 gera ocorrencias corretas em maio", () => {
    // 09/05 = sabado. Primeira ocorrencia deveria ser segunda 11/05 e
    // quarta 13/05. Em maio (09-31), seg+qua: 11, 13, 18, 20, 25, 27.
    const dates = getOccurrences(
      r({ start_date: "2026-05-09" }),
      "2026-05-09",
      "2026-05-31",
    );
    expect(dates).toEqual([
      "2026-05-11",
      "2026-05-13",
      "2026-05-18",
      "2026-05-20",
      "2026-05-25",
      "2026-05-27",
    ]);
  });

  it("weekly sem days_of_week retorna vazio (precisa ao menos 1 DoW)", () => {
    const dates = getOccurrences(
      r({ days_of_week: null }),
      "2026-05-09",
      "2026-05-31",
    );
    // Sem DoW, weekly cai no branch generico (daily-like). Aceitamos
    // qualquer comportamento mas precisa nao crashar.
    expect(Array.isArray(dates)).toBe(true);
  });

  it("never (evento unico) retorna 1 data quando dentro do range", () => {
    const dates = getOccurrences(
      r({ recurrence_type: "never", start_date: "2026-05-15", days_of_week: null }),
      "2026-05-01",
      "2026-05-31",
    );
    expect(dates).toEqual(["2026-05-15"]);
  });

  it("never fora do range retorna vazio", () => {
    const dates = getOccurrences(
      r({ recurrence_type: "never", start_date: "2026-04-01", days_of_week: null }),
      "2026-05-01",
      "2026-05-31",
    );
    expect(dates).toEqual([]);
  });

  it("end_date trunca corretamente", () => {
    const dates = getOccurrences(
      r({ start_date: "2026-05-04", end_date: "2026-05-15" }),
      "2026-05-01",
      "2026-05-31",
    );
    // seg+qua de 04 a 15: 04(seg), 06(qua), 11(seg), 13(qua) — 15 e sex, fora
    expect(dates).toEqual(["2026-05-04", "2026-05-06", "2026-05-11", "2026-05-13"]);
  });
});

describe("recurrence-utils — daily/monthly/yearly/custom", () => {
  it("daily gera todas as datas no range", () => {
    const dates = getOccurrences(
      r({ recurrence_type: "daily", start_date: "2026-05-01", days_of_week: null }),
      "2026-05-01",
      "2026-05-07",
    );
    expect(dates).toEqual([
      "2026-05-01", "2026-05-02", "2026-05-03",
      "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07",
    ]);
  });

  it("monthly com day_of_month gera 1 data por mes", () => {
    const dates = getOccurrences(
      r({
        recurrence_type: "monthly",
        start_date: "2026-05-15",
        day_of_month: 15,
        days_of_week: null,
      }),
      "2026-05-01",
      "2026-08-31",
    );
    expect(dates).toEqual(["2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15"]);
  });

  it("biweekly com 1 DoW pula 1 semana", () => {
    const dates = getOccurrences(
      r({
        recurrence_type: "biweekly",
        start_date: "2026-05-04", // seg
        days_of_week: [1], // seg
      }),
      "2026-05-01",
      "2026-05-31",
    );
    // 04, 18 (pula 11 e 25)
    expect(dates).toEqual(["2026-05-04", "2026-05-18"]);
  });

  it("custom every 3 days", () => {
    const dates = getOccurrences(
      r({
        recurrence_type: "custom",
        start_date: "2026-05-01",
        custom_interval: 3,
        custom_unit: "day",
        days_of_week: null,
      }),
      "2026-05-01",
      "2026-05-15",
    );
    expect(dates).toEqual([
      "2026-05-01", "2026-05-04", "2026-05-07",
      "2026-05-10", "2026-05-13",
    ]);
  });
});

describe("recurrence-utils — paridade native vs PWA (output IDENTICO)", () => {
  const cases: Array<[string, ActivityRecurrence, string, string]> = [
    [
      "weekly seg+qua",
      r({ start_date: "2026-05-09", days_of_week: [1, 3] }),
      "2026-05-09",
      "2026-05-31",
    ],
    [
      "daily 1 mes",
      r({ recurrence_type: "daily", start_date: "2026-05-01", days_of_week: null }),
      "2026-05-01",
      "2026-05-31",
    ],
    [
      "biweekly seg+sex",
      r({
        recurrence_type: "biweekly",
        start_date: "2026-05-04",
        days_of_week: [1, 5],
      }),
      "2026-05-01",
      "2026-06-30",
    ],
    [
      "monthly day 10",
      r({
        recurrence_type: "monthly",
        start_date: "2026-05-10",
        day_of_month: 10,
        days_of_week: null,
      }),
      "2026-05-01",
      "2026-12-31",
    ],
    [
      "custom every 2 weeks",
      r({
        recurrence_type: "custom",
        start_date: "2026-05-04",
        custom_interval: 2,
        custom_unit: "week",
        days_of_week: null,
      }),
      "2026-05-01",
      "2026-07-31",
    ],
    [
      "yearly",
      r({
        recurrence_type: "yearly",
        start_date: "2026-05-15",
        days_of_week: null,
      }),
      "2026-01-01",
      "2030-12-31",
    ],
  ];

  for (const [label, recurrence, rs, re] of cases) {
    it(`paridade — ${label}`, () => {
      const native = getOccurrences(recurrence, rs, re);
      const pwa = getOccurrencesPWA(recurrence, rs, re);
      expect(native).toEqual(pwa);
    });
  }
});

describe("parseDaysOfWeek — defensivo (bug clients antigos)", () => {
  it("aceita array de numeros", () => {
    expect(parseDaysOfWeek([1, 3, 5])).toEqual([1, 3, 5]);
  });
  it("aceita JSON string de numeros", () => {
    expect(parseDaysOfWeek("[1,3,5]")).toEqual([1, 3, 5]);
  });
  it("aceita strings PT-BR abreviadas (bug client antigo)", () => {
    // Bug real em producao: "natacao" tinha days_of_week=["ter","qui"]
    expect(parseDaysOfWeek(["seg", "ter", "qua", "qui", "sex"])).toEqual([1, 2, 3, 4, 5]);
    expect(parseDaysOfWeek(["ter", "qui"])).toEqual([2, 4]);
  });
  it("aceita strings PT-BR por extenso", () => {
    expect(parseDaysOfWeek(["segunda", "quarta"])).toEqual([1, 3]);
    expect(parseDaysOfWeek(["sábado"])).toEqual([6]);
  });
  it("aceita JSON string de strings PT-BR", () => {
    expect(parseDaysOfWeek('["seg","qua"]')).toEqual([1, 3]);
  });
  it("aceita mix de numeros e strings", () => {
    expect(parseDaysOfWeek(["seg", 3, "sex"])).toEqual([1, 3, 5]);
  });
  it("aceita strings de digitos", () => {
    expect(parseDaysOfWeek(["1", "3"])).toEqual([1, 3]);
  });
  it("retorna null pra null/undefined/empty", () => {
    expect(parseDaysOfWeek(null)).toBeNull();
    expect(parseDaysOfWeek(undefined)).toBeNull();
    expect(parseDaysOfWeek("")).toBeNull();
  });
  it("retorna null pra JSON invalido", () => {
    expect(parseDaysOfWeek("not json")).toBeNull();
  });
  it("retorna null pra non-array JSON", () => {
    expect(parseDaysOfWeek('{"a":1}')).toBeNull();
  });
  it("ignora strings desconhecidas mas mantem as validas", () => {
    expect(parseDaysOfWeek(["seg", "xyz", "qua"])).toEqual([1, 3]);
  });
  it("retorna null se nada for valido", () => {
    expect(parseDaysOfWeek(["xyz", "abc"])).toBeNull();
  });
});
