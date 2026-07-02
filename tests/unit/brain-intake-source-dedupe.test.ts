/* ------------------------------------------------------------------ */
/* Wiring do dedupe L1 em createAndAnalyzeText/Intake: o reenvio do      */
/* MESMO conteúdo curto-circuita ANTES de criar intake e de gastar IA    */
/* (visão/texto NUNCA são chamados nos caminhos deduplicados), e a       */
/* corrida no INSERT (23505 do índice parcial) vira "já processando".    */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVision, mockText } = vi.hoisted(() => ({ mockVision: vi.fn(), mockText: vi.fn() }));

vi.mock("@/lib/ai/router", () => ({
  routeVisionRequest: (...a: unknown[]) => mockVision(...a),
  routeTextRequest: (...a: unknown[]) => mockText(...a),
}));
vi.mock("@/lib/ai/image-utils", () => ({
  compressImageForVision: vi.fn(async () => ({ base64: "B64", mimeType: "image/jpeg" })),
}));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));

import { createAndAnalyzeText, createAndAnalyzeIntake } from "@/lib/services/brain";
import type { BrainChild } from "@/lib/ai/brain/types";

const CHILD: BrainChild = { id: "11111111-1111-1111-1111-111111111111", name: "Otto" };

interface FakeOpts {
  /** Linha devolvida pela query do dedupe (maybeSingle). */
  prior?: Record<string, unknown> | null;
  /** Erro injetado no INSERT de brain_intakes. */
  insertError?: { code?: string; message?: string } | null;
}

/** Fake mínimo: brain_intakes (maybeSingle do dedupe + insert) e
 *  coparenting_groups (timezone). Registra se o INSERT foi tentado. */
