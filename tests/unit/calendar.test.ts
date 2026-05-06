import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockRedirect, mockChain, mockSupabase,
  mockVerifyGroupMembership, mockAdminChain, mockAdminClient,
} = vi.hoisted(() => {
  const mockRedirect = vi.fn();

  const mockChain: Record<string, any> = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    upsert: vi.fn(), eq: vi.fn(), neq: vi.fn(), in: vi.fn(),
    gte: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(),
    single: vi.fn(), maybeSingle: vi.fn(),
  };
  for (const key of Object.keys(mockChain)) mockChain[key].mockReturnValue(mockChain);

  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn().mockReturnValue(mockChain),
    storage: { from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test/file.pdf" } }),
    }) },
  };

  const mockAdminChain: Record<string, any> = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    upsert: vi.fn(), eq: vi.fn(), neq: vi.fn(), gte: vi.fn(), lte: vi.fn(),
    order: vi.fn(), limit: vi.fn(), single: vi.fn(),
  };
  for (const key of Object.keys(mockAdminChain)) mockAdminChain[key].mockReturnValue(mockAdminChain);

  const mockAdminClient = { from: vi.fn().mockReturnValue(mockAdminChain) };
  const mockVerifyGroupMembership = vi.fn();

  return { mockRedirect, mockChain, mockSupabase, mockVerifyGroupMembership, mockAdminChain, mockAdminClient };
});

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => { mockRedirect(...args); throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockSupabase) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn().mockReturnValue(mockAdminClient) }));
vi.mock("@/lib/auth-utils", () => ({ verifyGroupMembership: mockVerifyGroupMembership }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({
  createNotificationWithPush: vi.fn().mockResolvedValue(undefined),
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn().mockResolvedValue(undefined) }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createCustodyEvent, createSwapRequest, respondToSwapRequest,
  generateSchedule, clearCustodySchedule,
} from "@/actions/calendar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

function setupChain(chain: Record<string, any>, singleData: any = { id: "rec-1" }) {
  for (const key of Object.keys(chain)) {
    if (typeof chain[key]?.mockReturnValue === "function") {
      chain[key].mockReturnValue(chain);
    }
  }
  chain.then = (r: any) => r({ data: null, error: null });
  chain.single.mockResolvedValue({ data: singleData, error: null });
}

function expectRedirectContains(text: string) {
  const call = mockRedirect.mock.calls[0]?.[0] ?? "";
  const match = call.includes(text) || call.includes(encodeURIComponent(text)) || decodeURIComponent(call).includes(text);
  expect(match).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calendar actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain(mockChain, { id: "rec-1", full_name: "Teste User" });
    setupChain(mockAdminChain);

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null,
    });
    mockVerifyGroupMembership.mockResolvedValue({ role: "admin" });
  });

  // -------------------------------------------------------------------------
  // createCustodyEvent
  // -------------------------------------------------------------------------

  describe("createCustodyEvent", () => {
    const base = {
      groupId: "group-1", childId: "child-1", responsibleUserId: "user-a",
      startDate: "2026-06-01", endDate: "2026-06-03", custodyType: "regular",
      notes: "Notas do evento", isRecurring: "false",
    };

    it("creates a custody event and redirects to /calendario", async () => {
      await expect(createCustodyEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createCustodyEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirects with error when user has no membership", async () => {
      mockVerifyGroupMembership.mockResolvedValueOnce(null);
      await expect(createCustodyEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Sem permissao");
    });
  });

  // -------------------------------------------------------------------------
  // createSwapRequest
  // -------------------------------------------------------------------------

  describe("createSwapRequest", () => {
    const base = {
      groupId: "group-1", originalDate: "2026-06-10", proposedDate: "2026-06-12",
      reason: "Viagem", targetUserId: "user-b", requestType: "swap",
    };

    /** Service queries group_members for both requester+target. Make the
     *  thenable resolve with both memberships so the service passes the
     *  permission gate. */
    function mockBothMembersPresent() {
      mockChain.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: [{ user_id: "test-user-id" }, { user_id: "user-b" }],
          error: null,
        });
      mockChain.single.mockResolvedValue({ data: { id: "rec-1" }, error: null });
    }

    it("creates a swap request and returns success", async () => {
      mockBothMembersPresent();
      const result = await createSwapRequest(fd(base));
      expect(result).toEqual({ success: true });
    });

    it("returns error when user is not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const result = await createSwapRequest(fd(base));
      expect(result).toEqual({ error: "Nao autenticado" });
    });

    it("returns error when no membership", async () => {
      // Service does its own group_members lookup; default mock then returns
      // {data: null}, which fails the permission gate.
      mockChain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null });
      const result = await createSwapRequest(fd(base));
      expect(result).toEqual({ error: "Sem permissao para este grupo." });
    });

    it("returns error when targetUserId is missing", async () => {
      const f = fd(base);
      f.delete("targetUserId");
      const result = await createSwapRequest(f);
      expect(result).toEqual({ error: "Responsavel nao encontrado para este dia." });
    });
  });

  // -------------------------------------------------------------------------
  // respondToSwapRequest
  // -------------------------------------------------------------------------

  describe("respondToSwapRequest", () => {
    it("approves a swap request and returns success", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: "swap-1", target_user_id: "test-user-id", requester_id: "user-b",
          group_id: "group-1", original_date: "2026-06-10",
          proposed_date: "2026-06-12", reason: "Viagem", status: "pending",
        },
        error: null,
      });
      // The chain's select() after update() returns chain (default), which resolves to {data: [...]}
      // Override the chain's thenable to return updated rows for the idempotent update check
      mockChain.then = (resolve: any) => resolve({ data: [{ id: "swap-1" }], error: null });
      mockChain.single.mockResolvedValue({ data: { full_name: "Test User" }, error: null });

      const result = await respondToSwapRequest(fd({ requestId: "swap-1", response: "approved" }));
      expect(result).toEqual({ success: true });
    });

    it("rejects a swap request and returns success", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: "swap-1", target_user_id: "test-user-id", requester_id: "user-b",
          group_id: "group-1", original_date: "2026-06-10",
          proposed_date: null, reason: null, status: "pending",
        },
        error: null,
      });
      mockChain.then = (resolve: any) => resolve({ data: [{ id: "swap-1" }], error: null });
      mockChain.single.mockResolvedValue({ data: { full_name: "Test User" }, error: null });

      const result = await respondToSwapRequest(fd({ requestId: "swap-1", response: "rejected" }));
      expect(result).toEqual({ success: true });
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(
        respondToSwapRequest(fd({ requestId: "swap-1", response: "approved" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });

  // -------------------------------------------------------------------------
  // generateSchedule
  // -------------------------------------------------------------------------

  describe("generateSchedule", () => {
    const pattern = Array(14).fill(null);
    pattern[1] = "user-a"; pattern[2] = "user-a"; pattern[3] = "user-a";
    pattern[4] = "user-a"; pattern[5] = "user-a";
    pattern[8] = "user-b"; pattern[9] = "user-b"; pattern[10] = "user-b";
    pattern[11] = "user-b"; pattern[12] = "user-b";

    const base = {
      groupId: "group-1", childId: "child-1",
      pattern: JSON.stringify(pattern), startDate: "2026-06-01", months: "1",
    };

    it("generates schedule events and returns success", async () => {
      const result = await generateSchedule(fd(base));
      expect(result).toHaveProperty("success", true);
      expect((result as any).count).toBeGreaterThan(0);
    });

    it("returns error when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const result = await generateSchedule(fd(base));
      expect(result).toEqual({ error: "Nao autenticado" });
    });

    it("returns error for invalid pattern JSON", async () => {
      const result = await generateSchedule(fd({ ...base, pattern: "not-json" }));
      expect(result).toEqual({ error: "Padrao de escala com formato invalido." });
    });

    it("returns error for pattern with wrong length", async () => {
      const result = await generateSchedule(fd({ ...base, pattern: JSON.stringify([null, null, null]) }));
      expect(result).toEqual({ error: "Padrao de escala invalido." });
    });
  });

  // -------------------------------------------------------------------------
  // clearCustodySchedule
  // -------------------------------------------------------------------------

  describe("clearCustodySchedule", () => {
    it("clears custody schedule and redirects for admin", async () => {
      mockVerifyGroupMembership.mockResolvedValueOnce({ role: "admin" });
      await expect(clearCustodySchedule("group-1")).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(clearCustodySchedule("group-1")).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("allows member (co-parent) to clear schedule — same as admin", async () => {
      mockVerifyGroupMembership.mockResolvedValueOnce({ role: "member" });
      await expect(clearCustodySchedule("group-1")).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("returns error for readonly users", async () => {
      mockVerifyGroupMembership.mockResolvedValueOnce({ role: "readonly" });
      const result = await clearCustodySchedule("group-1");
      expect(result).toEqual({ error: "Apenas pais responsaveis podem limpar a escala." });
    });
  });
});
