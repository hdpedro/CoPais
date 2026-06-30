import { describe, it, expect } from "vitest";
import {
  isCalendarIntent,
  parseKeepIndices,
  renderPreview,
  renderExecuted,
  renderUndone,
} from "@/lib/whatsapp/brain-flow";
import type { ActivitySpec, IntakePreview } from "@/lib/ai/brain/types";

describe("isCalendarIntent", () => {
  it("reconhece slash/keyword de calendário", () => {
    expect(isCalendarIntent("/calendario")).toBe(true);
    expect(isCalendarIntent("/escola")).toBe(true);
    expect(isCalendarIntent("provas")).toBe(true);
    expect(isCalendarIntent("AV2")).toBe(true);
  });
  it("reconhece linguagem natural", () => {
    expect(isCalendarIntent("calendário de provas")).toBe(true);
    expect(isCalendarIntent("calendário de AV2 da Eduarda")).toBe(true);
    expect(isCalendarIntent("cronograma de provas do 3º ano")).toBe(true);
  });
  it("NÃO sequestra recibo/receita/vazio (conservador)", () => {
    expect(isCalendarIntent("")).toBe(false);
    expect(isCalendarIntent(undefined)).toBe(false);
    expect(isCalendarIntent("receita")).toBe(false);
    expect(isCalendarIntent("recibo da farmácia")).toBe(false);
    expect(isCalendarIntent("foto do boleto")).toBe(false);
  });
});

describe("parseKeepIndices (total=5)", () => {
  it("'confirmar'/'todas'/'sim' → mantém todas", () => {
    expect(parseKeepIndices("confirmar", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseKeepIndices("todas", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseKeepIndices("sim, pode criar", 5)).toEqual([0, 1, 2, 3, 4]);
  });
  it("'tirar/remover/sem N' → remove esses, mantém o resto", () => {
    expect(parseKeepIndices("tirar 2 e 4", 5)).toEqual([0, 2, 4]);
    expect(parseKeepIndices("remover 2,4", 5)).toEqual([0, 2, 4]);
    expect(parseKeepIndices("sem o 3", 5)).toEqual([0, 1, 3, 4]);
  });
  it("'manter/só N' ou só números → mantém exatamente esses", () => {
    expect(parseKeepIndices("manter 1 e 3", 5)).toEqual([0, 2]);
    expect(parseKeepIndices("só 1 e 3", 5)).toEqual([0, 2]);
    expect(parseKeepIndices("1 3", 5)).toEqual([0, 2]);
  });
  it("números fora do intervalo são ignorados; sem entender → null", () => {
    expect(parseKeepIndices("tirar 10", 5)).toBeNull(); // 10 fora → sem números válidos
    expect(parseKeepIndices("blá blá", 5)).toBeNull();
    expect(parseKeepIndices("", 5)).toBeNull();
    expect(parseKeepIndices("manter 7", 3)).toBeNull();
  });
  it("total inválido → null", () => {
    expect(parseKeepIndices("confirmar", 0)).toBeNull();
  });
});

function act(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return { childId: "c1", name: "Prova", category: "school", startDate: "2026-08-12", ...over };
}

const PREVIEW: IntakePreview = {
  intakeId: "i1",
  docType: "school_calendar",
  confirmation: "single",
  planHash: "h",
  confirmationToken: "tok",
  priority: { level: "important", delivery: "digest" },
  impacts: [
    {
      kind: "tight_sequence",
      severity: "info",
      date: "2026-08-12",
      childId: "c1",
      titleKey: "brain.impact.tightSequenceRun",
      titleVars: { childId: "c1", date1: "2026-08-12", date2: "2026-08-14", count: 3 },
    },
  ],
  plan: {
    docType: "school_calendar",
    confirmation: "single",
    activities: [
      act({ name: "Prova de Matemática", startDate: "2026-08-12", timeStart: "08:00", notes: "Cap. 7" }),
      act({ name: "Prova de História", startDate: "2026-08-13" }),
    ],
  },
};

describe("renderPreview", () => {
  const t = (k: string, v?: Record<string, unknown>) => `${k}|${v?.child}|${v?.count}|${v?.date1}-${v?.date2}`;

  it("numera as provas com data/hora/conteúdo + impacto resolvido + CTA", () => {
    const msg = renderPreview(PREVIEW, "Eduarda", t);
    expect(msg).toContain("Encontrei 2 provas para Eduarda:");
    expect(msg).toContain("1. *Prova de Matemática* — 12/08 08:00 · Cap. 7");
    expect(msg).toContain("2. *Prova de História* — 13/08");
    // impacto via t, com nome resolvido e datas em DD/MM
    expect(msg).toContain("brain.impact.tightSequenceRun|Eduarda|3|12/08-14/08");
    expect(msg).toContain("*Confirmar*");
    expect(msg).toContain("*Escolher*");
    expect(msg).toContain("*Cancelar*");
  });

  it("singular quando há 1 prova", () => {
    const single: IntakePreview = {
      ...PREVIEW,
      impacts: [],
      plan: { ...PREVIEW.plan, activities: [act({ name: "Prova de Ciências", startDate: "2026-09-01" })] },
    };
    const msg = renderPreview(single, "Joao", t);
    expect(msg).toContain("Encontrei 1 prova para Joao:");
    expect(msg).toContain("1. *Prova de Ciências* — 01/09");
  });
});

describe("renderExecuted / renderUndone", () => {
  it("plural/singular corretos", () => {
    expect(renderExecuted(2)).toContain("2 provas");
    expect(renderExecuted(1)).toContain("1 prova");
    expect(renderExecuted(2)).toContain("Desfazer");
    expect(renderUndone(3)).toContain("3 provas");
    expect(renderUndone(1)).toContain("1 prova");
  });
});