function fakeSupabase(opts: FakeOpts = {}) {
  const state = { insertAttempts: 0, dedupeQueries: 0 };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lte", "order", "limit", "neq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => {
      state.dedupeQueries += 1;
      return { data: opts.prior ?? null, error: null };
    };
    chain.single = async () => {
      if (table === "coparenting_groups") return { data: { timezone: "America/Sao_Paulo" }, error: null };
      if (table === "brain_intakes") {
        state.insertAttempts += 1;
        if (opts.insertError) return { data: null, error: opts.insertError };
        return { data: { id: "intake-new" }, error: null };
      }
      return { data: null, error: null };
    };
    chain.insert = () => chain;
    chain.update = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  const supabase = {
    from,
    rpc: vi.fn(async () => ({ data: { id: "intake-new" }, error: null })),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  return { supabase, state };
}

function textArgs(supabase: unknown) {
  return {
    supabase: supabase as never,
    groupId: "g1",
    userId: "u1",
    channel: "pwa" as const,
    text: "A consulta do Otto foi boa, a pediatra pediu retorno dia 5 de agosto.",
    children: [CHILD],
    requestedChildId: CHILD.id,
    docType: "health_visit" as const,
  };
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const JUST_NOW = new Date(Date.now() - 10_000).toISOString();

const AWAITING_PRIOR = {
  id: "prior-1",
  status: "awaiting_confirmation",
  created_at: JUST_NOW,
  confirmation_expires_at: FUTURE,
  plan: { docType: "health_visit", confirmation: "single", activities: [] },
  plan_hash: "hash-prior",
  confirmation_token: "tok-prior",
  doc_type: "health_visit",
  impacts: [],
};

describe("createAndAnalyzeText — dedupe L1 por conteúdo", () => {
  beforeEach(() => {
    mockVision.mockReset();
    mockText.mockReset();
  });

  it("anterior EXECUTADO → duplicate, sem INSERT e sem IA", async () => {
    const { supabase, state } = fakeSupabase({ prior: { ...AWAITING_PRIOR, status: "executed" } });
    const r = await createAndAnalyzeText(textArgs(supabase));
    expect(r.kind).toBe("duplicate");
    if (r.kind === "duplicate") {
      expect(r.priorIntakeId).toBe("prior-1");
      expect(r.message).toContain("já foi registrado");
    }
    expect(state.insertAttempts).toBe(0);
    expect(mockText).not.toHaveBeenCalled();
  });

  it("anterior AGUARDANDO → reusa a MESMA prévia (token/hash), sem IA", async () => {
    const { supabase, state } = fakeSupabase({ prior: AWAITING_PRIOR });
    const r = await createAndAnalyzeText(textArgs(supabase));
    expect(r.kind).toBe("preview");
    if (r.kind === "preview") {
      expect(r.preview.intakeId).toBe("prior-1");
      expect(r.preview.confirmationToken).toBe("tok-prior");
      expect(r.preview.planHash).toBe("hash-prior");
    }
    expect(state.insertAttempts).toBe(0);
    expect(mockText).not.toHaveBeenCalled();
  });

  it("anterior EM VOO fresco → already_processing (coparente/duplo toque), sem IA", async () => {
    const { supabase, state } = fakeSupabase({ prior: { ...AWAITING_PRIOR, status: "analyzing" } });
    const r = await createAndAnalyzeText(textArgs(supabase));
    expect(r).toEqual({ kind: "already_processing", intakeId: "prior-1" });
    expect(state.insertAttempts).toBe(0);
    expect(mockText).not.toHaveBeenCalled();
  });

  it("corrida no INSERT (23505 do índice) → already_processing via re-resolve", async () => {
    // 1ª query do dedupe: nada; após a colisão, o re-resolve ENCONTRA o vencedor.
    const { supabase, state } = fakeSupabase({ insertError: { code: "23505", message: "duplicate key" } });
    let call = 0;
    const origFrom = supabase.from;
    supabase.from = ((table: string) => {
      const chain = origFrom(table) as Record<string, unknown> & { maybeSingle?: () => Promise<unknown> };
      if (table === "brain_intakes") {
        chain.maybeSingle = async () => {
          call += 1;
          return call === 1
            ? { data: null, error: null }
            : { data: { ...AWAITING_PRIOR, status: "analyzing" }, error: null };
        };
      }
      return chain;
    }) as typeof supabase.from;

    const r = await createAndAnalyzeText(textArgs(supabase));
    expect(r).toEqual({ kind: "already_processing", intakeId: "prior-1" });
    expect(state.insertAttempts).toBe(1);
    expect(mockText).not.toHaveBeenCalled();
  });

  it("sem anterior → segue o fluxo normal (INSERT acontece)", async () => {
    const { supabase, state } = fakeSupabase({ insertError: { code: "XX000", message: "boom" } });
    const r = await createAndAnalyzeText(textArgs(supabase));
    // Falha genérica de insert vira erro normal — o que importa: TENTOU inserir.
    expect(state.insertAttempts).toBe(1);
    expect(r.kind).toBe("error");
  });
});

describe("createAndAnalyzeIntake (foto) — dedupe L1 por conteúdo", () => {
  beforeEach(() => {
    mockVision.mockReset();
    mockText.mockReset();
  });

  it("mesma FOTO já executada → duplicate antes de pergunta/criança/IA", async () => {
    const { supabase, state } = fakeSupabase({ prior: { ...AWAITING_PRIOR, status: "executed" } });
    const r = await createAndAnalyzeIntake({
      supabase: supabase as never,
      groupId: "g1",
      userId: "u1",
      channel: "pwa",
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mime: "image/jpeg",
      // >1 criança e SEM escolha: sem o dedupe viraria pergunta de criança —
      // o duplicado tem que vencer ANTES da pergunta.
      children: [CHILD, { id: "22222222-2222-2222-2222-222222222222", name: "Martim" }],
      requestedChildId: null,
    });
    expect(r.kind).toBe("duplicate");
    if (r.kind === "duplicate") expect(r.message).toContain("Essa foto já foi registrada");
    expect(state.insertAttempts).toBe(0);
    expect(mockVision).not.toHaveBeenCalled();
  });
});
