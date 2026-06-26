/* ------------------------------------------------------------------ */
/* CHARACTERIZATION — /api/ai/assistant LOCAL pipeline (App channel)   */
/*                                                                     */
/* Real parsers (parseIntent / parseQueryIntent / detectOffTopic) with */
/* IO boundaries mocked (auth, family context, executeTool, router,    */
/* logging). Captures current behavior of the deterministic fast paths */
/* so the runAssistantTurn extraction can't silently change them.      */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteTool = vi.fn();
const mockRouteTools = vi.fn();
const mockBuildContext = vi.fn();
const mockResolveAuth = vi.fn();

function fakeSupabase() {
  const result = { data: null, error: null };
  // Proxy: every method chains; awaiting (or .then) resolves {data:null}.
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(result);
        return () => proxy;
      },
    },
  );
  return { from: () => proxy };
}

vi.mock("@/lib/api-auth", () => ({
  resolveAuthenticatedUser: (...a: unknown[]) => mockResolveAuth(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase() }));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn() }));
vi.mock("@/actions/onboarding-quest", () => ({ markQuestStep: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/ai/tools", () => ({ AI_TOOLS: [], executeTool: (...a: unknown[]) => mockExecuteTool(...a) }));
vi.mock("@/lib/ai/router", () => ({
  routeToolsRequest: (...a: unknown[]) => mockRouteTools(...a),
  routeTextRequest: vi.fn(),
}));
vi.mock("@/lib/ai/core/logger", () => ({ logAIRequest: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/core/usage", () => ({
  canUseAI: vi.fn(async () => ({ allowed: true, remaining: Infinity, limit: Infinity })),
}));
vi.mock("@/lib/ai/assistant-shared", async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return { ...orig, buildAssistantContext: (...a: unknown[]) => mockBuildContext(...a) };
});

import { POST } from "@/app/api/ai/assistant/route";
import { CONFIRM_PREFIX } from "@/lib/ai/assistant-shared";

type Body = { messages: { role: string; content: string }[]; groupId: string };

let userSeq = 0;
function call(body: Body) {
  const req = { json: async () => body, headers: new Headers() } as unknown as Request;
  mockResolveAuth.mockResolvedValueOnce({ id: `u-${++userSeq}`, email: null });
  return POST(req as never);
}

const CTX = {
  contextStr: "CTX_MARKER\nUsuario: Henrique\nCriancas: Bernardo (6 anos)\nMembros: Henrique (voce)",
  toolCtx: {
    supabase: fakeSupabase(),
    userId: "u1",
    groupId: "g1",
    children: [{ id: "c1", name: "Bernardo", birth_date: "2018-01-01" }],
    members: [{ id: "u1", name: "Henrique" }],
    locale: "pt",
  },
  custodyEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(CTX);
  mockExecuteTool.mockResolvedValue({ success: true, message: "TOOL_OK" });
});

describe("app assistant — local pipeline (real parsers)", () => {
  it("balance query → executes get_balance and returns the tool message (no LLM)", async () => {
    const res = await call({ messages: [{ role: "user", content: "como tá o saldo?" }], groupId: "g1" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.content).toBe("TOOL_OK");
    expect(mockExecuteTool).toHaveBeenCalledWith("get_balance", expect.anything(), expect.anything());
    expect(mockRouteTools).not.toHaveBeenCalled();
  });

  it("action creation → returns a confirmation prompt (CONFIRM_PREFIX), does not execute yet", async () => {
    const res = await call({ messages: [{ role: "user", content: "paguei 50 de escola" }], groupId: "g1" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.content.startsWith(CONFIRM_PREFIX)).toBe(true);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("confirm a pending action → executes the tool and returns a success line", async () => {
    const res = await call({
      messages: [
        { role: "user", content: "paguei 50 de escola" },
        { role: "assistant", content: `${CONFIRM_PREFIX} Vou registrar a despesa. Confirma?` },
        { role: "user", content: "sim" },
      ],
      groupId: "g1",
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.content.startsWith("✅")).toBe(true);
    expect(mockExecuteTool).toHaveBeenCalledWith("create_expense", expect.anything(), expect.anything());
  });

  it("off-topic question → returns the local refusal reply, never calls the LLM", async () => {
    const res = await call({ messages: [{ role: "user", content: "qual a previsão do tempo amanhã?" }], groupId: "g1" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.content.length).toBeGreaterThan(0);
    expect(mockRouteTools).not.toHaveBeenCalled();
  });
});
