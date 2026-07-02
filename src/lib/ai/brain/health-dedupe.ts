/* ------------------------------------------------------------------ */
/* health-dedupe.ts — duplicata de CONSULTA contra o histórico (PURO)    */
/*                                                                      */
/* Espelho do partitionAgainstExisting escolar pro Playbook de Saúde:    */
/* o MESMO relato reenviado (texto/áudio/foto) não pode virar segunda    */
/* consulta + retorno + medicação. Falha real pega no teste E2E em loop  */
/* (reenvio idêntico dobrou tudo: 2× consulta, 2× retorno, 2× remédio).  */
/*                                                                      */
/* Conservador por design: só é duplicata quando TODOS os payloads que   */
/* a RPC criaria já existem (consulta E retorno E cada medicação). Um    */
/* componente novo que seja → segue pro preview (o reenvio pode estar    */
/* completando uma informação). As chaves derivam dos MESMOS builders    */
/* da materialização (materialize-health-payload) — zero drift.          */
/* ------------------------------------------------------------------ */

import { normalizeForFingerprint } from "./dedupe";
import { buildAppointmentPayloads, buildMedicationPayloads } from "./materialize-health-payload";
import type { HealthVisitPlan } from "./types";

/** Snapshot do histórico de saúde do MESMO filho (injetado pelo serviço). */
export interface ExistingHealthSnapshot {
  /** Chaves de medical_appointments: child|dataBRT|tipo|título (normalizados). */
  appointmentKeys: Set<string>;
  /** Chaves de active_medications: child|nome|início (normalizados). */
  medicationKeys: Set<string>;
}

/** Chave de consulta/retorno — data em YYYY-MM-DD no fuso do Brasil. */
export function healthAppointmentKey(
  childId: string | null,
  dateBRT: string,
  appointmentType: string,
  title: string,
): string {
  return `${childId ?? "_"}|${dateBRT}|${normalizeForFingerprint(appointmentType)}|${normalizeForFingerprint(title)}`;
}

/** Chave de medicação — start_date é DATE puro (sem fuso). */
export function healthMedicationKey(childId: string | null, name: string, startDate: string): string {
  return `${childId ?? "_"}|${normalizeForFingerprint(name)}|${startDate}`;
}

/** Datas (consultas/retorno) e inícios de medicação que o plano criaria —
 *  pro serviço montar a janela da query do snapshot. */
export function healthPlanProbe(plan: HealthVisitPlan): { appointmentDates: string[]; medicationStartDates: string[] } {
  return {
    appointmentDates: buildAppointmentPayloads(plan).map((a) => a.appointment_date),
    medicationStartDates: buildMedicationPayloads(plan).map((m) => m.start_date),
  };
}

/**
 * Duplicata INTEGRAL: cada payload que a RPC inseriria (consulta, retorno se
 * houver, cada medicação) já existe no histórico. Registros desfeitos/apagados
 * não contam (saem do snapshot) — desfazer e reenviar continua funcionando.
 */
export function isFullHealthDuplicate(plan: HealthVisitPlan, existing: ExistingHealthSnapshot): boolean {
  const appointments = buildAppointmentPayloads(plan);
  for (const a of appointments) {
    if (!existing.appointmentKeys.has(healthAppointmentKey(a.child_id, a.appointment_date, a.appointment_type, a.title))) {
      return false;
    }
  }
  for (const m of buildMedicationPayloads(plan)) {
    if (!existing.medicationKeys.has(healthMedicationKey(m.child_id, m.name, m.start_date))) {
      return false;
    }
  }
  // Sem componente novo → é o mesmo relato já registrado.
  return appointments.length > 0;
}
