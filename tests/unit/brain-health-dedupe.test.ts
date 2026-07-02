/* ------------------------------------------------------------------ */
/* Dedup de CONSULTA contra o histórico (Falha real do E2E em loop:     */
/* reenvio do MESMO relato dobrou consulta+retorno+medicação).           */
/* Trava: duplicata INTEGRAL bloqueia; componente novo passa.            */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  healthAppointmentKey,
  healthMedicationKey,
  healthPlanProbe,
  isFullHealthDuplicate,
  type ExistingHealthSnapshot,
} from "@/lib/ai/brain/health-dedupe";
import { buildAppointmentPayloads, buildMedicationPayloads } from "@/lib/ai/brain/materialize-health-payload";
import type { HealthVisitPlan } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

/** Plano-referência: o MESMO cenário do E2E (consulta+retorno+1 medicação). */
function makePlan(overrides?: Partial<HealthVisitPlan>): HealthVisitPlan {
  return {
    appointment: {
      childId: CHILD,
      title: "Consulta — Pediatria",
      appointmentType: "rotina",
      specialty: "Pediatria",
      date: "2026-07-01",
      timeStart: null,
      location: null,
      summary: "disse que é uma alergia leve",
      professionalName: null,
    },
    episode: {
      childId: CHILD,
      title: "alergia leve",
      diagnosis: "alergia leve",
      symptoms: [],
      severity: "leve",
      startDate: "2026-07-01",
    },
    medications: [
      {
        childId: CHILD,
        name: "antialérgico",
        dosage: null,
        frequency: null,
        frequencyHours: null,
        careType: "medication",
        reason: null,
        prescribedBy: null,
        startDate: "2026-07-01",
        endDate: "2026-07-08",
        durationDays: 7,
      },
    ],
    followUp: { date: "2026-08-05", notes: "retorno no dia 5 de agosto" },
    examRequests: [],
    ...overrides,
  } as HealthVisitPlan;
}

/** Snapshot em que TUDO que o plano criaria já existe (derivado dos builders,
 *  como o serviço monta a partir do banco). */
function fullSnapshotFor(plan: HealthVisitPlan): ExistingHealthSnapshot {
  return {
    appointmentKeys: new Set(
      buildAppointmentPayloads(plan).map((a) =>
        healthAppointmentKey(a.child_id, a.appointment_date, a.appointment_type, a.title),
      ),
    ),
    medicationKeys: new Set(
      buildMedicationPayloads(plan).map((m) => healthMedicationKey(m.child_id, m.name, m.start_date)),
    ),
  };
}

const EMPTY: ExistingHealthSnapshot = { appointmentKeys: new Set(), medicationKeys: new Set() };

describe("isFullHealthDuplicate — reenvio do mesmo relato", () => {
  it("duplicata INTEGRAL (consulta+retorno+medicação já registrados) → bloqueia", () => {
    const plan = makePlan();
    expect(isFullHealthDuplicate(plan, fullSnapshotFor(plan))).toBe(true);
  });

  it("histórico vazio (ex.: registros desfeitos/apagados) → NÃO bloqueia", () => {
    expect(isFullHealthDuplicate(makePlan(), EMPTY)).toBe(false);
  });

  it("retorno ainda não registrado → NÃO bloqueia (reenvio completa o retorno)", () => {
    const plan = makePlan();
    const semRetorno = makePlan({ followUp: null });
    // snapshot cobre só consulta+medicação (sem o retorno)
    expect(isFullHealthDuplicate(plan, fullSnapshotFor(semRetorno))).toBe(false);
  });

  it("medicação nova no reenvio → NÃO bloqueia", () => {
    const registrado = makePlan();
    const reenvio = makePlan({
      medications: [
        ...(makePlan().medications ?? []),
        {
          childId: CHILD,
          name: "corticoide",
          dosage: null,
          frequency: null,
          frequencyHours: null,
          careType: "medication",
          reason: null,
          prescribedBy: null,
          startDate: "2026-07-01",
          endDate: null,
          durationDays: null,
        },
      ],
    });
    expect(isFullHealthDuplicate(reenvio, fullSnapshotFor(registrado))).toBe(false);
  });

  it("consulta em OUTRA data → NÃO bloqueia", () => {
    const registrado = makePlan();
    const outraData = makePlan();
    outraData.appointment = { ...outraData.appointment, date: "2026-07-15" };
    expect(isFullHealthDuplicate(outraData, fullSnapshotFor(registrado))).toBe(false);
  });

  it("título com acento/caixa diferente ainda é a MESMA consulta (normalização)", () => {
    const plan = makePlan();
    const snapshot: ExistingHealthSnapshot = {
      appointmentKeys: new Set(
        buildAppointmentPayloads(plan).map((a) =>
          // simula histórico gravado com caixa/acentuação diferentes
          healthAppointmentKey(a.child_id, a.appointment_date, a.appointment_type.toUpperCase(), a.title.toUpperCase()),
        ),
      ),
      medicationKeys: new Set(
        buildMedicationPayloads(plan).map((m) => healthMedicationKey(m.child_id, m.name.toUpperCase(), m.start_date)),
      ),
    };
    expect(isFullHealthDuplicate(plan, snapshot)).toBe(true);
  });

  it("sem medicações: consulta+retorno já registrados → bloqueia", () => {
    const plan = makePlan({ medications: [] });
    expect(isFullHealthDuplicate(plan, fullSnapshotFor(plan))).toBe(true);
  });
});

describe("healthPlanProbe — janela da query do snapshot", () => {
  it("expõe datas de consulta+retorno e inícios de medicação", () => {
    const probe = healthPlanProbe(makePlan());
    expect(probe.appointmentDates).toEqual(["2026-07-01", "2026-08-05"]);
    expect(probe.medicationStartDates).toEqual(["2026-07-01"]);
  });
});
