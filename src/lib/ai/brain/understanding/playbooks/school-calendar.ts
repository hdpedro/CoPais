/* ------------------------------------------------------------------ */
/* school-calendar.ts — playbook do A0 (calendário escolar por foto)    */
/*                                                                      */
/* PURO: não escreve no banco. Recebe a saída bruta da visão (já como    */
/* objeto) + o contexto (snapshot) e devolve dados normalizados e um     */
/* MaterializationPlan declarativo. A validação é hand-rolled e estrita  */
/* (sem dependência nova): o que estiver fora do schema é descartado     */
/* (defesa contra prompt-injection / alucinação). A confiança de data e  */
/* matéria é COMPOSTA (LLM + validações determinísticas), nunca o        */
/* autorrelato cru do modelo.                                            */
/* ------------------------------------------------------------------ */

import type {
  ActivitySpec,
  FieldConfidence,
  MaterializationPlan,
  PlaybookContext,
  Playbook,
} from "../../types";
import {
  assessFieldConfidence,
  isParseableIsoDate,
  isWithinHorizon,
  isYearCoherent,
  type ConfidenceSignal,
} from "../../confidence";

export const SCHOOL_CALENDAR_PLAYBOOK_VERSION = 1;
export const SCHOOL_CALENDAR_POLICY_VERSION = 1;

const EXAM_TYPES = ["prova", "trabalho", "entrega", "outro"] as const;
type ExamType = (typeof EXAM_TYPES)[number];

/** Exame normalizado (data já resolvida em ISO; confiança composta). */
export interface NormalizedExam {
  subject: string;
  isoDate: string | null; // YYYY-MM-DD ou null se não resolvível
  type: ExamType;
  content: string | null;
  materials: string[];
  time: string | null; // HH:MM
  dateConfidence: FieldConfidence;
  nameConfidence: FieldConfidence;
}

export interface SchoolCalendarData {
  schoolYear: number;
  childHint: string | null;
  exams: NormalizedExam[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Limita o tamanho (saída de LLM pode vir longa); espelha o cap do
 *  assistente (execCreateActivity corta nome em 200). */
function cap(s: string | null, max: number): string | null {
  if (s === null) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function asNumberInRange(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return Math.max(lo, Math.min(hi, v));
}

function asExamType(v: unknown): ExamType {
  return typeof v === "string" && (EXAM_TYPES as readonly string[]).includes(v)
    ? (v as ExamType)
    : "outro";
}

function asMaterials(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cap(asString(x), 120))
    .filter((s): s is string => s !== null)
    .slice(0, 20);
}

/**
 * Resolve uma data de exame em ISO. Aceita "YYYY-MM-DD" (validada) ou
 * "DD/MM" e "DD/MM/YYYY" (resolve o ano contra o ano letivo). Devolve null
 * se não for resolvível em data real — nunca chuta.
 */
export function resolveExamDate(raw: string | null, schoolYear: number): string | null {
  if (!raw) return null;
  const iso = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return isParseableIsoDate(iso) ? iso : null;
  }
  const m = iso.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3] ? m[3] : String(schoolYear);
  const candidate = `${year}-${month}-${day}`;
  return isParseableIsoDate(candidate) ? candidate : null;
}

/** Compõe a confiança da DATA: LLM + parseável (hard) + ano coerente
 *  (hard) + dentro do horizonte (soft). */
function composeDateConfidence(
  llmEstimate: number,
  isoDate: string | null,
  schoolYear: number,
  today: string,
): FieldConfidence {
  const signals: ConfidenceSignal[] = [
    { id: "date_parseable", pass: isoDate !== null && isParseableIsoDate(isoDate), weight: 1, hard: true },
    { id: "year_coherent", pass: isoDate !== null && isYearCoherent(isoDate, schoolYear), weight: 1, hard: true },
    { id: "within_horizon", pass: isoDate !== null && isWithinHorizon(isoDate, today), weight: 0.5 },
  ];
  return assessFieldConfidence(llmEstimate, signals);
}

