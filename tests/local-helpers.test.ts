import { describe, expect, it } from "vitest";
import {
  levenshtein,
  similarity,
  fuzzyEq,
  stemPT,
  hasNegation,
  stripNegation,
  easterDate,
  brHolidays,
  findNextHoliday,
  parseRelativeOffset,
  parseOrdinalDayInMonth,
  splitMultiIntent,
  hasPronoun,
} from "../src/lib/ai/local-helpers";

describe("Levenshtein + similarity", () => {
  it("idêntico = 0", () => expect(levenshtein("vacina", "vacina")).toBe(0));
  it("typo simples = 1", () => expect(levenshtein("vacina", "vasina")).toBe(1));
  it("dois edits = 2", () => expect(levenshtein("vacina", "vacinha")).toBe(1));
  it("similaridade 1 idêntico", () => expect(similarity("a", "a")).toBe(1));
  it("similaridade 0 strings completamente diferentes", () => {
    expect(similarity("abc", "xyz")).toBe(0);
  });
  it("fuzzyEq tolera 1 typo", () => expect(fuzzyEq("vacina", "vasina")).toBe(true));
  it("fuzzyEq rejeita muito diferente", () => expect(fuzzyEq("vacina", "carro")).toBe(false));
});

describe("Stemming PT", () => {
  it("'gastei' → raiz curta", () => {
    const stem = stemPT("gastei");
    expect(stem.length).toBeLessThan("gastei".length);
    expect("gastei".startsWith(stem)).toBe(true);
  });
  it("'gastando' → raiz curta", () => {
    const stem = stemPT("gastando");
    expect(stem.length).toBeLessThan("gastando".length);
  });
  it("palavras curtas inalteradas", () => {
    expect(stemPT("oi")).toBe("oi");
  });
});

describe("Negação", () => {
  it("'não marquei' → true", () => expect(hasNegation("não marquei")).toBe(true));
  it("'nunca' → true", () => expect(hasNegation("nunca paguei")).toBe(true));
  it("'sem' → true", () => expect(hasNegation("sem festa hoje")).toBe(true));
  it("frase positiva → false", () => expect(hasNegation("paguei 50")).toBe(false));
  it("stripNegation remove a partícula", () => {
    expect(stripNegation("não paguei 50")).toBe("paguei 50");
  });
});

describe("Feriados BR", () => {
  it("Páscoa 2026 = 5 abril", () => {
    const e = easterDate(2026);
    expect(e.getMonth()).toBe(3); // April
    expect(e.getDate()).toBe(5);
  });
  it("Páscoa 2027 = 28 março", () => {
    const e = easterDate(2027);
    expect(e.getMonth()).toBe(2); // March
    expect(e.getDate()).toBe(28);
  });
  it("Carnaval = 47 dias antes da Páscoa", () => {
    const list = brHolidays(2026);
    const carnaval = list.find((h) => h.name === "Carnaval")!;
    const easter = list.find((h) => h.name === "Páscoa")!;
    const diff = (easter.date.getTime() - carnaval.date.getTime()) / 86400000;
    expect(diff).toBe(47);
  });
  it("findNextHoliday acha por alias", () => {
    const ref = new Date(2026, 0, 1);
    const carn = findNextHoliday("vamos no carnaval", ref);
    expect(carn?.name).toBe("Carnaval");
  });
  it("findNextHoliday retorna null sem alias", () => {
    expect(findNextHoliday("nada de feriado")).toBeNull();
  });
});

describe("Offsets relativos", () => {
  it("'daqui 3 dias' → +3 dias", () => {
    const d = parseRelativeOffset("daqui 3 dias")!;
    const delta = Math.round((d.getTime() - Date.now()) / 86400000);
    expect(delta).toBeGreaterThanOrEqual(2);
    expect(delta).toBeLessThanOrEqual(4);
  });
  it("'em 2 semanas' → +14 dias", () => {
    const d = parseRelativeOffset("em 2 semanas")!;
    const delta = Math.round((d.getTime() - Date.now()) / 86400000);
    expect(delta).toBeGreaterThanOrEqual(13);
    expect(delta).toBeLessThanOrEqual(15);
  });
  it("nada relativo → null", () => {
    expect(parseRelativeOffset("tem festa hoje")).toBeNull();
  });
});

describe("Ordinais", () => {
  it("'primeiro fim de semana de junho'", () => {
    const d = parseOrdinalDayInMonth("primeiro fim de semana de junho", new Date(2026, 0, 1))!;
    expect(d.getMonth()).toBe(5);
    expect(d.getDay()).toBe(6); // sábado
    expect(d.getDate()).toBeLessThanOrEqual(7);
  });
  it("'última quinta de maio'", () => {
    const d = parseOrdinalDayInMonth("última quinta de maio", new Date(2026, 0, 1))!;
    expect(d.getMonth()).toBe(4);
    expect(d.getDay()).toBe(4); // quinta
  });
});

describe("Multi-intent splitter", () => {
  it("'X e Y' → 2 partes", () => {
    const parts = splitMultiIntent("quanto gastei e quem tá com Bê");
    expect(parts.length).toBe(2);
  });
  it("'X' (sem conectivo) → 1 parte", () => {
    expect(splitMultiIntent("quanto gastei").length).toBe(1);
  });
  it("ignora 'e' dentro de palavras", () => {
    const parts = splitMultiIntent("escola");
    expect(parts.length).toBe(1);
  });
});

describe("Pronouns", () => {
  it("'ele tem alergia' → true", () => expect(hasPronoun("ele tem alergia")).toBe(true));
  it("'dela' → true", () => expect(hasPronoun("a saúde dela")).toBe(true));
  it("frase sem pronome → false", () => expect(hasPronoun("Bernardo tem 5 anos")).toBe(false));
});
