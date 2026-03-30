import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedirect, mockChain, mockSupabase, mockVerify, mockAdminChain, mockAdminClient } = vi.hoisted(() => {
  const mockRedirect = vi.fn();

  function buildChain() {
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
    return c;
  }

  const mockChain = buildChain();
  const mockAdminChain = buildChain();
  const mockSupabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null }) },
    from: vi.fn(() => mockChain),
  };
  const mockVerify = vi.fn().mockResolvedValue({ role: "admin" });
  const mockAdminClient = { from: vi.fn(() => mockAdminChain) };
  return { mockRedirect, mockChain, mockSupabase, mockVerify, mockAdminChain, mockAdminClient };
});

vi.mock("next/navigation", () => ({ redirect: (...args: any[]) => { mockRedirect(...args); throw new Error("NEXT_REDIRECT"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockSupabase) }));
vi.mock("@/lib/auth-utils", () => ({ verifyGroupMembership: (...args: any[]) => mockVerify(...args) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({ createNotificationWithPush: vi.fn(), sendPushToUsers: vi.fn() }));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => mockAdminClient) }));

import { createNote, updateNote, deleteNote } from "@/actions/notes";
import { createSensitiveNote } from "@/actions/sensitive";
import { requestDeletion, approveDeletion, cancelDeletion } from "@/actions/sensitive-topics";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("notes actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockAdminChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockAdminClient.from.mockReturnValue(mockAdminChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createNote", () => {
    it("success - redirects with success", async () => {
      await expect(createNote(fd({ groupId: "g1", childId: "c1", category: "lembrete", title: "Note", content: "text", noteDate: "2026-03-29" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createNote(fd({ groupId: "g1", childId: "", category: "lembrete", title: "Note", content: "", noteDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty title - redirects with error", async () => {
      await expect(createNote(fd({ groupId: "g1", childId: "", category: "lembrete", title: "", content: "c", noteDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?error="));
    });
  });

  describe("updateNote", () => {
    it("success - redirects with success", async () => {
      await expect(updateNote(fd({ noteId: "n1", title: "Updated", content: "c", category: "lembrete", childId: "", noteDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(updateNote(fd({ noteId: "n1", title: "T", content: "", category: "lembrete", childId: "", noteDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty title - redirects with error", async () => {
      await expect(updateNote(fd({ noteId: "n1", title: "", content: "c", category: "lembrete", childId: "", noteDate: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?error="));
    });
  });

  describe("deleteNote", () => {
    it("success (count=1) - redirects with success", async () => {
      mockChain._setRes({ data: null, error: null, count: 1 });
      await expect(deleteNote(fd({ noteId: "n1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(deleteNote(fd({ noteId: "n1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("count=0 - redirects with error", async () => {
      mockChain._setRes({ data: null, error: null, count: 0 });
      await expect(deleteNote(fd({ noteId: "x" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/notas?error="));
    });
  });
});

describe("sensitive note actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createSensitiveNote", () => {
    it("success - redirects to /temas-sensiveis", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { id: "c1" }, error: null });
      await expect(createSensitiveNote(fd({ groupId: "g1", childId: "c1", topic: "bullying", title: "Incident", content: "text", sourceUrl: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/temas-sensiveis");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createSensitiveNote(fd({ groupId: "g1", childId: "", topic: "bullying", title: "T", content: "c", sourceUrl: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty title - redirects with error", async () => {
      await expect(createSensitiveNote(fd({ groupId: "g1", childId: "", topic: "bullying", title: "", content: "c", sourceUrl: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/temas-sensiveis?error="));
    });
  });
});

describe("sensitive-topics actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockAdminChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockAdminClient.from.mockReturnValue(mockAdminChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("requestDeletion", () => {
    it("success (2+ parents) - redirects to /temas-sensiveis", async () => {
      // note lookup
      mockChain.single.mockResolvedValueOnce({ data: { id: "n1", group_id: "g1" }, error: null });
      // countParentsInGroup: returns 2 members
      mockChain._setRes({ data: [{ id: "m1" }, { id: "m2" }] });
      // profile lookup for name
      mockChain.single.mockResolvedValueOnce({ data: { full_name: "Test User" }, error: null });

      await expect(requestDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/temas-sensiveis");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(requestDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty noteId/groupId - redirects with error", async () => {
      await expect(requestDeletion(fd({ noteId: "", groupId: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/temas-sensiveis?error="));
    });
  });

  describe("approveDeletion", () => {
    it("success - redirects to /temas-sensiveis", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { id: "n1", group_id: "g1", deletion_requested_by: "other-user" },
        error: null,
      });
      mockChain.single.mockResolvedValueOnce({ data: { full_name: "Approver" }, error: null });

      await expect(approveDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/temas-sensiveis");
    });

    it("same user as requester - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { id: "n1", group_id: "g1", deletion_requested_by: "test-user-id" },
        error: null,
      });

      await expect(approveDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/temas-sensiveis?error="));
    });
  });

  describe("cancelDeletion", () => {
    it("success - redirects to /temas-sensiveis", async () => {
      await expect(cancelDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/temas-sensiveis");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(cancelDeletion(fd({ noteId: "n1", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("empty noteId/groupId - redirects with error", async () => {
      await expect(cancelDeletion(fd({ noteId: "", groupId: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/temas-sensiveis?error="));
    });
  });
});
