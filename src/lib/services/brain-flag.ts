/*
 * brain-flag.ts — kill-switch + allowlist do Kindar Brain (A0)
 *
 * Duas camadas (a mais segura possível):
 *  - Master kill-switch: env FEATURE_BRAIN_FAMILY_INBOX (liga/desliga
 *    global em segundos, sem deploy).
 *  - Allowlist por grupo: coparenting_groups.brain_beta_enabled
 *    (migration 00127, escrita só por service_role).
 * Efetivo = master E grupo. Defesa em profundidade: a UI nao mostra o
 * upload fora do beta E o servidor rejeita. Fail-closed: erro -> off.
 */

import type { createClient } from "@/lib/supabase/server";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Master kill-switch global (env). Desligado por padrão. */
export function isBrainMasterEnabled(): boolean {
  return process.env.FEATURE_BRAIN_FAMILY_INBOX === "true";
}

/**
 * Playbook de SAÚDE habilitado? Interruptor PRÓPRIO (env FEATURE_BRAIN_HEALTH_
 * VISIT), separado do escolar — o roteamento por docType='health_visit' ignora
 * ENABLED_DOC_TYPES, então precisa deste gate. OFF por padrão (fail-closed):
 * fica desligado até a migration 00134 estar em prod + o dono autorizar. Os
 * canais gateiam: isHealthVisitEnabled() && isBrainEnabledForGroup(grupo).
 */
export function isHealthVisitEnabled(): boolean {
  return process.env.FEATURE_BRAIN_HEALTH_VISIT === "true";
}

/**
 * Playbook de GUARDA & ROTINA (narrativa) habilitado? Interruptor PRÓPRIO
 * (env FEATURE_BRAIN_CUSTODY_ROUTINE), mesmo molde da saúde. OFF por padrão
 * (fail-closed): fica desligado até a migration 00137 estar em prod + o dono
 * autorizar. Canais gateiam: isCustodyRoutineEnabled() && isBrainEnabledForGroup.
 */
export function isCustodyRoutineEnabled(): boolean {
  return process.env.FEATURE_BRAIN_CUSTODY_ROUTINE === "true";
}

/**
 * Playbook de DESPESAS (Fase 2) habilitado? Mesmo molde: env própria,
 * OFF por padrão (fail-closed) até a migration + wiring + OK do dono.
 * Canais gateiam: isExpenseEnabled() && isBrainEnabledForGroup.
 */
export function isExpenseEnabled(): boolean {
  return process.env.FEATURE_BRAIN_EXPENSE === "true";
}

/**
 * Playbook de CONVITES (event_invite) habilitado? Mesmo molde: env própria,
 * OFF por padrão (fail-closed) até a migration 00142 + wiring + OK do dono.
 */
export function isEventInviteEnabled(): boolean {
  return process.env.FEATURE_BRAIN_EVENT_INVITE === "true";
}

/**
 * Brain habilitado para o grupo? master env `&&` grupo.brain_beta_enabled.
 * Fail-closed: qualquer erro/ausência → false (não vaza acesso).
 */
export async function isBrainEnabledForGroup(
  supabase: SupabaseServer,
  groupId: string,
): Promise<boolean> {
  if (!isBrainMasterEnabled()) return false;
  const { data, error } = await supabase
    .from("coparenting_groups")
    .select("brain_beta_enabled")
    .eq("id", groupId)
    .single();
  if (error || !data) return false;
  return (data as { brain_beta_enabled?: boolean }).brain_beta_enabled === true;
}
