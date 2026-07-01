/* Gate conservador do assistente: quando um texto livre VIRA captura de provas
 * (vs. conversa/pergunta). Puro. A extração por IA é a decisão final — este é
 * só o filtro barato pra não chamar o Brain em toda mensagem. */
import { describe, it, expect } from "vitest";
import { looksLikeExamText, matchOneChildOption } from "@/components/AIAssistant";

describe("looksLikeExamText — captura de provas por texto (conservador)", () => {
  it("reconhece descrições de provas (palavra de prova + sinal de data)", () => {
    for (const s of [
      "Otto tem prova de matemática dia 10/09 e ciências dia 14/09",
      "provas AV2: matemática 12/08, história 14/08",
      "trabalho de ciências dia 20 de agosto",
      "Martim: prova de português 05/09 e simulado 12/09",
    ]) {
      expect(looksLikeExamText(s)).toBe(true);
    }
  });

  it("NÃO captura PERGUNTAS sobre provas (caem no chat)", () => {
    for (const s of [
      "quando é a prova do Martim?",
      "tem prova amanhã?",
      "qual dia é a prova de matemática?",
      "que dia tem prova?",
    ]) {
      expect(looksLikeExamText(s)).toBe(false);
    }
  });

  it("NÃO captura texto sem palavra de prova nem sinal de data", () => {
    for (const s of [
      "reunião de pais dia 10/09", // data, mas sem prova
      "tem prova de matemática essa semana", // prova, mas sem data concreta
      "oi, tudo bem?",
      "gastei 50 no mercado",
      "prova", // curto demais / sem data
    ]) {
      expect(looksLikeExamText(s)).toBe(false);
    }
  });

  it("limites de tamanho (nada absurdo)", () => {
    expect(looksLikeExamText("")).toBe(false);
    expect(looksLikeExamText("prova 10/09 " + "x".repeat(700))).toBe(false);
  });
});

describe("matchOneChildOption — resposta DIGITADA a 'de qual criança?'", () => {
  const opts = [{ id: "otto", name: "Otto" }, { id: "martim", name: "Martim Silva" }];

  it("nome digitado (sozinho OU numa frase) resolve a criança", () => {
    expect(matchOneChildOption("Otto", opts)?.id).toBe("otto");
    expect(matchOneChildOption("é o Martim", opts)?.id).toBe("martim");
    // O caso do dono: digitou a criança + descreveu as provas → resolve.
    expect(matchOneChildOption("Otto tem prova de matemática dia 10/09", opts)?.id).toBe("otto");
  });

  it("acento/caixa não atrapalham", () => {
    expect(matchOneChildOption("prova da MÁRTIM", [{ id: "m", name: "Mártim" }])?.id).toBe("m");
  });

  it("nenhum nome / dois nomes / palavra dentro de outra → null (pergunta segue)", () => {
    expect(matchOneChildOption("não sei", opts)).toBeNull();
    expect(matchOneChildOption("Otto e Martim", opts)).toBeNull();
    expect(matchOneChildOption("a banana", [{ id: "a", name: "Ana" }])).toBeNull();
    expect(matchOneChildOption("", opts)).toBeNull();
  });
});
