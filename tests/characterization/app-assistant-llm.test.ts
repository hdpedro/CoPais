/* ------------------------------------------------------------------ */
/* CHARACTERIZATION — /api/ai/assistant LLM fallback (App channel)     */
/*                                                                     */
/* The deterministic local pipeline is mocked OFF so every request     */
/* falls through to the AI router (also mocked). Captures the current  */
/* LLM-fallback orchestration: tool rounds, final text, family context */
/* in the system prompt, and graceful error / rate-limit handling.     */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteTool = vi.fn();
const mockRouteTools = vi.fn();
const mockRouteText = vi.fn();
const mockBuildContext = vi.fn();
const mockResolveAuth = vi.fn();

vi.mock("@/lib/api-auth", () => ({ resolveAuthenticatedUser: (...a: unknown[]) => mockResolveAuth(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn() }));
vi.mock("@/actions/onboarding-quest", () => ({ markQuestStep: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/ai/tools", () => ({ AI_TOOLS: [], executeTool: (...a: unknown[]) => mockExecuteTool(...a) }));
vi.mock("@/lib/ai/router", () => ({
  routeToolsRequest: (...a: unknown[]) => mockRouteTools(...a),
  routeTextRequest: (...a: unknown[]) => mockRouteText(...a),
}));
vi.mock("@/lib/ai/core/logger", () => ({ logAIRequest: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/core/usage", () => ({
  canUseAI: vi.fn(async () => ({ allowed: true, remaining: Infinity, limit: Infinity })),
}));
// Mock the local pipeline OFF so everything falls through to the router.
vi.mock("@/lib/ai/local-parser", () => ({ parseIntent: vi.fn(() => null) }));
vi.mock("@/lib/ai/local-queries", () => ({
  parseQueryIntent: vi.fn(() => null),
  fuzzyMatchIntent: vi.fn(() => null),
  dispatchCustomAction: vi.fn(async () => null),
  parseMultiIntent: vi.fn(() => []),
  detectChildAmbiguity: vi.fn(() => ({ ambiguous: false, candidates: [] })),
  loadSessionState: vi.fn(async () => ({})),
  saveSessionState: vi.fn(async () => {}),
  applyFollowUp: vi.fn(() => null),
}));
vi.mock("@/lib/ai/local-helpers", () => ({
  hasNegation: vi.fn(() => false),
  detectOffTopic: vi.fn(() => ({ category: null, reply: "" })),
}));
vi.mock("@/lib/ai/assistant-shared", async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return { ...orig, buildAssistantContext: (...a: unknown[]) => mockBuildContext(...a) };
});

import { POST } from "@/app/api/ai/assistant/route";

type Body = { messages: { role: string; content: string }[]; groupId: string };

let userSeq = 0;
function call(body: Body) {
  const req = { json: async () => body, headers: new Headers() } as unknown as Request;
  mockResolveAuth.mockResolvedValueOnce({ id: `u-${++userSeq}`, email: null });
  return POST(req as never);
}

const CTX = {
  contextStr: "CTX_MARKER\nUsuario: Henrique\nCriancas: Bernardo (6 anos)",
  toolCtx: {
    supabase: {},
    userId: "u1",
    groupId: "g1",
    children: [{ id: "c1", name: "Bernardo", birth_date: "2018-01-01" }],
    members: [{ id: "u1", name: "Henrique" }],
    locale: "pt",
  },
  custodyEnabled: true,
};

const ask = () => call({ messages: [{ role: "user", content: "qualquer pergunta aberta" }], groupId: "g1" });

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(CTX);
  mockExecuteTool.mockResolvedValue({ success: true, message: "TOOL_OK" });
  mockRouteTools.mockResolvedValue({ response: { toolCalls: [], content: "LLM_TEXT" }, provider: "groq" });
  mockRouteText.mockResolvedValue({ text: "LLM_FINAL", provider: "groq" });
});

describe("app assistant — LLM fallback orchestration", () => {
  it("response without tool → returns the sanitized LLM text", async () => {
    mockRouteTools.mockResolvedValueOnce({
      response: { toolCalls: [], content: "Que tal um piquenique no parque?" },
      provider: "groq",
    });
    const res = await ask();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.content).toBe("Que tal um piquenique no parque?");
    expect(mockRouteTools).toHaveBeenCalled();
  });

  it("family context reaches the LLM system prompt", async () => {
    await ask();
    expect(mockRouteTools).toHaveBeenCalled();
    const firstArg = mockRouteTools.mock.calls[0][0] as { role: string; content: string }[];
    const systemMsg = firstArg.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("CTX_MARKER");
  });

  it("LLM tool use → executes the tool call then returns the final text", async () => {
    mockRouteTools
      .mockResolvedValueOnce({
        response: {
          toolCalls: [{ id: "t1", function: { name: "create_event", arguments: '{"title":"Festa"}' } }],
          content: "",
        },
        provider: "groq",
      })
      .mockResolvedValueOnce({ response: { toolCalls: [], content: "Pronto, evento criado! ✅" }, provider: "groq" });
    const res = await ask();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mockExecuteTool).toHaveBeenCalledWith("create_event", { title: "Festa" }, expect.anything());
    expect(body.content).toBe("Pronto, evento criado! ✅");
  });

  it("graceful error → router throws generic → 500 with a friendly error", async () => {
    mockRouteTools.mockRejectedValue(new Error("boom"));
    const res = await ask();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });

  it("rate-limit error → router throws rate_limit → 429", async () => {
    mockRouteTools.mockRejectedValue(new Error("rate_limit exceeded"));
    const res = await ask();
    expect(res.status).toBe(429);
  });
});
