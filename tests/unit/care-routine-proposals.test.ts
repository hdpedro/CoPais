/* ------------------------------------------------------------------ */
/* N4 — proposta PERMANENTE de rotina (OK-do-outro): frase humana do    */
/* card, mapeamento dos outcomes da RPC (governança: proponente não     */
/* aceita a própria proposta) e o rótulo humano no payload do Brain.    */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi } from "vitest";
import {
  describeSlotProposal,
  respondToSlotProposal,
} from "@/lib/services/care-routine-proposals";
import { buildSlotChangeProposals } from "@/lib/ai/brain/materialize-custody-payload";
import type { CustodyRoutinePlan } from "@/lib/ai/brain/types";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/push", () => ({ createNotificationWithPush: vi.fn(async () => {}) }));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));

function fakeSupabase(rpcResult: unknown, rpcError: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data: rpcResult, error: rpcError })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe("describeSlotProposal — frase humana", () => {
  it("dia + verbo da perna + rótulo + hora", () => {
    expect(
      describeSlotProposal({ weekday: 1, leg: "dropoff", responsible_label: "Fernanda", time_of_day: "07:30:00" }),
    ).toBe("toda segunda quem leva passa a ser Fernanda às 07:30");
    expect(
      describeSlotProposal({ weekday: 4, leg: "pickup", responsible_label: "Henrique", time_of_day: null }),
    ).toBe("toda quinta quem busca passa a ser Henrique");
  });

  it("sem rótulo → fallback calmo", () => {
    expect(
      describeSlotProposal({ weekday: 5, leg: "pickup", responsible_label: null, time_of_day: null }),
    ).toContain("o responsável combinado");
  });
});

describe("respondToSlotProposal — governança nos outcomes", () => {
  it("aceita: outcome + slots materializados", async () => {
    const sb = fakeSupabase({ outcome: "accepted", slots_updated: 2, proposed_by: "u1", group_id: "g1" });
    const r = await respondToSlotProposal(sb, { proposalId: "p1", responderId: "u2", decision: "accepted" });
    expect(r).toEqual({ ok: true, data: { outcome: "accepted", slotsUpdated: 2 } });
  });

  it("own_proposal → 403 com a regra dita em português", async () => {
    const sb = fakeSupabase({ outcome: "own_proposal" });
    const r = await respondToSlotProposal(sb, { proposalId: "p1", responderId: "u1", decision: "accepted" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toContain("o OK é do outro");
    }
  });

  it("already_responded → 409; not_found → 404; decisão inválida → 400 sem RPC", async () => {
    expect((await respondToSlotProposal(fakeSupabase({ outcome: "already_responded", status: "accepted" }), { proposalId: "p", responderId: "u", decision: "declined" })) as { ok: boolean; status?: number }).toMatchObject({ ok: false, status: 409 });
    expect((await respondToSlotProposal(fakeSupabase({ outcome: "not_found" }), { proposalId: "p", responderId: "u", decision: "accepted" })) as { ok: boolean; status?: number }).toMatchObject({ ok: false, status: 404 });
    const sb = fakeSupabase({});
    const bad = await respondToSlotProposal(sb, { proposalId: "p", responderId: "u", decision: "maybe" as never });
    expect(bad).toMatchObject({ ok: false, status: 400 });
    expect((sb.rpc as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe("buildSlotChangeProposals — rótulo humano viaja no payload (N4)", () => {
  it("responsible_label presente pro card da proposta", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "slot_change",
          childIds: ["c1"],
          weekday: 1,
          leg: "dropoff",
          responsible: { memberId: "u-mae", label: "Fernanda" },
          time: "07:30",
        },
      ],
    };
    const [p] = buildSlotChangeProposals(plan);
    expect(p.responsible_label).toBe("Fernanda");
    expect(p.responsible_id).toBe("u-mae");
    expect(p.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
