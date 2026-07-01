/* ------------------------------------------------------------------ */
/* CHARACTERIZATION — processWhatsAppMessage LOCAL pipeline (WhatsApp)  */
/*                                                                     */
/* Real parsers; WhatsApp transport (client/session/identity/media)    */
/* mocked. Captures the adapter-specific rendering the refactor must    */
/* preserve: query → sendTextMessage, action → sendConfirmation +       */
/* setPendingAction (buttons, not the app's CONFIRM_PREFIX), off-topic. */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecuteTool, mockRouteTools, mockBuildContext, c, s } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn(),
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
  contextStr: "CTX_MARKER\nUsuario: Henrique\nCriancas: Bernardo (6 anos)",
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
function textMsg(text: string) {
  return { from: `+55119${++phoneSeq}`, messageId: `m-${phoneSeq}`, type: "text", text, timestamp: 1 } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(CTX);
  mockExecuteTool.mockResolvedValue({ success: true, message: "TOOL_OK" });
});

describe("whatsapp processor — local pipeline (real parsers)", () => {
  it("balance query → sends the tool result as a text message, no buttons", async () => {
    await processWhatsAppMessage(textMsg("como tá o saldo?"));
    expect(mockExecuteTool).toHaveBeenCalledWith("get_balance", expect.anything(), expect.anything());
    const sent = c.sendTextMessage.mock.calls.map((x) => (x as string[])[1]).join(" ");
    expect(sent).toContain("TOOL_OK");
    expect(c.sendConfirmation).not.toHaveBeenCalled();
  });

  it("action creation → sends an interactive confirmation and persists the pending action", async () => {
    await processWhatsAppMessage(textMsg("paguei 50 de escola"));
    expect(c.sendConfirmation).toHaveBeenCalled();
    expect(s.setPendingAction).toHaveBeenCalled();
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("off-topic question → sends the local refusal text, never calls the LLM", async () => {
    await processWhatsAppMessage(textMsg("qual a previsão do tempo amanhã?"));
    expect(c.sendTextMessage).toHaveBeenCalled();
    expect(mockRouteTools).not.toHaveBeenCalled();
  });
});
