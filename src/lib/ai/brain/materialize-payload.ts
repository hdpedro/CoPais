/* ------------------------------------------------------------------ */
/* materialize-payload.ts — ponte PURA plano → RPC de materialização     */
/*                                                                      */
/* O serviço (services/brain.ts) chama a RPC brain_intake_execute_plan   */
/* (atômica) passando dois arrays JSONB: school_logs e outbox. Este      */
/* módulo monta esses payloads de forma PURA e determinística — sem I/O. */
/*                                                                      */
/*  - schoolLogPayloadHash: hash canônico dos campos materializados; é o */
/*    `original_payload_hash` gravado na proveniência. O undo seguro     */
/*    compara o hash atual da entidade com este: divergiu → foi editada  */
/*    depois → detach (preserva trabalho posterior).                     */
/*  - buildOutboxPayloads: um `collab_notify` por destinatário, com      */
/*    dedupe_key estável (retry idempotente, por destinatário).          */
/*                                                                      */
/* Chaves snake_case: o plpgsql lê via `->>'child_id'` etc.             */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";
import { canonicalize } from "./plan-hash";
import { outboxDedupeKey } from "./dedupe";
import { calendarTitleFor } from "@/lib/services/school-shared";
import type { ActivitySpec, MaterializationPlan } from "./types";

/* ============================================================ */
/* Retarget p/ a aba ESCOLA (school_logs + espelho events)       */
/* A foto de calendário vira `school_logs` (subtype prova) — onde  */
/* a família procura — não `child_activities`. O hash do undo      */
/* cobre EXATAMENTE as colunas persistidas (incl. subject/tipo,    */
/* que agora SÃO coluna), pra o round-trip bater.                  */
/* ============================================================ */

/** Tipo de avaliação → log_type do school_logs. prova→exam; trabalho/entrega→homework. */
export function logTypeForActivity(activityType: string | null | undefined): "exam" | "homework" {
  return activityType === "trabalho" || activityType === "entrega" ? "homework" : "exam";
}

/** Descrição do registro escolar: conteúdo (notes — já traz "Onde estudar") +
 *  materiais dobrados numa linha rotulada (school_logs não tem coluna de
 *  checklist no A0). null quando vazio. */
