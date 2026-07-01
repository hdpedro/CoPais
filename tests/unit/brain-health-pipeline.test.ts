/* ------------------------------------------------------------------ */
/* brain-health-pipeline — pipeline docType-aware (texto → saúde)       */
/*                                                                     */
/* Prova que o MESMO pipeline (analyzeIntakeText → finalizeAnalysis)    */
/* roda o playbook de SAÚDE quando docType='health_visit', produzindo   */
/* um preview com plan.health (consulta+medicações+retorno). E que sem  */
/* docType o default escolar segue. Router e supabase mockados.         */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRouteText, capture } = vi.hoisted(() => ({ mockRouteText: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/ai/router", () => ({
  routeTextRequest: (...a: unknown[]) => mockRouteText(...a),
  routeVisionRequest: vi.fn(),
}));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: (...a: unknown[]) => capture(...a) }));

import { analyzeIntakeText } from "@/lib/services/brain";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

function fakeSupabase() {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "eq", "in", "gte", "lte", "order", "limit"]) chain[m] = () => chain;
    chain.single = async () => ({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: table === "school_logs" ? [] : [], error: null });
    return chain;
  };
  return {
    rpc: vi.fn(async (fn: string) => (fn === "brain_intake_begin_analysis" ? { data: { id: "intake-1" }, error: null } : { data: null, error: null })),
    from,
  };
}

function ctx(over: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    groupId: "g1", userId: "u1", channel: "pwa", today: "2026-07-01",
    timezone: "America/Sao_Paulo", children: [{ id: CHILD, name: "Otto" }],
    resolvedChildId: CHILD, schoolYearAnchor: 2026, ...over,
  } as PlaybookContext;
}

beforeEach(() => vi.clearAllMocks());

describe("pipeline docType-aware — SAÚDE", () => {
  it("docType='health_visit' → playbook de saúde → preview com plan.health", async () => {
    mockRouteText.mockResolvedValue({
      provider: "openai",
      text: JSON.stringify({
        recognized_as: "health_visit",
        consultation_date: "2026-07-01",
        appointment: { type: "rotina", specialty: "Pediatria", summary: "Alergia leve, observar" },
        diagnosis: "Alergia leve",
        symptoms: ["coceira"],
        severity: "leve",
        medications: [{ name: "Amoxicilina", dosage: "500 mg", frequency: "a cada 8h", duration_days: 7, care_type: "medication" }],
        follow_up: { date: null, raw: "retorno em 1 mês" },
        exam_requests: [],
      }),
    });
    const r = await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "consulta do Otto foi boa, alergia leve, amoxicilina 500 a cada 8h por 7 dias, retorno em 1 mês",
      ctx: ctx(),
      docType: "health_visit",
    });
    expect(r.kind).toBe("preview");
    if (r.kind === "preview") {
      expect(r.preview.docType).toBe("health_visit");
      expect(r.preview.plan.health?.appointment.title).toBe("Consulta — Pediatria");
      expect(r.preview.plan.health?.medications?.[0].name).toBe("Amoxicilina");
      expect(r.preview.plan.health?.episode?.diagnosis).toBe("Alergia leve");
      // "retorno em 1 mês" (relativo) resolvido contra a consulta (01/07 + 30d).
      expect(r.preview.plan.health?.followUp?.date).toBe("2026-07-31");
    }
    // O prompt de TEXTO de saúde foi usado (com a referência de hoje, sem "ano letivo").
    const msgs = mockRouteText.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userMsg = msgs.find((m) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("2026-07-01");
    expect(userMsg).not.toContain("ano letivo");
  });

  it("sem docType → default escolar (não vira saúde)", async () => {
    mockRouteText.mockResolvedValue({
      provider: "openai",
      text: JSON.stringify({ recognized_as: "health_visit", appointment: { type: "rotina" } }),
    });
    const r = await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "qualquer coisa",
      ctx: ctx(),
    });
    // Playbook escolar não reconhece 'health_visit' → unknown_document (não vira saúde).
    expect(r.kind).toBe("unknown_document");
  });
});
