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
