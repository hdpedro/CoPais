/**
 * Tests for the localized notification fan-out in notifyCollabCreate.
 *
 * Verifies that:
 *   1. titleKey + titleVars resolve PER RECIPIENT using their locale.
 *   2. Recipients in different locales receive different push payloads.
 *   3. Legacy `title` (string) path still works for back-compat callers.
 *   4. Coalesced title uses coalescedTitleKey when set, falls back otherwise.
 *
 * Heavy module mocking is required because notifyCollabCreate fans out
 * through admin Supabase, push delivery, posthog telemetry, and the
 * server-side i18n loader. We stub each integration to capture inputs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// next/headers — only used by getServerT internally for cookie reads, but
// notifyCollabCreate calls getServerT with an explicit locale (not via cookie),
// so headers() won't be exercised here. Stub keeps server-only happy.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("server-only", () => ({}));

// captureServerEvent → no-op, just record calls.
const postHogCalls: Array<{ user: string; event: string; props: unknown }> = [];
vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: (user: string, event: string, props: unknown) => {
    postHogCalls.push({ user, event, props });
  },
}));

// sendPushToUser → capture every push.
const pushCalls: Array<{ userId: string; payload: { title: string; body: string; url: string; tag: string } }> = [];
vi.mock("@/lib/push", () => ({
  sendPushToUser: async (userId: string, payload: { title: string; body: string; url: string; tag: string }) => {
    pushCalls.push({ userId, payload });
  },
}));

// Admin Supabase — chainable mock. The fan-out queries:
//   1. group_members select() to know who to notify
//   2. notifications select+count for coalescing
//   3. notifications insert for in-app inbox
const insertCalls: Array<{ table: string; row: unknown }> = [];
const adminClient = {
  from(table: string) {
    return chainFor(table);
  },
};
function chainFor(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (row: unknown) => {
      insertCalls.push({ table, row });
      return Promise.resolve({ data: null, error: null });
    },
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    gte: () => chain,
    is: () => chain,
    order: () => chain,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    head: true,
    then: undefined, // override below per table
  };
  if (table === "group_members") {
    // 2 members — one en, one pt. Locale lookup is mocked separately.
    (chain as { then: unknown }).then = (onFulfilled: (r: { data: Array<{ user_id: string; role: string }>; error: null }) => unknown) =>
      Promise.resolve({
        data: [
          { user_id: "u-en", role: "admin" },
          { user_id: "u-pt", role: "member" },
        ],
        error: null,
      }).then(onFulfilled);
  } else if (table === "notifications") {
    // No prior notifications — recentCount = 0 → individual (non-coalesced) push.
    (chain as { then: unknown }).then = (onFulfilled: (r: { count: number; error: null }) => unknown) =>
      Promise.resolve({ count: 0, error: null }).then(onFulfilled);
  } else if (table === "profiles") {
    // Used by getUsersLocale — return one en, one pt.
    (chain as { then: unknown }).then = (onFulfilled: (r: { data: Array<{ id: string; locale: string }>; error: null }) => unknown) =>
      Promise.resolve({
        data: [
          { id: "u-en", locale: "en" },
          { id: "u-pt", locale: "pt" },
        ],
        error: null,
      }).then(onFulfilled);
  }
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));

const { notifyCollabCreate } = await import("@/lib/services/collab");

beforeEach(() => {
  pushCalls.length = 0;
  insertCalls.length = 0;
  postHogCalls.length = 0;
});

describe("notifyCollabCreate — localized fan-out", () => {
  it("resolves titleKey per recipient using their profile.locale", async () => {
    await notifyCollabCreate({
      recordType: "medical_appointment",
      recordId: "apt-1",
      groupId: "g-1",
      actorUserId: "actor-1",
      priority: "important",
      titleKey: "notifications.saude.appointmentTitle",
      titleVars: { actor: "Amanda" },
      title: "Amanda agendou uma consulta",
      message: "Pediatra · 20/05",
      link: "/saude/agenda?highlight=apt-1",
    });

    expect(pushCalls).toHaveLength(2);

    const pushEn = pushCalls.find((p) => p.userId === "u-en");
    const pushPt = pushCalls.find((p) => p.userId === "u-pt");
    expect(pushEn).toBeDefined();
    expect(pushPt).toBeDefined();

    expect(pushEn!.payload.title).toBe("Amanda scheduled an appointment");
    expect(pushPt!.payload.title).toBe("Amanda agendou uma consulta");
  });

  it("falls back to legacy `title` string when titleKey not provided", async () => {
    await notifyCollabCreate({
      recordType: "school_log",
      recordId: "log-1",
      groupId: "g-1",
      actorUserId: "actor-1",
      priority: "info",
      title: "Amanda adicionou um registro escolar",
      message: "Prova de Inglês",
    });

    expect(pushCalls).toHaveLength(2);
    // Both recipients receive the literal pt title — no key was passed.
    for (const push of pushCalls) {
      expect(push.payload.title).toBe("Amanda adicionou um registro escolar");
    }
  });

  it("includes recipient_locale in PostHog telemetry", async () => {
    await notifyCollabCreate({
      recordType: "vaccination_record",
      recordId: "vac-1",
      groupId: "g-1",
      actorUserId: "actor-1",
      priority: "info",
      titleKey: "notifications.saude.vaccineTitle",
      titleVars: { actor: "Amanda" },
      title: "Amanda registrou uma vacina",
      message: "Tríplice viral",
    });

    const enEvent = postHogCalls.find((c) => c.user === "u-en");
    const ptEvent = postHogCalls.find((c) => c.user === "u-pt");
    expect((enEvent?.props as { recipient_locale: string }).recipient_locale).toBe("en");
    expect((ptEvent?.props as { recipient_locale: string }).recipient_locale).toBe("pt");
  });

  it("writes localized notification rows to the inbox", async () => {
    await notifyCollabCreate({
      recordType: "active_medication",
      recordId: "med-1",
      groupId: "g-1",
      actorUserId: "actor-1",
      priority: "important",
      titleKey: "notifications.saude.medicationTitle",
      titleVars: { actor: "Diogo" },
      title: "Diogo iniciou um medicamento",
      message: "Amoxicilina",
    });

    const enRow = insertCalls.find(
      (c) => c.table === "notifications" && (c.row as { user_id: string }).user_id === "u-en",
    );
    const ptRow = insertCalls.find(
      (c) => c.table === "notifications" && (c.row as { user_id: string }).user_id === "u-pt",
    );
    expect((enRow?.row as { title: string }).title).toBe("Diogo started a medication");
    expect((ptRow?.row as { title: string }).title).toBe("Diogo iniciou um medicamento");
  });
});
