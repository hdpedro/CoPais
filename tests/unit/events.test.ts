import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockChain, mockSupabase, mockVerifyGroupMembership } =
  vi.hoisted(() => {
    const mockRedirect = vi.fn();

    const mockChain: Record<string, any> = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      in: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    };
    for (const key of Object.keys(mockChain)) mockChain[key].mockReturnValue(mockChain);

    const mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn().mockReturnValue(mockChain),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: "https://test/file.jpg" },
          }),
        }),
      },
    };

    const mockVerifyGroupMembership = vi.fn();

    return { mockRedirect, mockChain, mockSupabase, mockVerifyGroupMembership };
  });

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));
vi.mock("@/lib/auth-utils", () => ({
  verifyGroupMembership: mockVerifyGroupMembership,
}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/chat-notify", () => ({
  postChatNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/push", () => ({
  createNotificationWithPush: vi.fn().mockResolvedValue(undefined),
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createEvent, updateEvent, deleteEvent, cancelEvent } from "@/actions/events";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

/** Set up the chain so that awaiting any terminal returns {data, error}. */
function setupChain() {
  for (const key of Object.keys(mockChain)) {
    if (typeof mockChain[key]?.mockReturnValue === "function") {
      mockChain[key].mockReturnValue(mockChain);
    }
  }
  mockChain.then = (resolve: any) => resolve({ data: null, error: null });
  mockChain.single.mockResolvedValue({ data: { id: "child-1" }, error: null });
}

/** Expect redirect to match a substring (handles encodeURIComponent) */
/** Match redirect against text (tries both plain and URL-encoded). */
function expectRedirectContains(text: string) {
  const call = mockRedirect.mock.calls[0]?.[0] ?? "";
  const match = call.includes(text) || call.includes(encodeURIComponent(text)) || decodeURIComponent(call).includes(text);
  expect(match).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("events actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null,
    });
    mockVerifyGroupMembership.mockResolvedValue({ role: "admin" });

    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  // -------------------------------------------------------------------------
  // createEvent
  // -------------------------------------------------------------------------

  describe("createEvent", () => {
    const base = {
      groupId: "group-1",
      childId: "child-1",
      title: "Festa de aniversario",
      eventDate: "2026-06-15",
      eventTime: "14:00",
      description: "Descricao do evento",
      location: "Parque",
      allDay: "false",
    };

    it("creates an event and redirects to /calendario on success", async () => {
      await expect(createEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockSupabase.from).toHaveBeenCalledWith("events");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when user is not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirects with error when title is empty", async () => {
      await expect(createEvent(fd({ ...base, title: "   " }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Titulo obrigatorio");
    });

    it("creates multi-day events when endDate is provided", async () => {
      await expect(createEvent(fd({ ...base, endDate: "2026-06-17" }))).rejects.toThrow("NEXT_REDIRECT");
      const rows = mockChain.insert.mock.calls[0][0];
      expect(rows).toHaveLength(3);
      expect(rows[0].title).toContain("(1/3)");
    });

    it("redirects with error when user has no membership", async () => {
      mockVerifyGroupMembership.mockResolvedValueOnce(null);
      await expect(createEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Sem permissao");
    });

    it("handles optional image upload", async () => {
      const f = fd(base);
      f.set("image", new File(["img"], "photo.jpg", { type: "image/jpeg" }));
      await expect(createEvent(f)).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("rejects invalid image MIME type", async () => {
      const f = fd(base);
      const file = new File(["data"], "file.exe", { type: "application/x-msdownload" });
      Object.defineProperty(file, "size", { value: 100 });
      f.set("image", file);
      await expect(createEvent(f)).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Tipo de arquivo");
    });
  });

  // -------------------------------------------------------------------------
  // updateEvent
  // -------------------------------------------------------------------------

  describe("updateEvent", () => {
    const base = {
      eventId: "event-1", groupId: "group-1", childId: "child-1",
      title: "Titulo atualizado", eventDate: "2026-07-01",
      eventTime: "10:00", description: "Nova descricao", location: "Escola",
    };

    it("updates an event and redirects to /calendario", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { created_by: "test-user-id" }, error: null });
      await expect(updateEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(updateEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("creates request for non-creator non-admin users instead of blocking", async () => {
      // New behavior: non-creator creates a request and redirects to /calendario
      // (instead of blocking with "Apenas o criador..." error)
      mockChain.single
        .mockResolvedValueOnce({ data: { created_by: "other-user-id", title: "Evento X", event_date: "2026-07-01", event_time: null, status: "active" }, error: null })
        .mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(updateEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      // Should redirect to /calendario (with requestSent or error param)
      const call = mockRedirect.mock.calls[0]?.[0] ?? "";
      expect(call).toContain("/calendario");
    });
  });

  // -------------------------------------------------------------------------
  // deleteEvent
  // -------------------------------------------------------------------------

  describe("deleteEvent", () => {
    const base = { eventId: "event-1", groupId: "group-1" };

    it("deletes an event and redirects to /calendario", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { created_by: "test-user-id" }, error: null });
      await expect(deleteEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(deleteEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("creates request for non-creator non-admin users instead of blocking", async () => {
      mockChain.single
        .mockResolvedValueOnce({ data: { created_by: "other-user-id", title: "Evento X", event_date: "2026-07-01", event_time: null, status: "active" }, error: null })
        .mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(deleteEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      const call = mockRedirect.mock.calls[0]?.[0] ?? "";
      expect(call).toContain("/calendario");
    });
  });

  // -------------------------------------------------------------------------
  // cancelEvent
  // -------------------------------------------------------------------------

  describe("cancelEvent", () => {
    const base = { eventId: "event-1", groupId: "group-1" };

    it("cancels an event and redirects to /calendario", async () => {
      mockChain.single.mockResolvedValueOnce({ data: { created_by: "test-user-id" }, error: null });
      await expect(cancelEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/calendario");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(cancelEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("creates request for non-creator non-admin users instead of blocking", async () => {
      mockChain.single
        .mockResolvedValueOnce({ data: { created_by: "other-user-id", title: "Evento X", event_date: "2026-07-01", event_time: null, status: "active" }, error: null })
        .mockResolvedValueOnce({ data: { role: "member" }, error: null });
      await expect(cancelEvent(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      const call = mockRedirect.mock.calls[0]?.[0] ?? "";
      expect(call).toContain("/calendario");
    });
  });
});
