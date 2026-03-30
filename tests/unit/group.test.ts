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
vi.mock("@/lib/push", () => ({ createNotificationWithPush: vi.fn() }));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => mockAdminClient) }));

import { createGroup, addChild, updateChild } from "@/actions/group";
import { updateProfile } from "@/actions/profile";
import { changeMemberRole, removeMember } from "@/actions/members";
import { createInvitation } from "@/actions/invitation";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("group actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockAdminChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockAdminClient.from.mockReturnValue(mockAdminChain);
    mockVerify.mockResolvedValue({ role: "admin" });
  });

  describe("createGroup", () => {
    it("success - returns { success: true }", async () => {
      const result = await createGroup(fd({ name: "Family", childName: "Alice", childBirthDate: "2020-01-15" }));
      expect(result).toEqual({ success: true });
    });

    it("unauthenticated - returns error", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const result = await createGroup(fd({ name: "Family", childName: "Alice", childBirthDate: "2020-01-15" }));
      expect(result).toEqual({ error: "Sessao expirada. Faca login novamente." });
    });

    it("insert error - returns error message", async () => {
      mockChain._setRes({ error: { message: "DB error" } });
      const result = await createGroup(fd({ name: "Family", childName: "Alice", childBirthDate: "2020-01-15" }));
      expect(result).toEqual({ error: "DB error" });
    });
  });

  describe("addChild", () => {
    it("success - redirects to /criancas", async () => {
      await expect(addChild(fd({ groupId: "g1", fullName: "Bob", birthDate: "2019-05-10", allergies: "peanuts", notes: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/criancas");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(addChild(fd({ groupId: "g1", fullName: "Bob", birthDate: "2019-05-10", allergies: "", notes: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("no membership - redirects to /dashboard with error", async () => {
      mockVerify.mockResolvedValueOnce(null);
      await expect(addChild(fd({ groupId: "g1", fullName: "Bob", birthDate: "2019-05-10", allergies: "", notes: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/dashboard?error="));
    });
  });

  describe("updateChild", () => {
    it("success - redirects to /criancas/:id", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { group_id: "g1" }, error: null });
      await expect(updateChild(fd({ id: "c1", fullName: "Bob", birthDate: "2019-05-10", allergies: "", notes: "", cpf: "", rg: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/criancas/c1?tab=geral");
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(updateChild(fd({ id: "c1", fullName: "Bob", birthDate: "2019-05-10", allergies: "", notes: "", cpf: "", rg: "" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });
});

describe("profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
  });

  describe("updateProfile", () => {
    it("success - returns { success: true }", async () => {
      const result = await updateProfile(fd({ fullName: "John Doe" }));
      expect(result).toEqual({ success: true });
    });

    it("unauthenticated - returns error", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const result = await updateProfile(fd({ fullName: "John Doe" }));
      expect(result).toEqual({ error: "Nao autenticado" });
    });

    it("name too short - returns error", async () => {
      const result = await updateProfile(fd({ fullName: "J" }));
      expect(result).toEqual({ error: "Nome deve ter pelo menos 2 caracteres" });
    });
  });
});

describe("members actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockAdminChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
    mockAdminClient.from.mockReturnValue(mockAdminChain);
  });

  describe("changeMemberRole", () => {
    it("success - redirects with success", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
      await expect(changeMemberRole(fd({ memberId: "other", groupId: "g1", newRole: "member" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/familia?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(changeMemberRole(fd({ memberId: "other", groupId: "g1", newRole: "member" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("not admin - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(changeMemberRole(fd({ memberId: "other", groupId: "g1", newRole: "admin" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/familia?error="));
    });
  });

  describe("removeMember", () => {
    it("success - redirects with success", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
      await expect(removeMember(fd({ memberId: "other", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/familia?success="));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(removeMember(fd({ memberId: "other", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("not admin - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(removeMember(fd({ memberId: "other", groupId: "g1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("/familia?error="));
    });
  });
});

describe("invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._reset();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user-id", email: "test@example.com" } }, error: null });
    mockSupabase.from.mockReturnValue(mockChain);
  });

  describe("createInvitation", () => {
    it("success - redirects with token", async () => {
      mockChain.single
        .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
        .mockResolvedValueOnce({ data: { token: "tok-123" }, error: null });
      await expect(createInvitation(fd({ groupId: "g1", email: "a@b.com", role: "parent" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("token=tok-123"));
    });

    it("unauthenticated - redirects to /login", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createInvitation(fd({ groupId: "g1", email: "a@b.com", role: "parent" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("not admin - redirects with error", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(createInvitation(fd({ groupId: "g1", email: "a@b.com", role: "parent" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("error="));
    });
  });
});
