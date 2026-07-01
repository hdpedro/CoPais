/* ------------------------------------------------------------------ */
/* brain-health-preview — copy pura do preview de consulta              */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { buildHealthPreviewMessage, healthSummaryParts } from "@/lib/ai/brain/health-preview";
import type { HealthVisitPlan } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

function plan(over: Partial<HealthVisitPlan> = {}): HealthVisitPlan {
  return {
    appointment: { childId: CHILD, title: "Consulta — Pediatria", appointmentType: "rotina", date: "2026-07-01", summary: "Alergia leve" },
    episode: { childId: CHILD, title: "Alergia leve", diagnosis: "Alergia leve", startDate: "2026-07-01", severity: "leve" },
    medications: [{ childId: CHILD, name: "Amoxicilina", dosage: "500 mg", frequency: "a cada 8h", frequencyHours: 8, careType: "medication", startDate: "2026-07-01" }],
    followUp: { date: "2026-08-05", notes: "retorno em 1 mês" },
    examRequests: [],
    ...over,
  };
}

describe("buildHealthPreviewMessage", () => {
  it("resume diagnóstico + medicações + retorno", () => {
    const msg = buildHealthPreviewMessage(plan(), "Otto");
    expect(msg).toContain("Otto");
    expect(msg).toContain("alergia leve");
    expect(msg).toContain("1 medicação");
    expect(msg).toContain("retorno em 05/08");
  });

  it("sem achados → mensagem simples, sem parênteses", () => {
    const msg = buildHealthPreviewMessage(plan({ episode: null, medications: [], followUp: null }), "Lia");
    expect(msg).toContain("Organizei a consulta de Lia");
    expect(msg).not.toContain("(");
  });

  it("2+ medicações usa plural", () => {
    const parts = healthSummaryParts(
      plan({ medications: [
        { childId: CHILD, name: "A", dosage: null, frequency: null, frequencyHours: null, careType: "medication", startDate: "2026-07-01" },
        { childId: CHILD, name: "B", dosage: null, frequency: null, frequencyHours: null, careType: "medication", startDate: "2026-07-01" },
      ] }),
    );
    expect(parts).toContain("2 medicações");
  });
});
