/* ------------------------------------------------------------------ */
/* materialize-health-payload.ts — plano de saúde → payloads da RPC     */
/*                                                                      */
/* PURO/determinístico (sem I/O). O serviço passa 3 arrays JSONB pra RPC */
/* brain_intake_execute_health_plan: appointment(s), medications,        */
/* episodes. Aqui monta-se cada payload (snake_case, lido via ->> no     */
/* plpgsql) + um payload_hash canônico por entidade (base do undo        */
/* seguro: se a linha for editada depois, o hash diverge → detach).      */
/*                                                                      */
/* SALVAGUARDA materializada: dose/frequência null → "Conforme           */
/* prescrição" (o placeholder que a tabela já usa). O registro é honesto */
/* — a família sabe que precisa conferir a receita —, nunca uma cadência */
/* inventada. Ver .claude/plans/brain-health-playbook-design.md.         */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";
import { canonicalize } from "./plan-hash";
import { outboxDedupeKey } from "./dedupe";
import type { HealthVisitPlan, MaterializationPlan } from "./types";

/** Placeholder quando o médico não deu dose/frequência explícita (transportador
 *  nunca inventa cadência). Espelha o default de active_medications. */
export const MEDICATION_UNSPECIFIED = "Conforme prescrição";

/** Prioridade dos registros de saúde criados pelo Brain (consulta/episódio/
 *  medicação importam; espelha o default do módulo Saúde). */
export const BRAIN_HEALTH_PRIORITY = "important";