/** Compõe a confiança da MATÉRIA: LLM + matéria presente (hard). */
function composeNameConfidence(llmEstimate: number, subject: string | null): FieldConfidence {
  return assessFieldConfidence(llmEstimate, [
    { id: "subject_present", pass: subject !== null, weight: 1, hard: true },
  ]);
}

/** Título legível a partir do tipo + matéria ("Prova de Matemática"). */
function buildTitle(type: ExamType, subject: string): string {
  if (type === "outro") return subject;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `${label} de ${subject}`;
}

export const schoolCalendarPlaybook: Playbook<SchoolCalendarData> = {
  docType: "school_calendar",
  confirmation: "single",
  playbookVersion: SCHOOL_CALENDAR_PLAYBOOK_VERSION,
  policyVersion: SCHOOL_CALENDAR_POLICY_VERSION,
  extractionPrompt: { system: "", user: "" }, // injetado pelo serviço (prompts/brain.ts)

  parse(payload: unknown, ctx: PlaybookContext): SchoolCalendarData | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (p.recognized_as !== "school_calendar") return null;
    if (!Array.isArray(p.exams)) return null;

    const schoolYear = asNumberInRange(p.school_year, 2000, 2100) ?? ctx.schoolYearAnchor;
    const childHint = asString(p.child_name_hint);

    const exams: NormalizedExam[] = [];
    for (const rawExam of p.exams) {
      if (!rawExam || typeof rawExam !== "object") continue;
      const e = rawExam as Record<string, unknown>;
      const subject = cap(asString(e.subject), 120);
      if (subject === null) continue; // matéria é o mínimo identificável

      const type = asExamType(e.type);
      const isoDate = resolveExamDate(asString(e.date), schoolYear);
      const timeRaw = asString(e.time);
      const time = timeRaw && TIME_RE.test(timeRaw) ? timeRaw : null;

      const dateConfidence = composeDateConfidence(
        asNumberInRange(e.date_confidence, 0, 1) ?? 0,
        isoDate,
        schoolYear,
        ctx.today,
      );
      const nameConfidence = composeNameConfidence(
        asNumberInRange(e.name_confidence, 0, 1) ?? 0,
        subject,
      );

      exams.push({
        subject,
        isoDate,
        type,
        content: cap(asString(e.content), 2000),
        materials: asMaterials(e.materials),
        time,
        dateConfidence,
        nameConfidence,
      });
    }

    if (exams.length === 0) return null;
    return { schoolYear, childHint, exams };
  },

  plan(data: SchoolCalendarData, ctx: PlaybookContext): MaterializationPlan {
    // Só vira atividade o exame com data resolvível (sem data não dá pra
    // materializar nem lembrar). Exames sem data ficam fora do plano —
    // o serviço os expõe na zona "precisa confirmar" do preview.
    const activities: ActivitySpec[] = data.exams
      .filter((e) => e.isoDate !== null)
      .map((e) => {
        const lowConfidenceFields: string[] = [];
        if (e.dateConfidence.level !== "high") lowConfidenceFields.push("startDate");
        if (e.nameConfidence.level !== "high") lowConfidenceFields.push("subject");
        if (ctx.resolvedChildId === null) lowConfidenceFields.push("childId");

        const spec: ActivitySpec = {
          childId: ctx.resolvedChildId,
          name: buildTitle(e.type, e.subject),
          category: "school",
          startDate: e.isoDate as string,
          timeStart: e.time,
          notes: e.content,
          checklist: e.materials.length > 0 ? e.materials : undefined,
          subject: e.subject,
          activityType: e.type,
          reminderRule: { type: "previous_day_at_time", time: "20:00", timezone: ctx.timezone },
          reminderRouting: "auto",
        };
        if (lowConfidenceFields.length > 0) spec.lowConfidenceFields = lowConfidenceFields;
        return spec;
      });

    return {
      docType: "school_calendar",
      confirmation: "single",
      activities,
      collabRecordType: "school_activity",
    };
  },
};
