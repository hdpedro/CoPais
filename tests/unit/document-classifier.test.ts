import { describe, it, expect, vi } from "vitest";

// O módulo é server-only + puxa router/image-utils no topo. Mockamos as deps
// pesadas de I/O (só testamos o parse PURO, sem chamada de visão).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/router", () => ({ routeVisionRequest: vi.fn() }));
vi.mock("@/lib/ai/image-utils", () => ({ compressImageForVision: vi.fn() }));

const { parseClassification } = await import("@/lib/ai/document-classifier");

describe("parseClassification — tolerante e seguro", () => {
  it("JSON limpo", () => {
    expect(parseClassification('{"type":"school_calendar","confidence":0.9}')).toEqual({
      type: "school_calendar",
      confidence: 0.9,
    });
  });
  it("cercado em ```json", () => {
    expect(parseClassification('```json\n{"type":"receipt","confidence":0.82}\n```')).toEqual({
      type: "receipt",
      confidence: 0.82,
    });
  });
  it("com prosa em volta → pega o 1º objeto", () => {
    expect(parseClassification('Claro: {"type":"exam","confidence":0.7} pronto')).toEqual({
      type: "exam",
      confidence: 0.7,
    });
  });
  it("tipo inválido → unknown", () => {
    expect(parseClassification('{"type":"foo","confidence":0.9}').type).toBe("unknown");
  });
  it("medical_summary é reconhecido (resumo de consulta / pedido de exame)", () => {
    expect(parseClassification('{"type":"medical_summary","confidence":0.88}')).toEqual({
      type: "medical_summary",
      confidence: 0.88,
    });
  });
  it("confidence ausente → 0.5 se tipo conhecido; clamp em [0,1]", () => {
    expect(parseClassification('{"type":"receipt"}').confidence).toBe(0.5);
    expect(parseClassification('{"type":"receipt","confidence":1.5}').confidence).toBe(1);
    expect(parseClassification('{"type":"receipt","confidence":-3}').confidence).toBe(0);
  });
  it("lixo/vazio → unknown/0 (nunca lança)", () => {
    expect(parseClassification("não é json")).toEqual({ type: "unknown", confidence: 0 });
    expect(parseClassification("")).toEqual({ type: "unknown", confidence: 0 });
  });
});
