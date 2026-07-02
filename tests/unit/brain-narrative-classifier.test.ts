/* ------------------------------------------------------------------ */
/* Porta única (N3c): parse PURO da classificação de narrativa —        */
/* tolerante a lixo, clampa confiança, tipo inválido não passa, no      */
/* máximo 2 intenções. Falha SEMPRE degrada pra none (cai no chat).     */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { parseNarrativeClassification } from "@/lib/ai/document-classifier";

describe("parseNarrativeClassification", () => {
  it("resposta válida com 2 intenções ordenadas", () => {
    const r = parseNarrativeClassification(
      '{"intents":[{"type":"health_visit","confidence":0.9},{"type":"custody_routine","confidence":0.7}]}',
    );
    expect(r.intents).toEqual([
      { type: "health_visit", confidence: 0.9 },
      { type: "custody_routine", confidence: 0.7 },
    ]);
  });

  it("cercas ```json e prosa em volta são toleradas", () => {
    const r = parseNarrativeClassification(
      'Claro! ```json\n{"intents":[{"type":"school_calendar","confidence":0.8}]}\n``` fim',
    );
    expect(r.intents[0]).toEqual({ type: "school_calendar", confidence: 0.8 });
  });

  it("tipo inválido é descartado; sem intents válidas → none", () => {
    const r = parseNarrativeClassification('{"intents":[{"type":"expense","confidence":0.9}]}');
    expect(r.intents).toEqual([{ type: "none", confidence: 0 }]);
  });

  it("confiança fora do range clampa; ausente vira 0", () => {
    const r = parseNarrativeClassification(
      '{"intents":[{"type":"custody_routine","confidence":7},{"type":"health_visit"}]}',
    );
    expect(r.intents[0].confidence).toBe(1);
    expect(r.intents[1].confidence).toBe(0);
  });

  it("máx 2 intenções (extras ignoradas)", () => {
    const r = parseNarrativeClassification(
      '{"intents":[{"type":"school_calendar","confidence":0.9},{"type":"health_visit","confidence":0.8},{"type":"custody_routine","confidence":0.7}]}',
    );
    expect(r.intents).toHaveLength(2);
  });

  it("lixo/JSON quebrado/vazio → none (nunca lança)", () => {
    expect(parseNarrativeClassification("não sei").intents).toEqual([{ type: "none", confidence: 0 }]);
    expect(parseNarrativeClassification('{"intents":').intents).toEqual([{ type: "none", confidence: 0 }]);
    expect(parseNarrativeClassification("").intents).toEqual([{ type: "none", confidence: 0 }]);
  });
});
