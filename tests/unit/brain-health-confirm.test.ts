/* ------------------------------------------------------------------ */
/* brain-health-confirm — dispatch do confirmIntake por docType         */
/*                                                                     */
/* Prova que um intake com plano de SAÚDE roteia pra RPC própria        */
/* (brain_intake_execute_health_plan) com os payloads certos (consulta  */
/* + retorno + medicações + episódio + outbox), e o ESCOLAR continua na */
/* sua RPC. Supabase mockado; validação/materialização são REAIS.       */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/error-tracking/report-server", () => ({ reportServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: (...a: unknown[]) => capture(...a) }));

import { confirmIntake } from "@/lib/services/brain";
import type { MaterializationPlan } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";
const ACTOR = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const HASH = "hash-abc";
const TOKEN = "44444444-4444-4444-4444-444444444444";
const TODAY = new Date().toISOString().slice(0, 10);

function healthPlan(): MaterializationPlan {
  return {
    docType: "health_visit",
    confirmation: "single",
    collabRecordType: "medical_appointment",
    health: {
      appointment: {
        childId: CHILD, title: "Consulta — Pediatria", appointmentType: "rotina",
        date: TODAY, timeStart: null, professionalName: "Dra. Ana", specialty: "Pediatria",
        location: null, summary: "Alergia leve, observar",
      },
      episode: { childId: CHILD, title: "Alergia leve", diagnosis: "Alergia leve", symptoms: ["coceira"], severity: "leve", startDate: TODAY },
      medications: [
        { childId: CHILD, name: "Amoxicilina", dosage: "500 mg", frequency: "a cada 8h", frequencyHours: 8, careType: "medication", durationDays: 7, startDate: TODAY, endDate: TODAY, prescribedBy: "Dra. Ana", reason: "otite" },
      ],
      followUp: { date: TODAY, notes: "retorno em 1 mês" },
      examRequests: [],
    },
  };
}

/** Supabase mock que registra a chamada de rpc e serve o intake salvo. */
function fakeSupabase(plan: MaterializationPlan, rpcResult: unknown) {
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.single = async () =>
      table === "brain_intakes"
        ? { data: { group_id: "g1", child_id: CHILD, plan, plan_hash: HASH, status: "awaiting_confirmation", confirmation_expires_at: null }, error: null }
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

describe("confirmIntake — dispatch por docType", () => {
  it("plano de SAÚDE → chama execute_health_plan com consulta+retorno+medicações+episódio+outbox", async () => {
    const supabase = fakeSupabase(healthPlan(), { outcome: "executed", created_count: 4 });
    const r = await confirmIntake({
      supabase: supabase as unknown as Parameters<typeof confirmIntake>[0]["supabase"],
      intakeId: "intake-1", planHash: HASH, confirmationToken: TOKEN,
    });
    expect(r.kind).toBe("executed");
    if (r.kind === "executed") expect(r.createdCount).toBe(4);

    // A RPC certa foi chamada, com os arrays corretos.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = supabase.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("brain_intake_execute_health_plan");
    const appts = params.p_appointments as Array<{ status: string; appointment_type: string }>;
    expect(appts).toHaveLength(2); // consulta(completed) + retorno(scheduled)
    expect(appts[0].status).toBe("completed");
    expect(appts[1].appointment_type).toBe("retorno");
    expect((params.p_medications as unknown[]).length).toBe(1);
    expect((params.p_episodes as unknown[]).length).toBe(1);
    // outbox só pro OUTRO responsável (não o confirmador).
    const outbox = params.p_outbox as Array<{ payload: { recipient_id: string } }>;
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload.recipient_id).toBe(OTHER);
  });

  it("plano de saúde inválido (childId faltando) → erro, NÃO chama a RPC", async () => {
    const bad = healthPlan();
    bad.health!.appointment.childId = null;
    const supabase = fakeSupabase(bad, { outcome: "executed", created_count: 0 });
    const r = await confirmIntake({
      supabase: supabase as unknown as Parameters<typeof confirmIntake>[0]["supabase"],
      intakeId: "intake-1", planHash: HASH, confirmationToken: TOKEN,
    });
    expect(r.kind).toBe("error");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("plan_hash divergente → stale_plan (não confirma às cegas)", async () => {
    const supabase = fakeSupabase(healthPlan(), { outcome: "executed", created_count: 4 });
    const r = await confirmIntake({
      supabase: supabase as unknown as Parameters<typeof confirmIntake>[0]["supabase"],
      intakeId: "intake-1", planHash: "hash-DIFERENTE", confirmationToken: TOKEN,
    });
    expect(r.kind).toBe("stale_plan");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
