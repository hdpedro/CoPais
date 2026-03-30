import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedirect, mockChain, mockSupabase, mockVerify } = vi.hoisted(() => {
  const mockRedirect = vi.fn();

  const c: any = {};
  let _res = { data: null as any, error: null as any, count: null as any };
  const sync = ["select","insert","update","delete","upsert","eq","neq","in","is","gte","lte","gt","lt","or","not","match","filter","order","limit"];
  for (const m of sync) c[m] = vi.fn(() => c);
  c.single = vi.fn().mockResolvedValue({ data: null, error: null });
  c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  c.then = (res: any, rej?: any) => Promise.resolve(_res).then(res, rej);
  c._setRes = (r: any) => { _res = { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }; };
  c._reset = () => {
    for (const m of sync) { c[m].mockClear(); c[m].mockImplementation(() => c); }
    c.single.mockClear(); c.single.mockResolvedValue({ data: null, error: null });
    c.maybeSingle.mockClear(); c.maybeSingle.mockResolvedValue({ data: null, error: null });
    _res = { data: null, error: null, count: null };
  };
  const mockChain = c;

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

import { markNotificationRead, markAllNotificationsRead } from "@/actions/notifications";
import { createCheckin } from "@/actions/checkin";
import { createAgreement, acceptAgreement } from "@/actions/agreements";
import { createSettlement, confirmSettlement } from "@/actions/settlements";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

// ── notifications ────────────────────────────────────────────────

describe("notifications actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
  });

  describe("markNotificationRead", () => {
    it("success - calls from('notifications')", async () => {
      await markNotificationRead("notif-1");
      expect(mockSupabase.from).toHaveBeenCalledWith("notifications");
    });

    it("unauthenticated - returns early without DB call", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await markNotificationRead("notif-1");
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe("markAllNotificationsRead", () => {
    it("success - calls from('notifications')", async () => {
      await markAllNotificationsRead();
      expect(mockSupabase.from).toHaveBeenCalledWith("notifications");
    });

    it("unauthenticated - returns early without DB call", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await markAllNotificationsRead();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });
});

// ── checkin ──────────────────────────────────────────────────────

describe("checkin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createCheckin", () => {
    it("success - returns { success: true }", async () => {
      // child verification + child name lookup
      mockChain.single
        .mockResolvedValueOnce({ data: { id: "c1" }, error: null })
        .mockResolvedValueOnce({ data: { full_name: "Alice" }, error: null });
      const result = await createCheckin(fd({ groupId: "g1", childId: "c1", category: "mood", title: "Happy", description: "Great day" }));
      expect(result).toEqual({ success: true });
    });

    it("unauthenticated - returns error", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const result = await createCheckin(fd({ groupId: "g1", childId: "c1", category: "mood", title: "Happy", description: "" }));
      expect(result).toEqual({ error: "Nao autenticado" });
    });

    it("no membership - returns error", async () => {
      mockVerify.mockResolvedValueOnce(null);
      const result = await createCheckin(fd({ groupId: "g1", childId: "c1", category: "mood", title: "Happy", description: "" }));
      expect(result).toEqual({ error: "Sem permissao para este grupo." });
    });

    it("empty title - returns error", async () => {
      // child verification must pass first
      mockChain.single.mockResolvedValueOnce({ data: { id: "c1" }, error: null });
      const result = await createCheckin(fd({ groupId: "g1", childId: "c1", category: "mood", title: "", description: "" }));
      expect(result).toEqual({ error: "Titulo obrigatorio" });
    });
  });
});

// ── agreements ───────────────────────────────────────────────────

describe("agreements actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createAgreement", () => {
    it("success - redirects to /acordos", async () => {
      await expect(createAgreement(fd({ groupId: "g1", title: "Bedtime", description: "9pm rule", category: "rotina" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/acordos");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createAgreement(fd({ groupId: "g1", title: "T", description: "D", category: "rotina" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty title - redirects with error", async () => {
      await expect(createAgreement(fd({ groupId: "g1", title: "", description: "D", category: "rotina" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/acordos?error="));
    });

    it("empty description - redirects with error", async () => {
      await expect(createAgreement(fd({ groupId: "g1", title: "T", description: "", category: "rotina" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/acordos?error="));
    });
  });

  describe("acceptAgreement", () => {
    it("success - redirects to /acordos", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { group_id: "g1" }, error: null });
      await expect(acceptAgreement(fd({ agreementId: "a1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/acordos");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(acceptAgreement(fd({ agreementId: "a1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("agreement not found - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(acceptAgreement(fd({ agreementId: "x" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/acordos?error="));
    });
  });
});

// ── settlements ──────────────────────────────────────────────────

describe("settlements actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createSettlement", () => {
    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createSettlement(fd({ groupId: "g1", paidTo: "other", amount: "50", paymentMethod: "pix", referenceNote: "", settlementDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("invalid amount (zero) - redirects with error", async () => {
      await expect(createSettlement(fd({ groupId: "g1", paidTo: "other", amount: "0", paymentMethod: "pix", referenceNote: "", settlementDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });

    it("negative amount - redirects with error", async () => {
      await expect(createSettlement(fd({ groupId: "g1", paidTo: "other", amount: "-10", paymentMethod: "pix", referenceNote: "", settlementDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });

    it("paying yourself - redirects with error", async () => {
      mockVerify.mockResolvedValueOnce({ role: "admin" }).mockResolvedValueOnce({ role: "admin" });
      await expect(createSettlement(fd({ groupId: "g1", paidTo: "test-user-id", amount: "50", paymentMethod: "pix", referenceNote: "", settlementDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });
  });

  describe("confirmSettlement", () => {
    it("success - redirects with success", async () => {
      mockChain.single
        .mockResolvedValueOnce({ data: { group_id: "g1", paid_to: "test-user-id", status: "pending" }, error: null })
        .mockResolvedValueOnce({ data: { paid_by: "other", amount: 50 }, error: null })
        .mockResolvedValueOnce({ data: { full_name: "Test User" }, error: null });
      await expect(confirmSettlement(fd({ settlementId: "s1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(confirmSettlement(fd({ settlementId: "s1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("settlement not found - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(confirmSettlement(fd({ settlementId: "x" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });

    it("not the recipient - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { group_id: "g1", paid_to: "other", status: "pending" }, error: null });
      await expect(confirmSettlement(fd({ settlementId: "s1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });

    it("already confirmed - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { group_id: "g1", paid_to: "test-user-id", status: "confirmed" }, error: null });
      await expect(confirmSettlement(fd({ settlementId: "s1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/financeiro?error="));
    });
  });
});
