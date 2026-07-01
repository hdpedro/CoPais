/* ------------------------------------------------------------------ */
/* brain-image-intake — CARACTERIZAÇÃO do path AO VIVO (foto → visão)   */
/*                                                                     */
/* analyzeIntakeImage é o caminho mais usado do Brain e NÃO tinha teste */
/* unitário (só o E2E de visão real, gated por chave). Estes testes     */
/* TRAVAM o comportamento (preview / unknown / parse-error / dedup /    */
/* guards de criança/concorrência) ANTES do DRY (delegar estágios 3-6   */
/* a finalizeAnalysis). O playbook é REAL; visão e supabase mockados.   */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVision, capture } = vi.hoisted(() => ({ mockVision: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/ai/router", () => ({
  routeVisionRequest: (...a: unknown[]) => mockVision(...a),
  routeTextRequest: vi.fn(),
}));
vi.mock("@/lib/ai/image-utils", () => ({
  compressImageForVision: vi.fn(async () => ({ base64: "BASE64", mimeType: "image/jpeg" })),
}));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: (...a: unknown[]) => capture(...a) }));

import { analyzeIntakeImage } from "@/lib/services/brain";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

/** Captura os updates pra inspecionar o status/erro persistido. */
function fakeSupabase(existing: Array<{ child_id: string; log_date: string; title: string }> = []) {
  const updates: Array<Record<string, unknown>> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lte", "order", "limit"]) chain[m] = () => chain;
    chain.update = (payload: Record<string, unknown>) => {
      updates.push(payload);
      return chain;
    };
    chain.insert = () => chain;
    chain.single = async () => ({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "school_logs" ? existing : [], error: null });
    return chain;
  };
  const supabase = {
    rpc: vi.fn(async (fn: string) =>
      fn === "brain_intake_begin_analysis" ? { data: { id: "intake-1" }, error: null } : { data: null, error: null },
    ),
    from,
  };
  return { supabase, updates };
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

function visionJson(exams: unknown[], recognized = "school_calendar") {
  return JSON.stringify({ recognized_as: recognized, school_year: 2026, exams });
}

const IMG = Buffer.from("fake-image-bytes");

function run(supabase: unknown, over: Partial<PlaybookContext> = {}) {
  return analyzeIntakeImage({
    supabase: supabase as Parameters<typeof analyzeIntakeImage>[0]["supabase"],
    intakeId: "intake-1",
    imageBuffer: IMG,
    ctx: ctx(over),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("analyzeIntakeImage — caracterização do path de foto", () => {
  it("visão com provas → preview com as atividades (datas preservadas)", async () => {
    mockVision.mockResolvedValue({
      text: visionJson([
        { subject: "Matemática", date: "2026-09-10", type: "prova", content: "Frações", date_confidence: 0.9, name_confidence: 0.9 },
        { subject: "Ciências", date: "2026-09-14", type: "prova", content: null, date_confidence: 0.9, name_confidence: 0.9 },
      ]),
      provider: "openai",
    });
    const { supabase } = fakeSupabase();
    const r = await run(supabase);
    expect(r.kind).toBe("preview");
    if (r.kind === "preview") {
      expect(r.preview.plan.activities?.length).toBe(2);
      expect(r.preview.plan.activities?.[0].startDate).toBe("2026-09-10");
      expect(r.preview.confirmationToken).toBeTruthy();
      expect(r.preview.planHash).toBeTruthy();
    }
    // A visão é chamada com o system/user prompt (não o de texto).
    expect(mockVision).toHaveBeenCalledTimes(1);
  });

  it("visão 'unknown' → unknown_document (não inventa) + status failed/unknown_document", async () => {
    mockVision.mockResolvedValue({ text: visionJson([], "unknown"), provider: "openai" });
    const { supabase, updates } = fakeSupabase();
    const r = await run(supabase);
    expect(r.kind).toBe("unknown_document");
    expect(updates.some((u) => u.status === "failed" && u.error === "unknown_document")).toBe(true);
  });

  it("JSON malformado da visão → error com a mensagem ESPECÍFICA DE FOTO", async () => {
    mockVision.mockResolvedValue({ text: "isto não é json {", provider: "openai" });
    const { supabase, updates } = fakeSupabase();
    const r = await run(supabase);
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      // Trava a diferença real vs finalizeAnalysis: msg fala em "foto"/"imagem".
      expect(r.message).toContain("imagem");
    }
    expect(updates.some((u) => u.status === "failed" && u.error === "vision_parse_error")).toBe(true);
  });

  it("criança ambígua (>1) → needs_child_selection ANTES de chamar a visão", async () => {
    const { supabase } = fakeSupabase();
    const r = await run(supabase, {
      resolvedChildId: null,
      children: [{ id: "a", name: "Otto" }, { id: "b", name: "Martim" }],
    });
    expect(r.kind).toBe("needs_child_selection");
    expect(mockVision).not.toHaveBeenCalled();
  });

  it("begin_analysis não trava (2ª chamada concorrente) → already_processing", async () => {
    const { supabase } = fakeSupabase();
    supabase.rpc = vi.fn(async () => ({ data: null, error: null }));
    mockVision.mockResolvedValue({ text: visionJson([]), provider: "openai" });
    const r = await run(supabase);
    expect(r.kind).toBe("already_processing");
    expect(mockVision).not.toHaveBeenCalled();
  });

  it("todas as provas já existem (mesmo aluno+data+título) → duplicate (não recria)", async () => {
    mockVision.mockResolvedValue({
      text: visionJson([
        { subject: "Matemática", date: "2026-09-10", type: "prova", content: null, date_confidence: 0.9, name_confidence: 0.9 },
      ]),
      provider: "openai",
    });
    // Espelha o título que o plano gera pra prova de Matemática (assessment_label).
    const { supabase } = fakeSupabase();
    // 1ª passada: descobre o título gerado pelo plano.
    const first = await run(supabase);
    const title = first.kind === "preview" ? (first.preview.plan.activities?.[0].name ?? "") : "";
    expect(title).toBeTruthy();
    // 2ª passada: agora o histórico já contém essa prova → duplicate.
    vi.clearAllMocks();
    mockVision.mockResolvedValue({
      text: visionJson([
        { subject: "Matemática", date: "2026-09-10", type: "prova", content: null, date_confidence: 0.9, name_confidence: 0.9 },
      ]),
      provider: "openai",
    });
    const { supabase: sb2 } = fakeSupabase([{ child_id: CHILD, log_date: "2026-09-10", title }]);
    const r = await run(sb2);
    expect(r.kind).toBe("duplicate");
  });
});
