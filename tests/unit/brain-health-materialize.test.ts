/* ------------------------------------------------------------------ */
/* brain-health-materialize — payloads da RPC + validação (PURO)        */
/*                                                                     */
/* Trava a materialização do plano de saúde e as SALVAGUARDAS: dose null */
/* → "Conforme prescrição" (nunca inventa), hash estável (base do undo), */
/* e o validador que barra entrada malformada antes da RPC.             */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import type { HealthVisitPlan, MaterializationPlan } from "@/lib/ai/brain/types";
import {
  buildAppointmentPayload,
  buildMedicationPayloads,
  buildEpisodePayloads,
  buildHealthPayloads,
  buildHealthOutboxPayloads,
  appointmentPayloadHash,
  MEDICATION_UNSPECIFIED,
} from "@/lib/ai/brain/materialize-health-payload";
import { validateHealthPlanForExecution, MAX_MEDICATIONS_PER_VISIT } from "@/lib/ai/brain/validate-health-plan";

const CHILD = "11111111-1111-1111-1111-111111111111";

function healthPlan(over: Partial<HealthVisitPlan> = {}): HealthVisitPlan {
  return {
    appointment: {
      childId: CHILD,
      title: "Consulta — Pediatria",
      appointmentType: "rotina",
      date: "2026-07-01",
      timeStart: null,
      professionalName: "Dra. Ana",
      specialty: "Pediatria",
      location: null,
      summary: "Disse que é alergia leve, observar",
    },
    episode: {
      childId: CHILD,
      title: "Alergia leve",
      diagnosis: "Alergia leve",
      symptoms: ["coceira"],
      severity: "leve",
      startDate: "2026-07-01",
    },
    medications: [
      {
        childId: CHILD,
        name: "Amoxicilina",
        dosage: "500 mg",
        frequency: "a cada 8h",
        frequencyHours: 8,
        careType: "medication",
        durationDays: 7,
        startDate: "2026-07-01",
        endDate: "2026-07-08",
        prescribedBy: "Dra. Ana",
        reason: "otite",
      },
    ],
    followUp: { date: "2026-08-05", notes: "retorno em 1 mês" },
    examRequests: [],
    ...over,
  };
}

function plan(h: HealthVisitPlan): MaterializationPlan {
  return { docType: "health_visit", confirmation: "single", health: h, collabRecordType: "medical_appointment" };
}

describe("materialize-health — payloads da RPC", () => {
  it("consulta completa → appointment/medications/episodes com campos corretos", () => {
    const all = buildHealthPayloads(plan(healthPlan()))!;
    expect(all.appointment.child_id).toBe(CHILD);
    expect(all.appointment.appointment_type).toBe("rotina");
    expect(all.appointment.status).toBe("completed");
    expect(all.appointment.notes).toBe("Profissional: Dra. Ana");
    expect(all.appointment.return_date).toBe("2026-08-05");
    expect(all.medications).toHaveLength(1);
    expect(all.medications[0].dosage).toBe("500 mg");
    expect(all.medications[0].end_date).toBe("2026-07-08");
    expect(all.episodes).toHaveLength(1);
    expect(all.episodes[0].symptoms).toEqual(["coceira"]);
  });

  it("SALVAGUARDA: dose/frequência null → 'Conforme prescrição' (nunca inventa)", () => {
    const meds = buildMedicationPayloads(
      healthPlan({
        medications: [
          { childId: CHILD, name: "Xarope", dosage: null, frequency: null, frequencyHours: null, careType: "medication", startDate: "2026-07-01" },
        ],
      }),
    );
    expect(meds[0].dosage).toBe(MEDICATION_UNSPECIFIED);
    expect(meds[0].frequency).toBe(MEDICATION_UNSPECIFIED);
    expect(meds[0].frequency_hours).toBeNull();
  });

  it("sem episódio → episodes = [] (não cria doença à toa)", () => {
    expect(buildEpisodePayloads(healthPlan({ episode: null }))).toEqual([]);
  });

  it("sem retorno → return_date/notes null no appointment", () => {
    const appt = buildAppointmentPayload(healthPlan({ followUp: null }));
    expect(appt.return_date).toBeNull();
    expect(appt.return_notes).toBeNull();
  });

  it("hash do appointment é ESTÁVEL (mesma entrada = mesmo hash) e SENSÍVEL (muda com o campo)", () => {
    const base = {
      childId: CHILD, title: "Consulta", appointmentType: "rotina", date: "2026-07-01",
      time: null, location: null, summary: "x", notes: null, returnDate: null, returnNotes: null, status: "completed",
    };
    expect(appointmentPayloadHash(base)).toBe(appointmentPayloadHash({ ...base }));
    expect(appointmentPayloadHash(base)).not.toBe(appointmentPayloadHash({ ...base, summary: "y" }));
  });

  it("outbox: 1 por destinatário, dedup, dedupe_key estável", () => {
    const out = buildHealthOutboxPayloads({
      intakeId: "intake-1", recipientIds: ["u2", "u2", "u3"], childId: CHILD,
      appointmentTitle: "Consulta — Pediatria", medicationCount: 1, hasFollowUp: true,
    });
    expect(out).toHaveLength(2); // u2 dedup
    expect(out[0].event_type).toBe("collab_notify");
    expect(out[0].payload.kind).toBe("health_visit");
    expect(new Set(out.map((o) => o.dedupe_key)).size).toBe(2);
  });
});

