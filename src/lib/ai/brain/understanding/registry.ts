/* ------------------------------------------------------------------ */
/* registry.ts — registro de playbooks do Brain                        */
/*                                                                      */
/* Mapeia docType → Playbook. No A0 só existe school_calendar. O        */
/* serviço resolve o playbook por aqui; quando o classificador/extração */
/* não reconhece (recognized_as != 'school_calendar'), o parse devolve  */
/* null e o serviço cai em unknown_document (pergunta clarificadora).   */
/* ------------------------------------------------------------------ */

import type { DocType, Playbook } from "../types";
import { SCHOOL_CALENDAR_EXTRACTION } from "../../prompts/brain";
import { schoolCalendarPlaybook } from "./playbooks/school-calendar";

// O playbook é puro; o prompt de extração vive em prompts/brain.ts e é
// injetado aqui (mantém o playbook sem string de prompt embutida).
const schoolCalendar: Playbook = {
  ...schoolCalendarPlaybook,
  extractionPrompt: SCHOOL_CALENDAR_EXTRACTION,
} as Playbook;

const REGISTRY: Partial<Record<DocType, Playbook>> = {
  school_calendar: schoolCalendar,
};

/** Playbooks habilitados no A0 (ordem de tentativa de extração). */
export const ENABLED_DOC_TYPES: DocType[] = ["school_calendar"];

export function getPlaybook(docType: DocType): Playbook | null {
  return REGISTRY[docType] ?? null;
}
