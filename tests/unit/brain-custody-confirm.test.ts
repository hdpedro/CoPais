/* ------------------------------------------------------------------ */
/* brain-custody-confirm — dispatch do confirmIntake/undoIntake por     */
/* docType 'custody_routine': roteia pra RPC própria com os payloads    */
/* de governança certos; undo usa a RPC dedicada (acordo aprovado NÃO   */
/* se desfaz). Supabase mockado; validação/materialização são REAIS.    */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));

import { confirmIntake } from "@/lib/services/brain";
import { undoIntake } from "@/lib/services/brain-undo";
import type { MaterializationPlan } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";
const ACTOR = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const HASH = "hash-abc";
const TOKEN = "44444444-4444-4444-4444-444444444444";

function custodyPlan(): MaterializationPlan {
  return {
    docType: "custody_routine",
    confirmation: "single",
    collabRecordType: "custody_event",
    activities: [],
    custody: {
      items: [
        {
          kind: "custody_exception",
          childIds: [CHILD],
          startDate: "2026-07-08",
          endDate: "2026-07-12",
          responsible: { memberId: ACTOR, label: "Henrique" },
          reason: "viagem",
        },
        {
          kind: "leg_override",
          childIds: [CHILD],
          date: "2026-07-09",
          leg: "pickup",
          responsible: { memberId: null, label: "a avó" },
          time: "15:00",
          note: null,
        },
        {
          kind: "swap_proposal",
          childIds: [CHILD],
          originalDate: "2026-07-11",
          proposedDate: null,
          counterpart: { memberId: OTHER, label: "Fernanda" },
          reason: null,
        },
        {
          kind: "slot_change",
          childIds: [CHILD],
          weekday: 1,
          leg: "dropoff",
          responsible: { memberId: OTHER, label: "Fernanda" },
          time: "07:30",
        },
      ],
    },
  };
}

function fakeSupabase(plan: MaterializationPlan, rpcResult: unknown) {
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "is"]) chain[m] = () => chain;
    chain.single = async () =>
      table === "brain_intakes"
        ? {
            data: {
              group_id: "g1",
              child_id: CHILD,
              plan,
              plan_hash: HASH,
              status: "awaiting_confirmation",
              confirmation_expires_at: null,
              doc_type: "custody_routine",
              source_media_path: null,
            },
            error: null,
          }
        : { data: null, error: null };
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "group_members" ? [{ user_id: ACTOR }, { user_id: OTHER }] : [], error: null });
    return chain;
  };
  return {
    rpc,
    from,
    auth: { getUser: async () => ({ data: { user: { id: ACTOR } } }) },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("confirmIntake — dispatch custody_routine", () => {
  it("roteia pra execute_custody_plan com os 4 baldes + outbox (externo→narrador)", async () => {
    const supabase = fakeSupabase(custodyPlan(), { outcome: "executed", created_count: 3, proposed_count: 2 });
    const r = await confirmIntake({
      supabase: supabase as unknown as Parameters<typeof confirmIntake>[0]["supabase"],
      intakeId: "intake-1",
      planHash: HASH,
      confirmationToken: TOKEN,
    });
    expect(r.kind).toBe("executed");
    if (r.kind === "executed") expect(r.createdCount).toBe(3);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = supabase.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("brain_intake_execute_custody_plan");

    const events = params.p_custody_events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0].custody_type).toBe("exception");
    expect(events[0].responsible_user_id).toBe(ACTOR);

    const overrides = params.p_leg_overrides as Array<Record<string, unknown>>;
    expect(overrides).toHaveLength(1);
    expect(overrides[0].responsible_id).toBe(ACTOR); // externa → narrador
    expect(overrides[0].note).toContain("a avó");

    const swaps = params.p_swap_requests as Array<Record<string, unknown>>;
    expect(swaps).toHaveLength(1);
    expect(swaps[0].target_user_id).toBe(OTHER);

    const proposals = params.p_slot_proposals as Array<Record<string, unknown>>;
    expect(proposals).toHaveLength(1);
    expect(proposals[0].weekday).toBe(1);

    const outbox = params.p_outbox as Array<Record<string, unknown>>;
    expect(outbox).toHaveLength(1); // só o OTHER (ator excluído)
    const payload = outbox[0].payload as Record<string, unknown>;
    expect(payload.kind).toBe("custody_routine");
    expect(payload.recipient_id).toBe(OTHER);
    expect(payload.applied_count).toBe(2); // exceção + override
    expect(payload.swap_proposal_count).toBe(1);
    expect(payload.slot_proposal_count).toBe(1);
  });

  it("plano de guarda inválido (responsible externo em EXCEÇÃO) → erro sem RPC", async () => {
    const bad = custodyPlan();
    if (bad.custody!.items[0].kind === "custody_exception") {
      bad.custody!.items[0].responsible = { memberId: null, label: "a avó" };
    }
    const supabase = fakeSupabase(bad, { outcome: "executed", created_count: 0 });
    const r = await confirmIntake({
      supabase: supabase as unknown as Parameters<typeof confirmIntake>[0]["supabase"],
      intakeId: "intake-1",
      planHash: HASH,
      confirmationToken: TOKEN,
    });
    expect(r.kind).toBe("error");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("undoIntake — dispatch custody_routine", () => {
  it("roteia pra apply_undo_custody (sem arrays) e transporta kept em detached", async () => {
    const supabase = fakeSupabase(custodyPlan(), { outcome: "undone", removed: 3, kept_agreements: 1, cancelled_outbox: 1 });
    const r = await undoIntake({
      supabase: supabase as unknown as Parameters<typeof undoIntake>[0]["supabase"],
      intakeId: "intake-1",
    });
    expect(r.kind).toBe("undone");
    if (r.kind === "undone") {
      expect(r.removed).toBe(3);
      expect(r.detached).toBe(1); // acordo aprovado mantido
    }
    const call = supabase.rpc.mock.calls.find(
      (c: unknown[]) => c[0] === "brain_intake_apply_undo_custody",
    ) as unknown as [string, Record<string, unknown>];
    expect(call).toBeTruthy();
    expect(call[1].p_intake_id).toBe("intake-1");
  });
});
