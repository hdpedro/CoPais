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

/** Meses pt-BR (abreviado + extenso) → número. Tolera "março"/"marco". */
const PT_MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, "março": 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

/** Monta ISO a partir de y/m/d e só devolve se for data real. */
function buildIso(year: number, month: number, day: number): string | null {
  if (![year, month, day].every((n) => Number.isInteger(n))) return null;
  const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isParseableIsoDate(candidate) ? candidate : null;
}

/**
 * Resolve uma data de exame em ISO. Robusto aos formatos que LLMs emitem na
 * prática: ISO ("2026-08-12", também sem zero ou com sufixo de hora), data
 * BR com separador "/" "." ou "-" e ano de 2 ou 4 dígitos ("12/08",
 * "12-08-26", "12.08.2026"), tolerando sufixo ("12/08 (qua)"), e mês textual
 * pt-BR ("12 de agosto", "12 ago"). Sem ano → resolve contra o ano letivo.
 * Devolve null se não for resolvível em data real — NUNCA chuta.
 */
export function resolveExamDate(raw: string | null, schoolYear: number): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;

  // 1. ISO no início (tolera dígito sem zero e sufixo, ex. "2026-8-12T08:00").
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=\D|$)/);
  if (m) return buildIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // 2. DD/MM[/AA|AAAA] com separador "/" "." ou "-" (tolera sufixo).
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?(?=\D|$)/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : schoolYear;
    return buildIso(year, month, day);
  }

  // 3. Mês textual pt-BR: "12 de agosto", "12 agosto", "12 ago [de 2026]".
  m = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-zà-ÿ]+)\.?(?:\s+de\s+(\d{4}))?/);
  if (m && PT_MONTHS[m[2]] !== undefined) {
    const year = m[3] ? Number(m[3]) : schoolYear;
    return buildIso(year, PT_MONTHS[m[2]], Number(m[1]));
  }

  return null;
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
