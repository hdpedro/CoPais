import { describe, it, expect, beforeEach } from "vitest";
import {
  parseIntent,
  parseRelativeDate,
  parseTime,
  parseAmount,
  ParsedIntent,
} from "@/lib/ai-local-parser";

/* ------------------------------------------------------------------ */
/* Shared test fixtures                                                */
/* ------------------------------------------------------------------ */

const CHILDREN = ["Martim Silva", "Otto Silva", "Eduarda Silva"];
const MEMBERS = ["Ana Silva", "Carlos Silva"];
const LOCALE = "pt-BR";

function parse(text: string): ParsedIntent | null {
  return parseIntent(text, CHILDREN, MEMBERS, LOCALE);
}

/* ------------------------------------------------------------------ */
/* HIGH CONFIDENCE (should resolve locally, confidence >= 0.7)         */
/* ------------------------------------------------------------------ */

describe("HIGH CONFIDENCE - should resolve locally", () => {
  it("1. Marca pediatra do Martim amanha as 14h", () => {
    const r = parse("Marca pediatra do Martim amanhã às 14h");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.params.date).toBeTruthy();
    expect(r!.params.time).toBe("14:00");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("2. Registra gasto de 80 reais com escola do Otto", () => {
    const r = parse("Registra gasto de 80 reais com escola do Otto");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createExpense");
    expect(r!.params.amount).toBe("80");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("3. Gastei 150 em material escolar", () => {
    const r = parse("Gastei 150 em material escolar");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createExpense");
    expect(r!.params.amount).toBe("150");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("4. Consulta do Martim dia 15 as 10h", () => {
    const r = parse("Consulta do Martim dia 15 às 10h");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.params.time).toBe("10:00");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("5. Eduarda esta com febre 38.5", () => {
    const r = parse("Eduarda está com febre 38.5");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createHealthLog");
    expect(r!.params.childName).toBe("Eduarda Silva");
    expect(r!.params.value).toBe("38.5");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("6. Martim vomitou hoje de manha", () => {
    const r = parse("Martim vomitou hoje de manhã");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createHealthLog");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("7. Check-in: Otto dormiu bem", () => {
    const r = parse("Check-in: Otto dormiu bem");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createCheckin");
    expect(r!.params.childName).toBe("Otto Silva");
    expect(r!.params.category).toBe("sleep");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("8. Martim comeu bem no almoco", () => {
    const r = parse("Martim comeu bem no almoço");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createCheckin");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.params.category).toBe("food");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("9. Cria evento viagem casa da vovo dia 5 a 10 de abril", () => {
    const r = parse("Cria evento viagem casa da vovó dia 5 a 10 de abril");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createEvent");
    expect(r!.params.date).toBeTruthy();
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("10. Criar decisao sobre escola do Otto", () => {
    const r = parse("Criar decisão sobre escola do Otto");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createDecision");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("11. Anota que preciso comprar remedio de alergia", () => {
    const r = parse("Anota que preciso comprar remédio de alergia");
    expect(r).not.toBeNull();
    // Should be a note, NOT a health log
    expect(r!.action).toBe("createNote");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("12. Lembrete: levar documento na escola", () => {
    const r = parse("Lembrete: levar documento na escola");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createNote");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("13. Acordo: limite de 2h de tela por dia", () => {
    const r = parse("Acordo: limite de 2h de tela por dia");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAgreement");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("14. Futsal do Martim terca e quinta as 18h", () => {
    const r = parse("Futsal do Martim terça e quinta às 18h");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createActivity");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("15. Quero trocar o dia 30 de marco", () => {
    const r = parse("Quero trocar o dia 30 de março");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createSwapRequest");
    expect(r!.params.date).toBeTruthy();
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

/* ------------------------------------------------------------------ */
/* AMBIGUOUS (confidence 0.4-0.7)                                      */
/* ------------------------------------------------------------------ */

describe("AMBIGUOUS - should resolve with lower confidence", () => {
  it("16. Martim dia 15 - may return null (too ambiguous)", () => {
    const r = parse("Martim dia 15");
    // This is genuinely ambiguous — null is acceptable, but if resolved should be low confidence
    if (r !== null) {
      expect(r.confidence).toBeLessThan(0.7);
    }
  });

  it("17. Consulta amanha - appointment without child", () => {
    const r = parse("Consulta amanhã");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    expect(r!.params.childName).toBe("");
    expect(r!.params.date).toBeTruthy();
    expect(r!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("18. Evento sexta - event with day but no title", () => {
    const r = parse("Evento sexta");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createEvent");
    expect(r!.params.date).toBeTruthy();
  });

  it("19. Gastei com remedio - expense without amount", () => {
    const r = parse("Gastei com remédio");
    expect(r).not.toBeNull();
    // Should still detect expense intent even without amount
    expect(r!.confidence).toBeLessThan(0.7);
  });

  it("20. Otto esta mal - health but vague", () => {
    const r = parse("Otto está mal");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createHealthLog");
    expect(r!.params.childName).toBe("Otto Silva");
  });
});

/* ------------------------------------------------------------------ */
/* LOW CONFIDENCE (should return null, trigger Groq)                   */
/* ------------------------------------------------------------------ */

describe("LOW CONFIDENCE - should return null", () => {
  it("21. Faz aquilo", () => {
    expect(parse("Faz aquilo")).toBeNull();
  });

  it("22. Resolve isso", () => {
    expect(parse("Resolve isso")).toBeNull();
  });

  it("23. Arruma o dia", () => {
    expect(parse("Arruma o dia")).toBeNull();
  });

  it("24. Me ajuda", () => {
    expect(parse("Me ajuda")).toBeNull();
  });

  it("25. Ta bom", () => {
    expect(parse("Tá bom")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* INFORMAL LANGUAGE                                                   */
/* ------------------------------------------------------------------ */

describe("INFORMAL LANGUAGE", () => {
  it("26. mano, marca um medico pro Martim amanha", () => {
    const r = parse("mano, marca um médico pro Martim amanhã");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    expect(r!.params.childName).toBe("Martim Silva");
    expect(r!.params.date).toBeTruthy();
  });

  it("27. gastei tipo uns 100 conto com remedio", () => {
    const r = parse("gastei tipo uns 100 conto com remédio");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createExpense");
    expect(r!.params.amount).toBe("100");
  });

  it("28. acho que ele fica comigo esse finde - too vague, null is OK", () => {
    const r = parse("acho que ele fica comigo esse finde");
    // This is genuinely vague, null is acceptable
    // If resolved, should have low confidence
    if (r !== null) {
      expect(r.confidence).toBeLessThan(0.7);
    }
  });

  it("29. bota consulta dia 20 pro Otto", () => {
    const r = parse("bota consulta dia 20 pro Otto");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    expect(r!.params.childName).toBe("Otto Silva");
    expect(r!.params.date).toBeTruthy();
  });

  it("30. paguei 50 pila no uber do Martim", () => {
    const r = parse("paguei 50 pila no uber do Martim");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createExpense");
    expect(r!.params.amount).toBe("50");
  });
});

/* ------------------------------------------------------------------ */
/* EDGE CASES                                                          */
/* ------------------------------------------------------------------ */

describe("EDGE CASES", () => {
  it("31. Martinho - close to Martim but wrong, should NOT match child", () => {
    // This is just a name with no intent, so should return null
    const r = parse("Martinho");
    expect(r).toBeNull();
  });

  it("32. dia 32 de marco - invalid date", () => {
    const date = parseRelativeDate("dia 32 de março");
    // Should return empty string for invalid date
    expect(date).toBe("");
  });

  it("33. empty string - should return null", () => {
    expect(parse("")).toBeNull();
  });

  it("34. consulta consulta consulta - repetitive", () => {
    const r = parse("consulta consulta consulta");
    expect(r).not.toBeNull();
    expect(r!.action).toBe("createAppointment");
    // Should have low confidence since it's garbage
    expect(r!.confidence).toBeLessThanOrEqual(0.7);
  });

  it("35. R$ 0 reais em nada - zero expense, no expense keywords", () => {
    const r = parse("R$ 0 reais em nada");
    // No expense trigger keywords (gastei/paguei/etc.), so returns null
    expect(r).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* MULTI-INTENT                                                        */
/* ------------------------------------------------------------------ */

describe("MULTI-INTENT - parser returns only the first match", () => {
  it("36. Marca consulta e registra despesa de 50", () => {
    const r = parse("Marca consulta e registra despesa de 50");
    expect(r).not.toBeNull();
    // Should match at least one intent
    expect(["createAppointment", "createExpense"]).toContain(r!.action);
  });

  it("37. Martim tem febre e preciso marcar pediatra", () => {
    const r = parse("Martim tem febre e preciso marcar pediatra");
    expect(r).not.toBeNull();
    // Health comes first in pattern order
    expect(r!.action).toBe("createHealthLog");
    expect(r!.params.childName).toBe("Martim Silva");
  });
});

/* ------------------------------------------------------------------ */
/* DATE PARSING EDGE CASES                                             */
/* ------------------------------------------------------------------ */

describe("DATE PARSING EDGE CASES", () => {
  it("38. proxima terca-feira", () => {
    const date = parseRelativeDate("próxima terça-feira");
    expect(date).toBeTruthy();
    // Parse as local date to avoid timezone issues
    const [y, m, d] = date.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    expect(parsed.getDay()).toBe(2); // Tuesday
  });

  it("39. dia 15 de abril de 2026", () => {
    const date = parseRelativeDate("dia 15 de abril de 2026");
    expect(date).toBe("2026-04-15");
  });

  it("40. semana que vem", () => {
    const date = parseRelativeDate("semana que vem");
    expect(date).toBeTruthy();
    // Parse as local date to avoid timezone issues
    const [y, m, d] = date.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    expect(parsed.getDay()).toBe(1); // Monday
    expect(parsed > new Date()).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Additional helper function tests                                    */
/* ------------------------------------------------------------------ */

describe("parseAmount edge cases", () => {
  it("handles Brazilian thousands format R$ 1.500,00", () => {
    expect(parseAmount("R$ 1.500,00")).toBe(1500);
  });

  it("handles simple integer", () => {
    expect(parseAmount("150")).toBe(150);
  });

  it("handles R$ prefix with comma", () => {
    expect(parseAmount("R$ 120,50")).toBe(120.5);
  });

  it("handles word numbers: cem reais", () => {
    expect(parseAmount("cem reais")).toBe(100);
  });

  it("handles word numbers: duzentos reais", () => {
    expect(parseAmount("duzentos reais")).toBe(200);
  });

  it("returns 0 for no amount", () => {
    expect(parseAmount("nada")).toBe(0);
  });
});

describe("parseTime edge cases", () => {
  it("14h -> 14:00", () => {
    expect(parseTime("14h")).toBe("14:00");
  });

  it("14h30 -> 14:30", () => {
    expect(parseTime("14h30")).toBe("14:30");
  });

  it("9:30 -> 09:30", () => {
    expect(parseTime("9:30")).toBe("09:30");
  });

  it("no time -> empty", () => {
    expect(parseTime("sem horario")).toBe("");
  });
});
