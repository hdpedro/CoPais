import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockSupabase, mockGetActiveGroup } = vi.hoisted(() => {
  const mockRedirect = vi.fn();
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  const mockGetActiveGroup = vi.fn();
  return { mockRedirect, mockSupabase, mockGetActiveGroup };
});

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@/lib/group-utils", () => ({
  getActiveGroup: (...args: any[]) => mockGetActiveGroup(...args),
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@/lib/push", () => ({
  createNotificationWithPush: vi.fn().mockResolvedValue(undefined),
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/recurrence-utils", () => ({
  getOccurrences: vi.fn().mockReturnValue([]),
  parseDaysOfWeek: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/calendar-utils", () => ({
  formatDateKey: vi.fn().mockReturnValue("2026-03-29"),
  getBrazilToday: vi.fn().mockReturnValue("2026-03-29"),
}));

vi.mock("@/lib/chat-notify", () => ({
  postChatNotification: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-1" };
const ACTIVE_GROUP = {
  groupId: "group-1",
  role: "parent",
  groupName: "Familia",
  isReadonly: false,
  memberships: [],
  hasMultipleGroups: false,
};

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function chainMock(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockReturnThis(),
  };
  // Allow .insert().select().single() chaining
  chain.insert.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  createActivity,
  deleteActivity,
  toggleChecklistItem,
  cancelActivityOccurrence,
  deleteEvent,
  deleteAppointment,
} from "@/actions/activities";

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- createActivity -------------------------------------------------------

describe("createActivity", () => {
  it("creates activity and redirects to /calendario on success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // insert into child_activities -> returns activity with id
    const activityChain = chainMock({
      data: { id: "act-1" },
      error: null,
    });
    // group_members query for notifications
    const membersChain = chainMock({ data: [], error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "child_activities") return activityChain;
      if (table === "group_members") return membersChain;
      if (table === "children") return chainMock({ data: null, error: null });
      return chainMock({ data: null, error: null });
    });

    const fd = makeFormData({
      name: "Swimming class",
      category: "sports",
      startDate: "2026-04-01",
    });

    await expect(createActivity(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/calendario?success=")
    );
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const fd = makeFormData({ name: "Test", category: "other" });

    await expect(createActivity(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /onboarding when no active group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(null);

    const fd = makeFormData({ name: "Test", category: "other" });

    await expect(createActivity(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("returns error when name is empty", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const fd = makeFormData({ name: "", category: "other" });

    const result = await createActivity(fd);

    expect(result).toEqual({ error: "Nome da atividade e obrigatorio." });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns error when DB insert fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const activityChain = chainMock({
      data: null,
      error: { message: "DB error" },
    });
    mockSupabase.from.mockReturnValue(activityChain);

    const fd = makeFormData({ name: "Test", category: "other" });

    const result = await createActivity(fd);

    expect(result).toEqual({ error: "Erro ao criar atividade: DB error" });
  });
});

// ---- deleteActivity -------------------------------------------------------

describe("deleteActivity", () => {
  it("deletes activity and redirects on success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // find activity
    const findChain = chainMock({
      data: { id: "act-1", group_id: "group-1" },
      error: null,
    });
    // delete
    const deleteChain = chainMock({ data: null, error: null });

    let callNum = 0;
    mockSupabase.from.mockImplementation(() => {
      callNum++;
      if (callNum === 1) return findChain;
      return deleteChain;
    });

    await expect(deleteActivity("act-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/calendario?success=")
    );
  });

  it("returns error when activity not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const findChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain);

    const result = await deleteActivity("nonexistent");

    expect(result).toEqual({ error: "Atividade nao encontrada" });
  });

  it("returns error when activity belongs to different group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const findChain = chainMock({
      data: { id: "act-1", group_id: "other-group" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(findChain);

    const result = await deleteActivity("act-1");

    expect(result).toEqual({ error: "Atividade nao encontrada" });
  });

  it("returns error when activityId is empty", async () => {
    const result = await deleteActivity("");

    expect(result).toEqual({ error: "ID da atividade obrigatorio" });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(deleteActivity("act-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// ---- toggleChecklistItem --------------------------------------------------

describe("toggleChecklistItem", () => {
  it("upserts completion when completed=true", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const upsertChain = chainMock({ data: null, error: null });
    // Override upsert to resolve directly since it's called on the chain
    upsertChain.upsert = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue(upsertChain);

    const result = await toggleChecklistItem("act-1", "item-1", "2026-03-29", true);

    expect(result).toEqual({ success: true });
    expect(mockSupabase.from).toHaveBeenCalledWith("checklist_completions");
  });

  it("deletes completion when completed=false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const deleteChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(deleteChain);

    const result = await toggleChecklistItem("act-1", "item-1", "2026-03-29", false);

    expect(result).toEqual({ success: true });
  });

  it("returns error when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await toggleChecklistItem("act-1", "item-1", "2026-03-29", true);

    expect(result).toEqual({ error: "Nao autenticado" });
  });
});

// ---- cancelActivityOccurrence ---------------------------------------------

describe("cancelActivityOccurrence", () => {
  it("cancels occurrence and returns success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // find activity
    const findChain = chainMock({
      data: { id: "act-1", name: "Swim", group_id: "group-1", child_id: null, children: null },
      error: null,
    });
    // upsert report
    const upsertChain = chainMock({ data: null, error: null });
    upsertChain.upsert = vi.fn().mockResolvedValue({ error: null });

    let callNum = 0;
    mockSupabase.from.mockImplementation(() => {
      callNum++;
      if (callNum === 1) return findChain;
      return upsertChain;
    });

    const result = await cancelActivityOccurrence("act-1", "2026-03-29");

    expect(result).toEqual({ success: true });
  });

  it("returns error when activity not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const findChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain);

    const result = await cancelActivityOccurrence("nonexistent", "2026-03-29");

    expect(result).toEqual({ error: "Atividade nao encontrada" });
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      cancelActivityOccurrence("act-1", "2026-03-29")
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// ---- deleteEvent ----------------------------------------------------------

describe("deleteEvent", () => {
  it("deletes event and returns success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // find event
    const findChain = chainMock({
      data: { id: "evt-1", group_id: "group-1" },
      error: null,
    });
    // delete
    const deleteChain = chainMock({ data: null, error: null });

    let callNum = 0;
    mockSupabase.from.mockImplementation(() => {
      callNum++;
      if (callNum === 1) return findChain;
      return deleteChain;
    });

    const result = await deleteEvent("evt-1");

    expect(result).toEqual({ success: true });
  });

  it("returns error when event not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const findChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain);

    const result = await deleteEvent("nonexistent");

    expect(result).toEqual({ error: "Evento nao encontrado" });
  });

  it("returns error when eventId is empty", async () => {
    const result = await deleteEvent("");

    expect(result).toEqual({ error: "ID do evento obrigatorio" });
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(deleteEvent("evt-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// ---- deleteAppointment ----------------------------------------------------

describe("deleteAppointment", () => {
  it("deletes appointment and returns success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // find appointment
    const findChain = chainMock({
      data: { id: "apt-1", group_id: "group-1" },
      error: null,
    });
    // delete
    const deleteChain = chainMock({ data: null, error: null });

    let callNum = 0;
    mockSupabase.from.mockImplementation(() => {
      callNum++;
      if (callNum === 1) return findChain;
      return deleteChain;
    });

    const result = await deleteAppointment("apt-1");

    expect(result).toEqual({ success: true });
  });

  it("returns error when appointment not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    const findChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(findChain);

    const result = await deleteAppointment("nonexistent");

    expect(result).toEqual({ error: "Consulta nao encontrada" });
  });

  it("returns error when appointmentId is empty", async () => {
    const result = await deleteAppointment("");

    expect(result).toEqual({ error: "ID da consulta obrigatorio" });
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(deleteAppointment("apt-1")).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