export function buildSchoolLogDescription(spec: ActivitySpec): string | null {
  const parts: string[] = [];
  if (spec.notes && spec.notes.trim() !== "") parts.push(spec.notes);
  if (spec.checklist && spec.checklist.length > 0) parts.push(`Materiais: ${spec.checklist.join(", ")}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Prioridade das provas criadas pelo Brain (prova importa mais que 'info'). */
export const BRAIN_SCHOOL_PRIORITY = "important";

/** Campos cobertos pelo hash do undo — espelham EXATAMENTE as colunas
 *  persistidas em school_logs (+ event_time do espelho events). */
export interface SchoolLogHashInput {
  childId: string | null;
  logType: string;
  title: string;
  subject: string | null;
  description: string | null;
  logDate: string;
  timeStart: string | null; // "HH:MM"
  priority: string;
}

/** Hash canônico do school_log materializado (base do undo seguro). Inclui
 *  subject e log_type — AGORA colunas reais (invertendo a decisão do
 *  child_activities, que não os tinha). Mesma entrada no commit e no undo. */
export function schoolLogPayloadHash(input: SchoolLogHashInput): string {
  const canonical = canonicalize({
    childId: input.childId,
    description: input.description,
    logDate: input.logDate,
    logType: input.logType,
    priority: input.priority,
    subject: input.subject,
    timeStart: input.timeStart,
    title: input.title,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Payload de um school_log (+ espelho events) lido pela RPC (snake_case). */
export interface SchoolLogPayload {
  child_id: string; // school_logs.child_id é NOT NULL (validador garante)
  log_type: string;
  title: string;
  subject: string | null;
  description: string | null;
  log_date: string;
  event_time: string | null; // "HH:MM" → events.event_time (TEXT)
  priority: string;
  calendar_title: string; // events.title (pré-computado, puro)
  payload_hash: string;
}

/** ActivitySpec → payload de school_log. Pré-computa título do calendário + hash. */
export function toSchoolLogPayload(spec: ActivitySpec): SchoolLogPayload {
  const logType = logTypeForActivity(spec.activityType);
  const description = buildSchoolLogDescription(spec);
  const subject = spec.subject ?? null;
  const timeStart = spec.timeStart ?? null;
  const payload_hash = schoolLogPayloadHash({
    childId: spec.childId,
    logType,
    title: spec.name,
    subject,
    description,
    logDate: spec.startDate,
    timeStart,
    priority: BRAIN_SCHOOL_PRIORITY,
  });
  return {
    child_id: spec.childId as string,
    log_type: logType,
    title: spec.name,
    subject,
    description,
    log_date: spec.startDate,
    event_time: timeStart,
    priority: BRAIN_SCHOOL_PRIORITY,
    calendar_title: calendarTitleFor({ subtype: logType, title: spec.name, subject }),
    payload_hash,
  };
}

/** Monta o array de school_logs pra RPC a partir do plano. */
export function buildSchoolLogPayloads(plan: MaterializationPlan): SchoolLogPayload[] {
  return (plan.activities ?? []).map(toSchoolLogPayload);
}

/** Edição por item no preview (por índice na lista ORIGINAL do plano salvo).
 *  Só os campos que o usuário pode corrigir. `subject`/`timeStart`/`notes`
 *  aceitam null (limpar). */
export interface ActivityEdit {
  index: number;
  name?: string;
  subject?: string | null;
  startDate?: string; // "YYYY-MM-DD"
  timeStart?: string | null; // "HH:MM" ou null
  notes?: string | null;
}

const EDIT_CAP = { name: 200, subject: 120, notes: 2000 } as const;
const cap = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/**
 * Aplica edições do usuário sobre as atividades do plano salvo, por índice
 * ORIGINAL (mesma base do keepIndices — por isso aplicar ANTES de selecionar).
 * PURA: capa/trima valores, ignora índices inválidos, valida forma de data/hora
 * (data/horizonte final é revalidado por validatePlanForExecution). Campo com
 * string vazia após trim é tratado como "não mexeu" (name) ou "limpar"
 * (subject/notes via null explícito). Preserva ordem e não muta a entrada.
 */
export function applyActivityEdits(activities: ActivitySpec[], edits?: ActivityEdit[]): ActivitySpec[] {
  if (!edits || edits.length === 0) return activities;
  const byIndex = new Map<number, ActivityEdit>();
  for (const e of edits) {
    if (Number.isInteger(e.index) && e.index >= 0 && e.index < activities.length) byIndex.set(e.index, e);
  }
  if (byIndex.size === 0) return activities;
  return activities.map((a, i) => {
    const e = byIndex.get(i);
    if (!e) return a;
    const next: ActivitySpec = { ...a };
    if (typeof e.name === "string" && e.name.trim() !== "") next.name = cap(e.name.trim(), EDIT_CAP.name);
    if (e.subject !== undefined) next.subject = e.subject && e.subject.trim() !== "" ? cap(e.subject.trim(), EDIT_CAP.subject) : null;
    if (typeof e.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate)) next.startDate = e.startDate;
    if (e.timeStart !== undefined) next.timeStart = typeof e.timeStart === "string" && /^\d{2}:\d{2}$/.test(e.timeStart) ? e.timeStart : null;
    if (e.notes !== undefined) next.notes = e.notes && e.notes.trim() !== "" ? cap(e.notes.trim(), EDIT_CAP.notes) : null;
    return next;
  });
}

/**
 * Seleção por índice (deseleção no preview). Mantém as atividades cujos
 * índices estão em `keepIndices`. Robusto: índices repetidos NÃO duplicam
 * (itera a lista uma vez), índices inexistentes são ignorados, lista vazia
 * → vazio. `undefined` = mantém todas. Pura, preserva a ordem original.
 */
export function selectActivitiesByIndex(
  activities: ActivitySpec[],
  keepIndices?: number[],
): ActivitySpec[] {
  if (keepIndices === undefined) return activities;
  const keep = new Set(keepIndices);
  return activities.filter((_, i) => keep.has(i));
}

/** Payload de uma linha de outbox lida pela RPC. */
export interface OutboxPayload {
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

/**
 * Monta um `collab_notify` por destinatário (coparentes ≠ confirmador). A
 * `dedupe_key` é estável por (intake, evento, destinatário) → o retry do
 * worker colide no UNIQUE e não duplica o aviso. `recipientIds` deduplicado
 * e sem o confirmador (o serviço passa a lista já filtrada). Determinístico.
 */
export function buildOutboxPayloads(args: {
  intakeId: string;
  recipientIds: string[];
  docType: string;
  childId: string | null;
  createdCount: number;
}): OutboxPayload[] {
  const seen = new Set<string>();
  const out: OutboxPayload[] = [];
  for (const recipientId of args.recipientIds) {
    if (seen.has(recipientId)) continue;
    seen.add(recipientId);
    out.push({
      event_type: "collab_notify",
      dedupe_key: outboxDedupeKey(args.intakeId, "collab_notify", recipientId),
      payload: {
        kind: args.docType,
        intake_id: args.intakeId,
        recipient_id: recipientId,
        child_id: args.childId,
        created_count: args.createdCount,
      },
    });
  }
  return out;
}