describe("validate-health-plan — backstop antes da RPC", () => {
  it("plano válido → ok", () => {
    expect(validateHealthPlanForExecution(plan(healthPlan()), "2026-07-01").ok).toBe(true);
  });

  it("plan.health ausente → erro", () => {
    const v = validateHealthPlanForExecution({ docType: "health_visit", confirmation: "single" }, "2026-07-01");
    expect(v.ok).toBe(false);
    expect(v.errors[0].field).toBe("health");
  });

  it("childId ausente na consulta → erro (backstop do needs_child_selection)", () => {
    const h = healthPlan();
    h.appointment.childId = null;
    const v = validateHealthPlanForExecution(plan(h), "2026-07-01");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.entity === "appointment" && e.field === "childId")).toBe(true);
  });

  it("appointment_type fora do enum → erro (evita cast quebrado)", () => {
    const h = healthPlan();
    (h.appointment as { appointmentType: string }).appointmentType = "consulta";
    const v = validateHealthPlanForExecution(plan(h), "2026-07-01");
    expect(v.errors.some((e) => e.field === "appointmentType")).toBe(true);
  });

  it("SALVAGUARDA: dose null NÃO é erro (transportador → 'Conforme prescrição')", () => {
    const h = healthPlan({
      medications: [{ childId: CHILD, name: "Xarope", dosage: null, frequency: null, frequencyHours: null, careType: "medication", startDate: "2026-07-01" }],
    });
    expect(validateHealthPlanForExecution(plan(h), "2026-07-01").ok).toBe(true);
  });

  it("severity fora do enum PT-BR → erro (evita INSERT silencioso)", () => {
    const h = healthPlan();
    (h.episode as { severity: string }).severity = "severe";
    const v = validateHealthPlanForExecution(plan(h), "2026-07-01");
    expect(v.errors.some((e) => e.entity === "episode" && e.field === "severity")).toBe(true);
  });

  it("retorno fora do horizonte → erro; retorno futuro (dentro de 548d) → ok", () => {
    const far = healthPlan({ followUp: { date: "2035-01-01", notes: null } });
    expect(validateHealthPlanForExecution(plan(far), "2026-07-01").ok).toBe(false);
    const ok = healthPlan({ followUp: { date: "2026-08-05", notes: null } });
    expect(validateHealthPlanForExecution(plan(ok), "2026-07-01").ok).toBe(true);
  });

  it("acima do teto de medicações → erro", () => {
    const many = Array.from({ length: MAX_MEDICATIONS_PER_VISIT + 1 }, (_, i) => ({
      childId: CHILD, name: `Med ${i}`, dosage: null, frequency: null, frequencyHours: null, careType: "medication" as const, startDate: "2026-07-01",
    }));
    const v = validateHealthPlanForExecution(plan(healthPlan({ medications: many })), "2026-07-01");
    expect(v.errors.some((e) => e.reason.startsWith("exceeds_max"))).toBe(true);
  });
});
