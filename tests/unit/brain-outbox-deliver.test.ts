/* ------------------------------------------------------------------ */
/* brain-outbox-deliver — worker ramifica por kind (escolar vs saúde)   */
/*                                                                     */
/* Prova que o worker do outbox entrega a coordenação de SAÚDE pro      */
/* coparente (título com nome da criança, link /saude, tipo próprio) e  */
/* que o ESCOLAR segue idêntico (/escola). Deps de I/O mockadas.        */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn(async () => {}) }));

function makeAdmin(rows: unknown[], childName = "Otto Silva", intakeStatus = "executed") {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.update = () => chain;
    chain.eq = () => chain;
    chain.single = async () =>
      table === "children"
        ? { data: { full_name: childName }, error: null }
        : table === "brain_intakes"
          ? { data: { status: intakeStatus }, error: null }
          : { data: null, error: null };
    chain.then = (res: (v: unknown) => unknown) => res({ error: null });
    return chain;
  };
  return { rpc: vi.fn(async () => ({ data: rows, error: null })), from };
}

let adminInstance: ReturnType<typeof makeAdmin>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminInstance }));
vi.mock("@/lib/push", () => ({ createNotificationWithPush: push }));
vi.mock("@/i18n/server", () => ({ getServerT: async () => (key: string, params?: Record<string, unknown>) => (params ? `${key}::${JSON.stringify(params)}` : key) }));
vi.mock("@/lib/locale-utils", () => ({ getUsersLocale: async () => new Map() }));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));

import { runOutboxWorker } from "@/lib/services/brain-outbox";

beforeEach(() => vi.clearAllMocks());

describe("runOutboxWorker.deliver — ramificação por kind", () => {
  it("payload de SAÚDE → notifica com título de consulta + link /saude + tipo brain_health_visit", async () => {
    adminInstance = makeAdmin([
      { id: "o1", event_type: "collab_notify", attempts: 0, payload: { kind: "health_visit", recipient_id: "u2", intake_id: "i1", child_id: "c1", medication_count: 1 } },
    ]);
    const r = await runOutboxWorker(10);
    expect(r.delivered).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    const [uid, type, title, body, link] = push.mock.calls[0] as unknown as [string, string, string, string, string];
    expect(uid).toBe("u2");
    expect(type).toBe("brain_health_visit");
    expect(link).toBe("/saude");
    expect(title).toContain("healthVisitTitle");
    expect(title).toContain("Otto"); // 1º nome da criança injetado
    expect(body).toContain("healthVisitBody");
  });

  it("payload ESCOLAR (sem kind) → segue idêntico: brain_school_calendar + /escola", async () => {
    adminInstance = makeAdmin([
      { id: "o2", event_type: "collab_notify", attempts: 0, payload: { recipient_id: "u3", intake_id: "i2", created_count: 3 } },
    ]);
    await runOutboxWorker(10);
    const [uid, type, , , link] = push.mock.calls[0] as unknown as [string, string, string, string, string];
    expect(uid).toBe("u3");
    expect(type).toBe("brain_school_calendar");
    expect(link).toBe("/escola");
  });
});
