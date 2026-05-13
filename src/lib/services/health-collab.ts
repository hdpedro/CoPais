/**
 * Saúde — wrapper de notifyCollabCreate com defaults por record_type.
 *
 * Single source of truth pros copys de push de Saúde. Mantém o caller
 * focado no "o que aconteceu" (id, nome, criança), enquanto este service
 * monta o título + body + deep link + priority no padrão da Foundation.
 *
 * Vide migration 00080 + .claude/CLAUDE.md "Saúde Foundation adoption"
 * pra contexto. Os 5 callers (actions/health.ts createAppointment +
 * createMedication + createIllness + api/health/allergies POST +
 * api/health/vaccines-bulk POST) usam este helper imediatamente após
 * o INSERT bem-sucedido.
 *
 * SERVER-ONLY: re-exporta de collab.ts (que já é server-only).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCollabCreate, type CollabPriority } from "./collab";

type SaudeRecordType =
  | "medical_appointment"
  | "illness_episode"
  | "active_medication"
  | "child_allergy"
  | "vaccination_record";

interface NotifySaudeArgs {
  recordType: SaudeRecordType;
  recordId: string;
  groupId: string;
  actorUserId: string;
  /** First name to compose title (e.g. "Amanda"). Resolved by caller. */
  actorFirstName: string;
  /** Child first name to compose body when relevant. */
  childFirstName?: string;
  /** Body — short description ("Pediatra · 20/05 14h" / "Cefalexina · Moderada"). */
  description: string;
  /**
   * Override de priority. Default por record_type:
   *   appointment / illness / medication / allergy → 'important'
   *   vaccination                                  → 'info'
   *
   * Trigger SQL `illness_episodes_grave_to_urgent` promove pra 'urgent'
   * automaticamente quando severity='grave' (server-side, antes do nosso
   * caller saber) — passar 'important' aqui está OK porque o registro já
   * está no banco com priority correta quando chamamos notifyCollabCreate.
   *
   * Mas tem detalhe: notifyCollabCreate recebe priority como input pra
   * decidir telemetria "urgent_created". Pra ela sair certa, leitamos o
   * priority efetivo da row antes de notificar.
   */
  priorityOverride?: CollabPriority;
}

/**
 * Defaults de priority por record_type — vide CLAUDE.md "Saúde Foundation".
 * Vacinas são informacionais; outras 4 são important por default (illness
 * pode virar urgent automaticamente via trigger SQL).
 */
function defaultPriority(rt: SaudeRecordType): CollabPriority {
  return rt === "vaccination_record" ? "info" : "important";
}

/**
 * Verb usado na primeira pessoa do título do push. Mantém copys em PT-BR
 * aqui pra facilitar review/iteração — quando o time for i18n-izar os
 * pushes (Fase 2), substituir por i18n keys.
 */
function actionVerb(rt: SaudeRecordType): string {
  switch (rt) {
    case "medical_appointment":
      return "agendou uma consulta";
    case "illness_episode":
      return "registrou um episódio de saúde";
    case "active_medication":
      return "iniciou um medicamento";
    case "child_allergy":
      return "cadastrou uma alergia";
    case "vaccination_record":
      return "registrou uma vacina";
  }
}

/**
 * Deep link pro card específico — usa o highlight=<id> pra abrir já
 * marcando o card e disparar mark_collab_read no client.
 */
function recordDeepLink(rt: SaudeRecordType, recordId: string): string {
  const base = (() => {
    switch (rt) {
      case "medical_appointment":
        return "/saude/agenda";
      case "illness_episode":
        return "/saude/doencas";
      case "active_medication":
        return "/saude/medicamentos";
      case "child_allergy":
        return "/saude/alergias";
      case "vaccination_record":
        return "/saude/vacinas";
    }
  })();
  return `${base}?highlight=${recordId}`;
}

/**
 * Resolve o priority EFETIVO da row no banco. Importante pro caso illness
 * com severity='grave': trigger SQL já promoveu pra 'urgent' antes deste
 * código rodar — leitamos a row pra refletir a verdade.
 *
 * Falha silenciosa (volta default) — notificação é best-effort.
 */
async function resolveEffectivePriority(
  rt: SaudeRecordType,
  recordId: string,
): Promise<CollabPriority> {
  const fallback = defaultPriority(rt);
  try {
    const admin = createAdminClient();
    const table = (() => {
      switch (rt) {
        case "medical_appointment":
          return "medical_appointments";
        case "illness_episode":
          return "illness_episodes";
        case "active_medication":
          return "active_medications";
        case "child_allergy":
          return "child_allergies";
        case "vaccination_record":
          return "vaccination_records";
      }
    })();
    const { data } = await admin
      .from(table)
      .select("priority")
      .eq("id", recordId)
      .single();
    return ((data?.priority as CollabPriority) || fallback);
  } catch {
    return fallback;
  }
}

/**
 * Fan-out wrapper. Resolve o priority real da row + monta título/body/link
 * + chama notifyCollabCreate. Falha silenciosa.
 */
export async function notifySaudeCreate(args: NotifySaudeArgs): Promise<void> {
  try {
    const priority =
      args.priorityOverride ?? (await resolveEffectivePriority(args.recordType, args.recordId));

    const title = `${args.actorFirstName} ${actionVerb(args.recordType)}`;
    const message = args.childFirstName
      ? `${args.description} · ${args.childFirstName}`
      : args.description;

    await notifyCollabCreate({
      recordType: args.recordType,
      recordId: args.recordId,
      groupId: args.groupId,
      actorUserId: args.actorUserId,
      priority,
      title,
      message,
      link: recordDeepLink(args.recordType, args.recordId),
    });
  } catch {
    // best-effort
  }
}
