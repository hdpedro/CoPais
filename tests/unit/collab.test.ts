import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — collab.ts goes through admin client (notifications inbox)
// and the push helper. Both stubbed so we can assert on calls.
// ---------------------------------------------------------------------------

const { mockAdminChain, mockAdminClient, mockSendPushToUser, mockCaptureServerEvent } =
  vi.hoisted(() => {
    const mockAdminChain: Record<string, any> = {
      select: vi.fn(),
      insert: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      in: vi.fn(),
      gte: vi.fn(),
      ilike: vi.fn(),
    };
    // Default: every method returns the chain so .eq().neq().in() works.
    // Tests override the terminal `select` / `insert` to inject results.
    for (const key of Object.keys(mockAdminChain)) {
      mockAdminChain[key].mockReturnValue(mockAdminChain);
    }

    const mockAdminClient = {
      from: vi.fn().mockReturnValue(mockAdminChain),
    };

    const mockSendPushToUser = vi.fn().mockResolvedValue(undefined);
    const mockCaptureServerEvent = vi.fn();

    return { mockAdminChain, mockAdminClient, mockSendPushToUser, mockCaptureServerEvent };
  });

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn().mockReturnValue(mockAdminClient) }));
vi.mock("@/lib/push", () => ({ sendPushToUser: mockSendPushToUser }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mockCaptureServerEvent }));

import { notifyCollabCreate } from "@/lib/services/collab";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain returns. Each test re-stubs the terminal methods.
  for (const key of Object.keys(mockAdminChain)) {
    if (typeof mockAdminChain[key]?.mockReturnValue === "function") {
      mockAdminChain[key].mockReturnValue(mockAdminChain);
    }
  }
});

/**
 * Helper: configure the admin chain so the first call (group_members select)
 * returns a list of coparents, the second call (notifications count) returns
 * a given count, and the third call (notifications insert) succeeds.
 *
 * Order of `from(table)` calls inside notifyCollabCreate per recipient:
 *   1. from("group_members").select().eq().neq().in()        → list of recipients
 *   2. from("notifications").select(...count, head=true).eq().eq().ilike().gte()   → recent count
 *   3. from("notifications").insert(...)                     → write inbox row
 *
 * We use sequential mock returns on `select` because it's the terminal call
 * used by both step 1 (returns data array) and step 2 (returns {count}).
 */
function stubCoparents(coparents: Array<{ user_id: string; role: string }>, recentCounts: number[]) {
  // Step 1: group_members select — chain ends on .in() returning {data}
  // The implementation awaits the result of `.in(...)`, so we make .in return
  // a thenable. Simplest: have .select() return a Promise-like via mockResolvedValueOnce.
  //
  // The chain pattern in the implementation:
  //   await admin.from("group_members").select("...").eq().neq().in("role", [...])
  // The last call is `.in(...)`. To make `await` work, .in must resolve to {data}.
  //
  // Plan: override the chain so each terminal returns the next queued value.
  // Step 1 terminal: .in() resolves to { data: coparents }
  // Step 2 terminal: .gte() resolves to { count: recentCounts[i] }
  // Step 3 terminal: .insert() resolves to { error: null }

  let stepCallCount = 0;
  mockAdminChain.in.mockImplementation(() => {
    stepCallCount++;
    if (stepCallCount === 1) {
      return Promise.resolve({ data: coparents });
    }
    return mockAdminChain;
  });

  let countIdx = 0;
  mockAdminChain.gte.mockImplementation(() => {
    // Each `.gte()` call inside the per-recipient loop is the terminal of
    // the count query. Return the next queued count.
    const c = recentCounts[countIdx] ?? 0;
    countIdx++;
    return Promise.resolve({ count: c });
  });

  mockAdminChain.insert.mockResolvedValue({ error: null });
}

