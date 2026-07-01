/* ------------------------------------------------------------------ */
/* health-visit.ts — playbook de CONSULTA MÉDICA (foto/áudio/texto)     */
/*                                                                      */
/* PURO: não escreve no banco. Recebe a saída bruta do LLM (visão ou    */
/* texto) + o contexto e devolve dados normalizados + um                */
/* MaterializationPlan.health declarativo. TRANSPORTADOR, nunca         */
/* assistente: dose/frequência SÓ quando o médico deu explícito (senão  */
/* null → "Conforme prescrição" + lowConfidence); resumo/diagnóstico =  */
/* CITAÇÃO; datas relativas do retorno resolvidas p/ absolutas. A       */
/* validação é hand-rolled e estrita (defesa contra alucinação/injeção).*/
/* Ver .claude/plans/brain-health-playbook-design.md.                    */
/* ------------------------------------------------------------------ */

import type {
  AppointmentSpec,
  EpisodeSpec,
  HealthVisitPlan,
  MaterializationPlan,
  MedicationSpec,
  PlaybookContext,
  Playbook,
} from "../../types";
import { isParseableIsoDate } from "../../confidence";

export const HEALTH_VISIT_PLAYBOOK_VERSION = 1;
export const HEALTH_VISIT_POLICY_VERSION = 1;

const APPOINTMENT_TYPES = ["rotina", "emergencia", "retorno", "exame"] as const;
type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
const CARE_TYPES = ["medication", "treatment", "procedure"] as const;
type CareType = (typeof CARE_TYPES)[number];
const SEVERITIES = ["leve", "moderado", "grave"] as const;
type Severity = (typeof SEVERITIES)[number];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Trunca COM marcador "…" (corte mudo confunde); total ≤ max. */
function cap(s: string | null, max: number): string | null {
  if (s === null) return null;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function asOptionalEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function asStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cap(asString(x), maxLen))
    .filter((s): s is string => s !== null)
    .slice(0, maxItems);
}

/** ISO no início da string (tolera dígito sem zero e sufixo de hora). Só
 *  devolve se for data real. NUNCA chuta formato ambíguo (o prompt já força ISO). */
function resolveIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=\D|$)/);
  if (!m) return null;
  const iso = `${m[1].padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isParseableIsoDate(iso) ? iso : null;
}

/** Soma dias a uma data ISO (UTC-safe, sem DST). */
function addDays(iso: string, days: number): string | null {
  if (!isParseableIsoDate(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve o retorno em ISO. Preferência: a data ISO que o modelo já resolveu.
 * Fallback determinístico sobre o texto cru ("em N dias/semanas/meses",
 * "em N dia") — aritmética sobre o que o médico disse (transporte, não
 * interpretação), ancorada na data da consulta. Devolve null se não resolvível.
 */
export function resolveFollowUpDate(
  modelIso: string | null,
  raw: string | null,
  consultationDate: string,
): string | null {
  const iso = resolveIsoDate(modelIso);
  if (iso) return iso;
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const m = s.match(/em\s+(\d{1,3})\s*(dia|dias|semana|semanas|m[eê]s|meses)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  const unit = m[2];
  if (unit.startsWith("dia")) return addDays(consultationDate, n);
  if (unit.startsWith("semana")) return addDays(consultationDate, n * 7);
  return addDays(consultationDate, n * 30); // mês ≈ 30d (retorno é aproximado)
}

/**
 * Intervalo em horas SE a frequência for numérica CLARA ("a cada 8h", "8/8h",
 * "de 8 em 8 horas"). Conservador: NÃO deriva de "3x ao dia" (evita interpretar);
 * só transcreve o intervalo já dito. Usado só p/ o registro — não agenda dose.
 */
export function parseFrequencyHours(frequency: string | null): number | null {
  if (!frequency) return null;
  const s = frequency.toLowerCase();
  let m = s.match(/(?:a\s*cada|de)?\s*(\d{1,2})\s*(?:\/|\s+em\s+)\s*\1?\s*h/); // "8/8h", "de 8 em 8 h"
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 24 ? n : null;
  }
  m = s.match(/a\s*cada\s*(\d{1,2})\s*h/); // "a cada 8h"
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 24 ? n : null;
  }
  return null;
}

/** Uma medicação normalizada (dose/frequência null quando não ditas). */
export interface NormalizedMedication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  frequencyHours: number | null;
  durationDays: number | null;
  reason: string | null;
  prescribedBy: string | null;
  careType: CareType;
}

export interface HealthVisitData {
  consultationDate: string; // ISO (default = today do ctx)
  childHint: string | null;
  appointmentType: AppointmentType;
  professionalName: string | null;
  specialty: string | null;
  location: string | null;
  time: string | null;
  summary: string | null; // citação do que o médico disse
  diagnosis: string | null; // citação
  symptoms: string[];
  severity: Severity | null;
  medications: NormalizedMedication[];
  followUpDate: string | null; // ISO resolvido
  followUpRaw: string | null; // texto ("retorno em 1 mês")
  examRequests: string[];
}

/** Título legível da consulta: "Consulta — Pediatria" / "Retorno — Dermatologia" /
 *  "Consulta de rotina". */
function buildAppointmentTitle(type: AppointmentType, specialty: string | null): string {
  const label =
    type === "retorno" ? "Retorno" : type === "emergencia" ? "Emergência" : type === "exame" ? "Exame" : "Consulta";
  return specialty ? `${label} — ${specialty}` : type === "rotina" ? "Consulta de rotina" : label;
}

export const healthVisitPlaybook: Playbook<HealthVisitData> = {
  docType: "health_visit",
  confirmation: "single", // decisão do dono: quem esteve confirma; coparente recebe resumo
  playbookVersion: HEALTH_VISIT_PLAYBOOK_VERSION,
  policyVersion: HEALTH_VISIT_POLICY_VERSION,
  extractionPrompt: { system: "", user: "" }, // injetado pelo serviço (prompts/brain.ts)

  parse(payload: unknown, ctx: PlaybookContext): HealthVisitData | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (p.recognized_as !== "health_visit") return null;

    const consultationDate = resolveIsoDate(asString(p.consultation_date)) ?? ctx.today;
    const childHint = asString(p.child_name_hint);

    const appt = (p.appointment && typeof p.appointment === "object" ? p.appointment : {}) as Record<string, unknown>;
    const appointmentType = asEnum(appt.type, APPOINTMENT_TYPES, "rotina");
    const timeRaw = asString(appt.time);
    const time = timeRaw && TIME_RE.test(timeRaw) ? timeRaw : null;

    const medications: NormalizedMedication[] = [];
    if (Array.isArray(p.medications)) {
      for (const rawMed of p.medications) {
        if (!rawMed || typeof rawMed !== "object") continue;
        const md = rawMed as Record<string, unknown>;
        const name = cap(asString(md.name), 200);
        if (name === null) continue; // sem nome não dá pra registrar
        const frequency = cap(asString(md.frequency), 120);
        const durationRaw = md.duration_days;
        const durationDays =
          typeof durationRaw === "number" && Number.isInteger(durationRaw) && durationRaw > 0 && durationRaw <= 365
            ? durationRaw
            : null;
        medications.push({
          name,
          dosage: cap(asString(md.dosage), 120),
          frequency,
          frequencyHours: parseFrequencyHours(frequency),
          durationDays,
          reason: cap(asString(md.reason), 200),
          prescribedBy: cap(asString(md.prescribed_by), 200),
          careType: asEnum(md.care_type, CARE_TYPES, "medication"),
        });
      }
    }

    const fu = (p.follow_up && typeof p.follow_up === "object" ? p.follow_up : null) as Record<string, unknown> | null;
    const followUpRaw = fu ? cap(asString(fu.raw), 200) : null;
    const followUpDate = fu ? resolveFollowUpDate(asString(fu.date), followUpRaw, consultationDate) : null;

    const data: HealthVisitData = {
      consultationDate,
      childHint,
      appointmentType,
      professionalName: cap(asString(appt.professional_name), 200),
      specialty: cap(asString(appt.specialty), 120),
      location: cap(asString(appt.location), 200),
      time,
      summary: cap(asString(appt.summary), 2000),
      diagnosis: cap(asString(p.diagnosis), 500),
      symptoms: asStringArray(p.symptoms, 20, 120),
      severity: asOptionalEnum(p.severity, SEVERITIES),
      medications,
      followUpDate,
      followUpRaw,
      examRequests: asStringArray(p.exam_requests, 20, 200),
    };

    // Só é uma consulta útil se houver ALGUM sinal (resumo, diagnóstico, sintoma,
    // medicação, retorno ou exame). Consulta "vazia" = extração falhou → null.
    const hasSignal =
      data.summary !== null ||
      data.diagnosis !== null ||
      data.symptoms.length > 0 ||
      data.medications.length > 0 ||
      data.followUpDate !== null ||
      data.examRequests.length > 0;
    return hasSignal ? data : null;
  },

  plan(data: HealthVisitData, ctx: PlaybookContext): MaterializationPlan {
    const childId = ctx.resolvedChildId;
    const lowConfAppt: string[] = [];
    if (childId === null) lowConfAppt.push("childId");

    // Exames solicitados: A0 não tem tabela dedicada → citação no resumo.
    const examLine =
      data.examRequests.length > 0 ? `Exames solicitados: ${data.examRequests.join(", ")}` : null;
    const summary = [data.summary, examLine].filter((s): s is string => s !== null).join("\n\n") || null;

    const appointment: AppointmentSpec = {
      childId,
      title: buildAppointmentTitle(data.appointmentType, data.specialty),
      appointmentType: data.appointmentType,
      date: data.consultationDate,
      timeStart: data.time,
      professionalName: data.professionalName,
      specialty: data.specialty,
      location: data.location,
      summary,
    };
    if (lowConfAppt.length > 0) appointment.lowConfidenceFields = lowConfAppt;

    // Episódio só quando houve avaliação (diagnóstico OU sintomas). Consulta de
    // rotina sem achado não cria episódio de doença.
    let episode: EpisodeSpec | null = null;
    if (data.diagnosis !== null || data.symptoms.length > 0) {
      episode = {
        childId,
        title: data.diagnosis ?? data.symptoms[0] ?? "Avaliação",
        diagnosis: data.diagnosis,
        symptoms: data.symptoms.length > 0 ? data.symptoms : undefined,
        severity: data.severity,
        startDate: data.consultationDate,
      };
    }

    const medications: MedicationSpec[] = data.medications.map((m) => {
      const lowConf: string[] = [];
      if (m.dosage === null) lowConf.push("dosage");
      if (m.frequency === null) lowConf.push("frequency");
      if (childId === null) lowConf.push("childId");
      const endDate = m.durationDays !== null ? addDays(data.consultationDate, m.durationDays) : null;
      const spec: MedicationSpec = {
        childId,
        name: m.name,
        dosage: m.dosage, // null → serviço materializa "Conforme prescrição"
        frequency: m.frequency,
        frequencyHours: m.frequencyHours,
        careType: m.careType,
        durationDays: m.durationDays,
        startDate: data.consultationDate,
        endDate,
        prescribedBy: m.prescribedBy,
        reason: m.reason,
      };
      if (lowConf.length > 0) spec.lowConfidenceFields = lowConf;
      return spec;
    });

    const followUp =
      data.followUpDate !== null ? { date: data.followUpDate, notes: data.followUpRaw } : null;

    const health: HealthVisitPlan = {
      appointment,
      episode,
      medications,
      followUp,
      examRequests: data.examRequests.map((name) => ({ name })),
    };

    return {
      docType: "health_visit",
      confirmation: "single",
      health,
      collabRecordType: "medical_appointment",
    };
  },
};
