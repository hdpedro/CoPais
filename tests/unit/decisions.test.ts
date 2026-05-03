import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedirect, mockChain, mockSupabase, mockVerify } = vi.hoisted(() => {
  const mockRedirect = vi.fn();

  // Every builder method returns the chain; the chain is thenable.
  const mockChain: any = {};
  let _res = { data: null as any, error: null as any, count: null as any };
  const syncMethods = [
    "select","insert","update","delete","upsert","eq","neq","in","is",
    "gte","lte","gt","lt","or","not","match","filter","order","limit",
  ];
  for (const m of syncMethods) mockChain[m] = vi.fn(() => mockChain);
  mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  mockChain.then = (res: any, rej?: any) => Promise.resolve(_res).then(res, rej);
  mockChain._setRes = (r: any) => { _res = { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }; };
  mockChain._reset = () => {
    for (const m of syncMethods) { mockChain[m].mockClear(); mockChain[m].mockImplementation(() => mockChain); }
    mockChain.single.mockClear(); mockChain.single.mockResolvedValue({ data: null, error: null });
    mockChain.maybeSingle.mockClear(); mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    _res = { data: null, error: null, count: null };
  };

  const mockSupabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null }) },
    from: vi.fn(() => mockChain),
  };
  const mockVerify = vi.fn().mockResolvedValue({ role: "admin" });
  return { mockRedirect, mockChain, mockSupabase, mockVerify };
});

vi.mock("next/navigation", () => ({ redirect: (...args: any[]) => { mockRedirect(...args); throw new Error("NEXT_REDIRECT"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockSupabase) }));
vi.mock("@/lib/auth-utils", () => ({ verifyGroupMembership: (...args: any[]) => mockVerify(...args) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({ createNotificationWithPush: vi.fn() }));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn() }));

import { createDecision, castVote, addArgument } from "@/actions/decisions";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("decisions actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  // ── createDecision ─────────────────────────────────────────────

  describe("createDecision", () => {
    it("success - redirects to /decisoes", async () => {
      // Service: verifyMembership (maybeSingle) → INSERT...select.single
      mockChain.maybeSingle.mockResolvedValueOnce({ data: { user_id: "test-user-id" }, error: null });
      mockChain.single.mockResolvedValueOnce({ data: { id: "d1" }, error: null });
      const form = fd({ groupId: "g1", title: "Test", description: "desc", category: "education", deadline: "2026-04-01" });
      await expect(createDecision(form)).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/decisoes");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createDecision(fd({ groupId: "g1", title: "T", description: "", category: "", deadline: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty title - redirects with error", async () => {
      await expect(createDecision(fd({ groupId: "g1", title: "", description: "d", category: "", deadline: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/decisoes?error="));
    });

    it("no group membership - redirects to /dashboard with error", async () => {
      // Service queries group_members via maybeSingle directly (no helper).
      mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(createDecision(fd({ groupId: "g1", title: "T", description: "", category: "", deadline: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/dashboard?error="));
    });
  });

  // ── castVote ───────────────────────────────────────────────────

  describe("castVote", () => {
    it("success - redirects to /decisoes", async () => {
      // Service: decision lookup (maybeSingle) → membership (maybeSingle) → upsert.
      mockChain.maybeSingle
        .mockResolvedValueOnce({
          data: { id: "d1", group_id: "g1", title: "T", status: "aberta", created_by: "other" },
          error: null,
        })
        .mockResolvedValueOnce({ data: { user_id: "test-user-id" }, error: null });
      await expect(castVote(fd({ decisionId: "d1", vote: "concordo" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/decisoes");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(castVote(fd({ decisionId: "d1", vote: "concordo" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("invalid vote - redirects with error", async () => {
      await expect(castVote(fd({ decisionId: "d1", vote: "bad" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/decisoes?error="));
    });

    it("empty decisionId - redirects with error", async () => {
      await expect(castVote(fd({ decisionId: "", vote: "concordo" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/decisoes?error="));
    });
  });

  // ── addArgument ────────────────────────────────────────────────

  describe("addArgument", () => {
    it("success - redirects to /decisoes", async () => {
      // Service: decision lookup (maybeSingle) → membership (maybeSingle).
      mockChain.maybeSingle
        .mockResolvedValueOnce({ data: { group_id: "g1" }, error: null })
        .mockResolvedValueOnce({ data: { user_id: "test-user-id" }, error: null });
      await expect(addArgument(fd({ decisionId: "d1", argumentType: "pro", text: "Good idea" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/decisoes");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(addArgument(fd({ decisionId: "d1", argumentType: "con", text: "Bad" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty text - redirects with error", async () => {
      await expect(addArgument(fd({ decisionId: "d1", argumentType: "pro", text: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/decisoes?error="));
    });

    it("decision not found - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(addArgument(fd({ decisionId: "x", argumentType: "pro", text: "arg" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/decisoes?error="));
    });
  });
});
