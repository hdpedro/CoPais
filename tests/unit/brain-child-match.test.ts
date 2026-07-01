import { describe, it, expect } from "vitest";
import { resolveChildIdFromText } from "@/lib/ai/brain/child-match";
import type { BrainChild } from "@/lib/ai/brain/types";

const kids: BrainChild[] = [
  { id: "otto", name: "Otto Pedro" },
  { id: "martim", name: "Martim Silva" },
];

describe("resolveChildIdFromText — resolve criança citada no texto (conservador)", () => {
  it("nome citado (1 criança) → resolve sem perguntar", () => {
    expect(resolveChildIdFromText("Otto tem prova de matemática dia 10/09", kids)).toBe("otto");
    expect(resolveChildIdFromText("prova de história do Martim dia 12", kids)).toBe("martim");
  });

  it("acento e caixa não atrapalham", () => {
    expect(resolveChildIdFromText("a prova da MÁRTIM é quarta", [{ id: "m", name: "Mártim" }])).toBe("m");
  });

  it("nenhum nome citado → null (pergunta)", () => {
    expect(resolveChildIdFromText("tem prova de matemática dia 10 e ciências dia 14", kids)).toBeNull();
    expect(resolveChildIdFromText("", kids)).toBeNull();
  });

  it("DOIS nomes citados → null (ambíguo, pergunta)", () => {
    expect(resolveChildIdFromText("Otto e Martim têm prova dia 10", kids)).toBeNull();
  });

  it("palavra inteira: não casa nome dentro de outra palavra", () => {
    expect(resolveChildIdFromText("a banana da prova", [{ id: "a", name: "Ana" }])).toBeNull();
    expect(resolveChildIdFromText("Ana tem prova", [{ id: "a", name: "Ana" }])).toBe("a");
  });

  it("nome de 1 letra é ignorado (evita colisão)", () => {
    expect(resolveChildIdFromText("prova dia 10 e o resto", [{ id: "x", name: "O" }])).toBeNull();
  });
});