function sha256(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/* ---- Consulta (medical_appointments) ---- */

export interface AppointmentPayload {
  child_id: string;
  title: string;
  appointment_type: string;
  appointment_date: string; // "YYYY-MM-DD" (a RPC compõe a TIMESTAMPTZ BRT)
  appointment_time: string | null; // "HH:MM" ou null (→ meio-dia BRT)
  location: string | null;
  summary: string | null;
  notes: string | null; // citação do profissional etc.
  return_date: string | null; // "YYYY-MM-DD" (retorno)
  return_notes: string | null;
  status: string;
  priority: string;
  payload_hash: string;
}

/** Hash canônico da consulta — espelha as colunas persistidas (base do undo). */
export function appointmentPayloadHash(input: {
  childId: string | null;
  title: string;
  appointmentType: string;
  date: string;
  time: string | null;
  location: string | null;
  summary: string | null;
  notes: string | null;
  returnDate: string | null;
  returnNotes: string | null;
  status: string;
}): string {
  return sha256(
    canonicalize({
      appointmentType: input.appointmentType,
      childId: input.childId,
      date: input.date,
      location: input.location,
      notes: input.notes,
      returnDate: input.returnDate,
      returnNotes: input.returnNotes,
      status: input.status,
      summary: input.summary,
      time: input.time,
      title: input.title,
    }),
  );
}

/* ---- Medicação (active_medications) ---- */

export interface MedicationPayload {
  child_id: string;
  name: string;
  dosage: string; // NUNCA vazio: null vira MEDICATION_UNSPECIFIED
  frequency: string; // idem
  frequency_hours: number | null;
  care_type: string;
  reason: string | null;
  prescribed_by: string | null;
  start_date: string; // "YYYY-MM-DD"
  end_date: string | null;
  status: string;
  priority: string;
  payload_hash: string;
}

export function medicationPayloadHash(input: {
  childId: string | null;
  name: string;
  dosage: string;
  frequency: string;
  frequencyHours: number | null;
  careType: string;
  reason: string | null;
  prescribedBy: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
}): string {
  return sha256(
    canonicalize({
      careType: input.careType,
      childId: input.childId,
      dosage: input.dosage,
      endDate: input.endDate,
      frequency: input.frequency,
      frequencyHours: input.frequencyHours,
      name: input.name,
      prescribedBy: input.prescribedBy,
      reason: input.reason,
      startDate: input.startDate,
      status: input.status,
    }),
  );
}

/* ---- Episódio/diagnóstico (illness_episodes) ---- */

export interface EpisodePayload {
  child_id: string;
  title: string;
  diagnosis: string | null;
  symptoms: string[]; // illness_episodes.symptoms é TEXT[]
  severity: string | null;
  start_date: string;
  status: string;
  priority: string;
  payload_hash: string;
}

export function episodePayloadHash(input: {
  childId: string | null;
  title: string;
  diagnosis: string | null;
  symptoms: string[];
  severity: string | null;
  startDate: string;
  status: string;
}): string {
  return sha256(
    canonicalize({
      childId: input.childId,
      diagnosis: input.diagnosis,
      severity: input.severity,
      startDate: input.startDate,
      status: input.status,
      symptoms: input.symptoms,
      title: input.title,
    }),
  );
}

/* ---- Builders (plano → payloads) ---- */

/** A CONSULTA (passada) → status 'completed' (fica no histórico de Saúde, NÃO
 *  aparece na grade do /calendario, que só mostra scheduled). Profissional
 *  citado (A0 não cria medical_professionals) entra em notes. return_date/notes
 *  documentam o retorno na própria consulta. */
export function buildConsultationPayload(plan: HealthVisitPlan): AppointmentPayload {
  const a = plan.appointment;
  const notes = a.professionalName ? `Profissional: ${a.professionalName}` : null;
  const returnDate = plan.followUp?.date ?? null;
  const returnNotes = plan.followUp?.notes ?? null;
  const status = "completed";
  const payload_hash = appointmentPayloadHash({
    childId: a.childId, title: a.title, appointmentType: a.appointmentType, date: a.date,
    time: a.timeStart ?? null, location: a.location ?? null, summary: a.summary ?? null,
    notes, returnDate, returnNotes, status,
  });
  return {
    child_id: a.childId as string,
    title: a.title,
    appointment_type: a.appointmentType,
    appointment_date: a.date,
    appointment_time: a.timeStart ?? null,
    location: a.location ?? null,
    summary: a.summary ?? null,
    notes,
    return_date: returnDate,
    return_notes: returnNotes,
    status,
    priority: BRAIN_HEALTH_PRIORITY,
    payload_hash,
  };
}

/** O RETORNO (futuro) → um 2º medical_appointment status 'scheduled' (type
 *  'retorno', date = return_date). É o que APARECE no calendário (a grade lê
 *  medical_appointments scheduled). null quando não há retorno. */
export function buildRetornoPayload(plan: HealthVisitPlan): AppointmentPayload | null {
  if (!plan.followUp) return null;
  const a = plan.appointment;
  const title = a.specialty ? `Retorno — ${a.specialty}` : "Retorno";
  const summary = plan.followUp.notes ?? null;
  const status = "scheduled";
  const payload_hash = appointmentPayloadHash({
    childId: a.childId, title, appointmentType: "retorno", date: plan.followUp.date,
    time: null, location: a.location ?? null, summary, notes: null, returnDate: null, returnNotes: null, status,
  });
  return {
    child_id: a.childId as string,
    title,
    appointment_type: "retorno",
    appointment_date: plan.followUp.date,
    appointment_time: null,
    location: a.location ?? null,
    summary,
    notes: null,
    return_date: null,
    return_notes: null,
    status,
    priority: BRAIN_HEALTH_PRIORITY,
    payload_hash,
  };
}

/** Consulta + (retorno se houver). A RPC faz loop sobre este array. */
export function buildAppointmentPayloads(plan: HealthVisitPlan): AppointmentPayload[] {
  const consultation = buildConsultationPayload(plan);
  const retorno = buildRetornoPayload(plan);
  return retorno ? [consultation, retorno] : [consultation];
}

/** Medicações → payloads. Dose/frequência null → "Conforme prescrição". */
export function buildMedicationPayloads(plan: HealthVisitPlan): MedicationPayload[] {
  return (plan.medications ?? []).map((m) => {
    const dosage = m.dosage ?? MEDICATION_UNSPECIFIED;
    const frequency = m.frequency ?? MEDICATION_UNSPECIFIED;
    const status = "active";
    const payload_hash = medicationPayloadHash({
      childId: m.childId,
      name: m.name,
      dosage,
      frequency,
      frequencyHours: m.frequencyHours ?? null,
      careType: m.careType,
      reason: m.reason ?? null,
      prescribedBy: m.prescribedBy ?? null,
      startDate: m.startDate,
      endDate: m.endDate ?? null,
      status,
    });
    return {
      child_id: m.childId as string,
      name: m.name,
      dosage,
      frequency,
      frequency_hours: m.frequencyHours ?? null,
      care_type: m.careType,
      reason: m.reason ?? null,
      prescribed_by: m.prescribedBy ?? null,
      start_date: m.startDate,
      end_date: m.endDate ?? null,
      status,
      priority: BRAIN_HEALTH_PRIORITY,
      payload_hash,
    };
  });
}

/** Episódio → payload (0 ou 1). Sem episódio → array vazio (uniformiza a RPC). */
export function buildEpisodePayloads(plan: HealthVisitPlan): EpisodePayload[] {
  const e = plan.episode;
  if (!e) return [];
  const symptoms = e.symptoms ?? [];
  const status = "active";
  const payload_hash = episodePayloadHash({
    childId: e.childId,
    title: e.title,
    diagnosis: e.diagnosis ?? null,
    symptoms,
    severity: e.severity ?? null,
    startDate: e.startDate,
    status,
  });
  return [
    {
      child_id: e.childId as string,
      title: e.title,
      diagnosis: e.diagnosis ?? null,
      symptoms,
      severity: e.severity ?? null,
      start_date: e.startDate,
      status,
      priority: BRAIN_HEALTH_PRIORITY,
      payload_hash,
    },
  ];
}

/** Coordenação: 1 collab_notify por destinatário (coparente ≠ confirmador).
 *  dedupe_key estável por (intake, evento, destinatário). O resumo rico
 *  ("Consulta do Otto — avaliação/…") é montado pelo worker a partir do intake. */
export interface HealthOutboxPayload {
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

export function buildHealthOutboxPayloads(args: {
  intakeId: string;
  recipientIds: string[];
  childId: string | null;
  appointmentTitle: string;
  medicationCount: number;
  hasFollowUp: boolean;
}): HealthOutboxPayload[] {
  const seen = new Set<string>();
  const out: HealthOutboxPayload[] = [];
  for (const recipientId of args.recipientIds) {
    if (seen.has(recipientId)) continue;
    seen.add(recipientId);
    out.push({
      event_type: "collab_notify",
      dedupe_key: outboxDedupeKey(args.intakeId, "collab_notify", recipientId),
      payload: {
        kind: "health_visit",
        intake_id: args.intakeId,
        recipient_id: recipientId,
        child_id: args.childId,
        appointment_title: args.appointmentTitle,
        medication_count: args.medicationCount,
        has_follow_up: args.hasFollowUp,
      },
    });
  }
  return out;
}

/** Conveniência: todos os payloads do plano de uma vez. `appointments` = a
 *  consulta (completed) + o retorno (scheduled) se houver. */
export function buildHealthPayloads(plan: MaterializationPlan): {
  appointments: AppointmentPayload[];
  medications: MedicationPayload[];
  episodes: EpisodePayload[];
} | null {
  if (!plan.health) return null;
  return {
    appointments: buildAppointmentPayloads(plan.health),
    medications: buildMedicationPayloads(plan.health),
    episodes: buildEpisodePayloads(plan.health),
  };
}
