/**
 * School Service — CLIENT-SAFE shared module
 *
 * Types, enums, and pure helpers used by BOTH the server service
 * (`./school.ts`) AND the client (EscolaClient, native escola). Lives
 * separately so importing types from the client doesn't drag the
 * server service's `server-only` deps (next/headers, Node crypto) into
 * the browser bundle.
 *
 * Server code: import from `./school` (which re-exports everything here
 * plus the server-only functions).
 * Client code: import from `./school-shared` directly.
 */

export type SchoolSubtype =
  | "exam" | "meeting" | "event" | "homework" | "absence"      // events
  | "grade" | "behavior" | "achievement" | "concern" | "other"; // notes

export type SchoolKind = "event" | "note";

// Mirror of CollabPriority — literal union duplicated here on purpose
// (instead of `import type` from "./collab") so that this module stays
// 100% client-safe. The "collab" module is marked server-only.
export type SchoolPriority = "info" | "important" | "urgent";

export const EVENT_SUBTYPES: SchoolSubtype[] = ["exam", "meeting", "event", "homework", "absence"];
export const NOTE_SUBTYPES: SchoolSubtype[] = ["grade", "behavior", "achievement", "concern", "other"];

export function getKind(subtype: SchoolSubtype): SchoolKind {
  return EVENT_SUBTYPES.includes(subtype) ? "event" : "note";
}

const VALID_SUBTYPES: SchoolSubtype[] = [...EVENT_SUBTYPES, ...NOTE_SUBTYPES];

export function isValidSubtype(s: unknown): s is SchoolSubtype {
  return typeof s === "string" && (VALID_SUBTYPES as string[]).includes(s);
}

/**
 * Título do EVENTO no calendário a partir de subtype + título + matéria.
 * Puro (client-safe) — usado pelo service da escola E pela materialização do
 * Brain (pré-computa o título antes da RPC). Ex.: exam + "Trigonometria" +
 * subject "Matemática" → "📚 Prova · Matemática"; meeting → "👥 Reunião escolar:
 * Reunião de pais".
 */
export function calendarTitleFor(args: { subtype: SchoolSubtype; title: string; subject?: string | null }): string {
  const labelByType: Record<SchoolSubtype, string> = {
    exam: "📚 Prova",
    meeting: "👥 Reunião escolar",
    event: "🎉 Evento escolar",
    homework: "📝 Tarefa escolar",
    absence: "🚫 Falta escolar",
    grade: "📊 Nota",
    behavior: "📋 Comportamento",
    achievement: "🏆 Conquista",
    concern: "⚠️ Atenção",
    other: "📌 Registro escolar",
  };
  const prefix = labelByType[args.subtype];
  if (args.subtype === "exam" && args.subject) {
    return `${prefix} · ${args.subject}`;
  }
  return `${prefix}: ${args.title}`;
}

/** Descrição do evento no calendário (description + "Nota: {score}" p/ prova). Puro. */
export function eventDescriptionFor(args: { description?: string | null; subtype: SchoolSubtype; score?: string | null }): string | null {
  const parts = [args.description?.trim()].filter(Boolean) as string[];
  if (args.subtype === "exam" && args.score) parts.push(`Nota: ${args.score}`);
  return parts.length > 0 ? parts.join("\n") : null;
}
