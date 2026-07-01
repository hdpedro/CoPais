/* ------------------------------------------------------------------ */
/* brain-text-intake — extração de provas por TEXTO (assistente/áudio)  */
/*                                                                     */
/* Prova que o MESMO cérebro (parse/plan/impacto) roda a partir de um  */
/* texto do responsável, via routeTextRequest (não visão). Supabase e  */
/* o router são mockados; o playbook é REAL (pureza validada).         */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRouteText, capture } = vi.hoisted(() => ({ mockRouteText: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/ai/router", () => ({
  routeTextRequest: (...a: unknown[]) => mockRouteText(...a),
  routeVisionRequest: vi.fn(),
}));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: (...a: unknown[]) => capture(...a) }));

import { analyzeIntakeText, createAndAnalyzeText } from "@/lib/services/brain";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

/** Supabase mínimo: rpc begin_analysis devolve started; selects → []; updates → ok. */
function fakeSupabase(existing: Array<{ child_id: string; log_date: string; title: string }> = []) {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "eq", "in", "gte", "lte", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.single = async () => ({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "school_logs" ? existing : [], error: null });
    return chain;
  };
  return {
    rpc: vi.fn(async (fn: string) =>
      fn === "brain_intake_begin_analysis" ? { data: { id: "intake-1" }, error: null } : { data: null, error: null },
    ),
    from,
  };
}

function ctx(over: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    groupId: "g1",
    userId: "u1",
    channel: "pwa",
    today: "2026-07-01",
    timezone: "America/Sao_Paulo",
    children: [{ id: CHILD, name: "Otto" }],
    resolvedChildId: CHILD,
    schoolYearAnchor: 2026,
    ...over,
  } as PlaybookContext;
}

function examJson(exams: unknown[], recognized = "school_calendar") {
  return JSON.stringify({ recognized_as: recognized, school_year: 2026, exams });
}

beforeEach(() => vi.clearAllMocks());

describe("analyzeIntakeText — mesmo cérebro, origem TEXTO", () => {
  it("texto com provas → preview com as atividades", async () => {
    mockRouteText.mockResolvedValue({
      text: examJson([
        { subject: "Matemática", date: "2026-09-10", type: "prova", content: "Frações", date_confidence: 0.9, name_confidence: 0.9 },
        { subject: "Ciências", date: "2026-09-14", type: "prova", content: null, date_confidence: 0.9, name_confidence: 0.9 },
      ]),
      provider: "openai",
    });
    const r = await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "Otto tem prova de matemática dia 10/09 e ciências dia 14/09",
      ctx: ctx(),
    });
    expect(r.kind).toBe("preview");
    if (r.kind === "preview") {
      expect(r.preview.plan.activities?.length).toBe(2);
      expect(r.preview.plan.activities?.[0].startDate).toBe("2026-09-10");
    }
  });

  it("texto sem provas claras (unknown) → unknown_document (não inventa)", async () => {
    mockRouteText.mockResolvedValue({ text: examJson([], "unknown"), provider: "openai" });
    const r = await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "oi, tudo bem?",
      ctx: ctx(),
    });
    expect(r.kind).toBe("unknown_document");
  });

  it("criança ambígua (>1, não resolvida) → needs_child_selection ANTES de chamar o LLM", async () => {
    const r = await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "prova de matemática dia 10",
      ctx: ctx({ resolvedChildId: null, children: [{ id: "a", name: "Otto" }, { id: "b", name: "Martim" }] }),
    });
    expect(r.kind).toBe("needs_child_selection");
    expect(mockRouteText).not.toHaveBeenCalled();
  });

  it("manda o TEXTO do usuário + a referência de hoje pro extractor de texto", async () => {
    mockRouteText.mockResolvedValue({ text: examJson([], "unknown"), provider: "openai" });
    await analyzeIntakeText({
      supabase: fakeSupabase() as unknown as Parameters<typeof analyzeIntakeText>[0]["supabase"],
      intakeId: "intake-1",
      text: "MINHA_DESCRICAO_DE_PROVAS",
      ctx: ctx(),
    });
    expect(mockRouteText).toHaveBeenCalledTimes(1);
    const msgs = mockRouteText.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userMsg = msgs.find((m) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("MINHA_DESCRICAO_DE_PROVAS");
    expect(userMsg).toContain("2026-07-01"); // referência de hoje p/ datas relativas
  });
});

describe("createAndAnalyzeText — ambiguidade barra ANTES de criar o intake (task_7d0ff951)", () => {
  /** Supabase que registra insert/rpc pra provar que NADA foi criado. */
  function trackingSupabase() {
    const insert = vi.fn(() => chainWith());
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    function chainWith(): Record<string, unknown> {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "eq", "in", "gte", "lte", "order", "limit"]) chain[m] = () => chain;
      chain.insert = insert;
      chain.single = async () => ({ data: null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return chain;
    }
    return { supabase: { rpc, from: () => chainWith() }, insert, rpc };
  }

  it("2 crianças, nome não citado → needs_child_selection, sem intake e sem begin_analysis", async () => {
    const { supabase, insert, rpc } = trackingSupabase();
    const r = await createAndAnalyzeText({
      supabase: supabase as unknown as Parameters<typeof createAndAnalyzeText>[0]["supabase"],
      groupId: "g1",
      userId: "u1",
      channel: "pwa",
      text: "tem prova de matemática dia 10",
      children: [
        { id: "a", name: "Otto" },
        { id: "b", name: "Martim" },
      ],
      requestedChildId: null,
    });
    expect(r.kind).toBe("needs_child_selection");
    if (r.kind === "needs_child_selection") expect(r.options.length).toBe(2);
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mockRouteText).not.toHaveBeenCalled();
  });

  it("nome citado no texto resolve a criança → NÃO pergunta (cria intake e analisa)", async () => {
    mockRouteText.mockResolvedValue({ text: examJson([], "unknown"), provider: "openai" });
    const { supabase, insert } = trackingSupabase();
    const r = await createAndAnalyzeText({
      supabase: supabase as unknown as Parameters<typeof createAndAnalyzeText>[0]["supabase"],
      groupId: "g1",
      userId: "u1",
      channel: "pwa",
      text: "Otto tem prova de matemática dia 10",
      children: [
        { id: "a", name: "Otto" },
        { id: "b", name: "Martim" },
      ],
      requestedChildId: null,
    });
    // Otto citado → resolvido → segue o fluxo (cria intake, chama o extractor).
    expect(r.kind).not.toBe("needs_child_selection");
    expect(insert).toHaveBeenCalled();
  });
});
