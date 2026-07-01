/* ------------------------------------------------------------------ */
/* registry.ts — registro de playbooks do Brain                        */
/*                                                                      */
/* Mapeia docType → Playbook. No A0 só existe school_calendar. O        */
/* serviço resolve o playbook por aqui; quando o classificador/extração */
/* não reconhece (recognized_as != 'school_calendar'), o parse devolve  */
/* null e o serviço cai em unknown_document (pergunta clarificadora).   */
/* ------------------------------------------------------------------ */

import type { DocType, Playbook } from "../types";
import {
  SCHOOL_CALENDAR_EXTRACTION,
  SCHOOL_CALENDAR_TEXT_EXTRACTION,
  HEALTH_VISIT_EXTRACTION,
  HEALTH_VISIT_TEXT_EXTRACTION,
} from "../../prompts/brain";
import { schoolCalendarPlaybook } from "./playbooks/school-calendar";
import { healthVisitPlaybook } from "./playbooks/health-visit";

// O playbook é puro; os prompts de extração vivem em prompts/brain.ts e são
// injetados aqui (mantém o playbook sem string de prompt embutida). O de TEXTO
// habilita o mesmo playbook a ler uma descrição digitada/falada de provas.
const schoolCalendar: Playbook = {
  ...schoolCalendarPlaybook,
  extractionPrompt: SCHOOL_CALENDAR_EXTRACTION,
  textExtractionPrompt: SCHOOL_CALENDAR_TEXT_EXTRACTION,
} as Playbook;

// Playbook de Saúde (consulta médica). REGISTRADO mas DORMENTE: não entra em
// ENABLED_DOC_TYPES até a RPC de materialização + o dispatch do confirmIntake
// existirem (Fatia 2/3). Assim getPlaybook('health_visit') já resolve p/ testes
// e wiring, sem tocar nenhum fluxo vivo.
const healthVisit: Playbook = {
  ...healthVisitPlaybook,
  extractionPrompt: HEALTH_VISIT_EXTRACTION,
  textExtractionPrompt: HEALTH_VISIT_TEXT_EXTRACTION,
} as Playbook;

const REGISTRY: Partial<Record<DocType, Playbook>> = {
  school_calendar: schoolCalendar,
  health_visit: healthVisit,
};

/** Playbooks habilitados no A0 (ordem de tentativa de extração). Saúde ainda
 *  NÃO está aqui — só será ativada quando a materialização estiver pronta. */
export const ENABLED_DOC_TYPES: DocType[] = ["school_calendar"];

export function getPlaybook(docType: DocType): Playbook | null {
  return REGISTRY[docType] ?? null;
}
