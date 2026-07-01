/* ------------------------------------------------------------------ */
/* brain-health-undo — dispatch do undo por docType                     */
/*                                                                     */
/* Prova que desfazer uma CONSULTA (doc_type health_visit) roteia pra   */
/* RPC própria (brain_intake_apply_undo_health) com os entity_ids dos   */
/* artefatos de saúde, e não a RPC escolar. Supabase mockado.           */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ remove: async () => ({ error: null }) }) }, from: () => ({ update: () => ({ eq: async () => ({}) }), insert: async () => ({}) }) }) }));

import { undoIntake } from "@/lib/services/brain-undo";

const ACTOR = "22222222-2222-2222-2222-222222222222";

function fakeSupabase(docType: string, artifacts: Array<{ id: string; entity_id: string }>, undoResult: unknown) {
  const rpc = vi.fn(async () => ({ data: undoResult, error: null }));
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is"]) chain[m] = () => chain;
    chain.single = async () =>
      table === "brain_intakes" ? { data: { doc_type: docType, group_id: "g1", source_media_path: null }, error: null } : { data: null, error: null };
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === "brain_intake_artifacts" ? artifacts : [], error: null });
    return chain;
  };
  return { rpc, from, auth: { getUser: async () => ({ data: { user: { id: ACTOR } } }) } };
}

beforeEach(() => vi.clearAllMocks());

describe("undoIntake — dispatch por docType", () => {
  it("consulta (health_visit) → chama apply_undo_health com os entity_ids de saúde", async () => {
    const arts = [
      { id: "a1", entity_id: "e-appt" },
      { id: "a2", entity_id: "e-med" },
      { id: "a3", entity_id: "e-epi" },
    ];
    const supabase = fakeSupabase("health_visit", arts, { outcome: "undone", removed: 3, detached: 0 });
    const r = await undoIntake({
      supabase: supabase as unknown as Parameters<typeof undoIntake>[0]["supabase"],
      intakeId: "intake-1",
    });
    expect(r.kind).toBe("undone");
    if (r.kind === "undone") expect(r.removed).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = supabase.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("brain_intake_apply_undo_health");
    expect(params.p_delete_entity_ids).toEqual(["e-appt", "e-med", "e-epi"]);
    expect(params.p_detach_artifact_ids).toEqual([]); // A0 delete-all
  });

  it("consulta sem artefatos ativos → 'Nada a desfazer', sem RPC", async () => {
    const supabase = fakeSupabase("health_visit", [], { outcome: "undone", removed: 0, detached: 0 });
    const r = await undoIntake({
      supabase: supabase as unknown as Parameters<typeof undoIntake>[0]["supabase"],
      intakeId: "intake-1",
    });
    expect(r.kind).toBe("undone");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
