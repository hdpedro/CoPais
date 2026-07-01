/* ------------------------------------------------------------------ */
/* CHARACTERIZATION — processWhatsAppMessage LLM fallback (WhatsApp)    */
/*                                                                     */
/* Local pipeline mocked OFF → every message reaches the router        */
/* (mocked). Captures the WhatsApp LLM-fallback rendering: success →   */
/* sendTextMessage(text); router throws → single graceful error text.  */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRouteTools, mockBuildContext, c, s } = vi.hoisted(() => ({
  mockRouteTools: vi.fn(),
  mockBuildContext: vi.fn(),
  c: {
    sendTextMessage: vi.fn(async () => "wamid.1"),
    sendConfirmation: vi.fn(async () => "wamid.2"),
    sendListMessage: vi.fn(async () => "wamid.3"),
    markAsRead: vi.fn(async () => {}),
  },
  s: {
    loadSession: vi.fn(async () => ({ id: "s1", state: {} })),
    hasPendingConfirmation: vi.fn(() => false),
    hasBrainIntake: vi.fn(() => false),
    hasBrainFallbackPhoto: vi.fn(() => false),
    hasBrainChildSelection: vi.fn(() => false),
    hasReceiptStep: vi.fn(() => false),
    setPendingAction: vi.fn(async () => {}),
    clearPendingAction: vi.fn(async () => {}),
    setSessionGroup: vi.fn(async () => {}),
    setGroupSelectionState: vi.fn(async () => {}),
    setReceiptStep: vi.fn(async () => {}),
    setBrainIntake: vi.fn(async () => {}),
    setBrainFallbackPhoto: vi.fn(async () => {}),
  },
}));

function fakeSupabase() {
  const result = { data: null, error: null };
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

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase() }));
vi.mock("@/lib/ai/tools", () => ({ AI_TOOLS: [], executeTool: vi.fn() }));
vi.mock("@/lib/ai/router", () => ({
  routeToolsRequest: (...a: unknown[]) => mockRouteTools(...a),
  routeTextRequest: vi.fn(),
}));
vi.mock("@/lib/ai/core/logger", () => ({ logAIRequest: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/core/usage", () => ({
  canUseAI: vi.fn(async () => ({ allowed: true, remaining: Infinity, limit: Infinity })),
}));
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
vi.mock("@/lib/whatsapp/client", () => c);
vi.mock("@/lib/whatsapp/session", () => s);
vi.mock("@/lib/whatsapp/identity", () => ({
  resolveIdentity: vi.fn(async () => ({
    resolved: { userId: "u1", groupId: "g1" },
    needsLinking: false,
    needsVerification: false,
    needsGroupSelection: false,
    groups: [],
  })),
  setActiveGroup: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp/approvals", () => ({ decodeApproval: vi.fn(() => null) }));
vi.mock("@/lib/whatsapp/media", () => ({ processReceiptImage: vi.fn(), processPrescriptionImage: vi.fn() }));
vi.mock("@/lib/whatsapp/audio", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/whatsapp/formatter", () => ({
  formatForWhatsApp: (x: string) => x,
  splitMessage: (x: string) => [x],
}));
vi.mock("@/lib/services/swap", () => ({ respondToSwapRequest: vi.fn() }));
vi.mock("@/lib/services/expenses", () => ({ createExpense: vi.fn() }));

import { processWhatsAppMessage } from "@/lib/whatsapp/processor";

const CTX = {
  contextStr: "CTX_MARKER",
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

let phoneSeq = 0;
// >24 chars so the bare-noise filter never short-circuits it.
function textMsg(text = "pergunta aberta qualquer pro assistente") {
  return { from: `+55118${++phoneSeq}`, messageId: `m-${phoneSeq}`, type: "text", text, timestamp: 1 } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(CTX);
});

describe("whatsapp processor — LLM fallback orchestration", () => {
  it("LLM text response → sent as a WhatsApp text message", async () => {
    mockRouteTools.mockResolvedValue({ response: { toolCalls: [], content: "Resposta do assistente" }, provider: "groq" });
    await processWhatsAppMessage(textMsg());
    const sent = c.sendTextMessage.mock.calls.map((x) => (x as string[])[1]).join(" ");
    expect(sent).toContain("Resposta do assistente");
  });

  it("router throws → one graceful error message, no crash", async () => {
    mockRouteTools.mockRejectedValue(new Error("boom"));
    await processWhatsAppMessage(textMsg());
    const sent = c.sendTextMessage.mock.calls.map((x) => (x as string[])[1]).join(" ");
    expect(sent.toLowerCase()).toContain("erro");
  });
});