describe("notifyCollabCreate", () => {
  it("returns silently when there are no coparents", async () => {
    mockAdminChain.in.mockResolvedValueOnce({ data: [] });

    await notifyCollabCreate({
      recordType: "school_log",
      recordId: "log-1",
      groupId: "g-1",
      actorUserId: "actor-1",
      priority: "info",
      title: "Amanda adicionou um registro escolar",
      message: "Prova de Inglês",
      link: "/escola?highlight=log-1",
    });

    expect(mockSendPushToUser).not.toHaveBeenCalled();
    expect(mockCaptureServerEvent).not.toHaveBeenCalled();
  });

  it("sends an individual push when this is the first record in the window", async () => {
    stubCoparents([{ user_id: "henrique", role: "admin" }], [0]);

    await notifyCollabCreate({
      recordType: "school_log",
      recordId: "log-1",
      groupId: "g-1",
      actorUserId: "amanda",
      priority: "info",
      title: "Amanda adicionou um registro escolar",
      message: "Prova de Inglês",
      link: "/escola?highlight=log-1",
    });

    expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
    const pushArg = mockSendPushToUser.mock.calls[0][1];
    expect(pushArg.title).toBe("Amanda adicionou um registro escolar");
    expect(pushArg.body).toBe("Prova de Inglês");
    expect(pushArg.url).toBe("/escola?highlight=log-1");
    // Tag is bucketed — `school_log:g-1:amanda:henrique:<bucket>`
    expect(pushArg.tag).toMatch(/^school_log:g-1:amanda:henrique:\d+$/);
  });

  it("aggregates the push title when a same-actor record already exists in the window", async () => {
    stubCoparents([{ user_id: "henrique", role: "admin" }], [2]); // 2 recent already

    await notifyCollabCreate({
      recordType: "school_log",
      recordId: "log-3",
      groupId: "g-1",
      actorUserId: "amanda",
      priority: "info",
      title: "Amanda adicionou um registro escolar",
      message: "Tarefa de Português",
      link: "/escola?highlight=log-3",
    });

    expect(mockSendPushToUser).toHaveBeenCalledTimes(1);
    const pushArg = mockSendPushToUser.mock.calls[0][1];
    // recentCount=2 + this one = 3 → coalesced
    expect(pushArg.title).toBe("Amanda adicionou 3 registros escolares");
    // Body is empty for aggregated push (the title carries the info)
    expect(pushArg.body).toBe("");
    // Aggregated push points to the module home, not the individual record
    expect(pushArg.url).toBe("/escola");
  });

  it("fires urgent_created when priority is urgent and notification_sent for each recipient", async () => {
    stubCoparents(
      [
        { user_id: "henrique", role: "admin" },
        { user_id: "gloria", role: "member" },
      ],
      [0, 0],
    );

    await notifyCollabCreate({
      recordType: "school_log",
      recordId: "log-99",
      groupId: "g-1",
      actorUserId: "amanda",
      priority: "urgent",
      title: "Amanda adicionou um registro escolar",
      message: "Bernardo brigou na escola",
    });

    // One notification_sent per recipient
    const sentCalls = mockCaptureServerEvent.mock.calls.filter((c) => c[1] === "notification_sent");
    expect(sentCalls).toHaveLength(2);
    // One urgent_created for the actor
    const urgentCalls = mockCaptureServerEvent.mock.calls.filter((c) => c[1] === "urgent_created");
    expect(urgentCalls).toHaveLength(1);
    expect(urgentCalls[0][0]).toBe("amanda");
  });

  it("never throws — push failures are swallowed (action must not be reverted on notify failure)", async () => {
    stubCoparents([{ user_id: "henrique", role: "admin" }], [0]);
    mockSendPushToUser.mockRejectedValueOnce(new Error("APNs down"));

    await expect(
      notifyCollabCreate({
        recordType: "school_log",
        recordId: "log-1",
        groupId: "g-1",
        actorUserId: "amanda",
        priority: "info",
        title: "Amanda adicionou um registro escolar",
        message: "Boletim",
      }),
    ).resolves.toBeUndefined();
  });
});
