/* ------------------------------------------------------------------ */
/* services/care-routine-proposals.ts                                  */
/* Proposta PERMANENTE de rotina (leva/busca) — OK-do-outro (N4).      */
/*                                                                     */
/* A proposta nasce do Kindar Brain (narrativa "a partir de agora      */
/* segunda quem leva é o pai" → brain_intake_execute_custody_plan v2   */
/* insere em care_routine_slot_proposals). Este service dá a RESPOSTA: */
/* quem responde é OUTRO membro (a RPC recusa o próprio proponente);   */
/* aceitar MATERIALIZA o padrão semanal (UPSERT nos slots, na RPC).    */
/*                                                                     */
/* Espelho do services/swap.ts (mesma governança bilateral):           */
/*   - src/actions/care-routine.ts (PWA server action)                 */
/*   - src/app/api/care-routine/slot-proposals/route.ts (Native REST)  */
/* Side effects (push ao proponente, post no chat) vivem AQUI.         */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";

export interface RespondSlotProposalInput {
  proposalId: string;
  responderId: string;
  decision: "accepted" | "declined";
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export interface PendingSlotProposal {
  id: string;
  weekday: number;
  leg: "dropoff" | "pickup";
  responsible_label: string | null;
  time_of_day: string | null;
  proposed_by: string;
  proposer_name: string;
  child_ids: string[];
  created_at: string;
}

/** Propostas pendentes do grupo (pro card no /calendario). */
export async function listPendingSlotProposals(
  supabase: SupabaseClient,
  groupId: string,
): Promise<PendingSlotProposal[]> {
  const { data, error } = await supabase
    .from("care_routine_slot_proposals")
    .select("id, weekday, leg, responsible_label, time_of_day, proposed_by, child_ids, created_at, profiles!care_routine_slot_proposals_proposed_by_fkey(full_name)")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => {
    const prof = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const full = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name;
    return {
      id: r.id as string,
      weekday: r.weekday as number,
      leg: r.leg as "dropoff" | "pickup",
      responsible_label: (r.responsible_label as string | null) ?? null,
      time_of_day: (r.time_of_day as string | null) ?? null,
      proposed_by: r.proposed_by as string,
      proposer_name: (full || "").split(" ")[0] || "Alguém",
      child_ids: (r.child_ids as string[]) ?? [],
      created_at: r.created_at as string,
    };
  });
}

/** Frase humana da proposta ("toda segunda quem leva passa a ser Fernanda às 07:30"). */
export function describeSlotProposal(p: {
  weekday: number;
  leg: "dropoff" | "pickup";
  responsible_label: string | null;
  time_of_day: string | null;
}): string {
  const verb = p.leg === "pickup" ? "busca" : "leva";
  const time = p.time_of_day ? ` às ${p.time_of_day.slice(0, 5)}` : "";
  const who = p.responsible_label || "o responsável combinado";
  return `toda ${WEEKDAYS_PT[p.weekday] ?? "semana"} quem ${verb} passa a ser ${who}${time}`;
}

/* ------------------------------------------------------------------ */
/* Responder (aceitar materializa o padrão semanal — na RPC)           */
/* ------------------------------------------------------------------ */

export async function respondToSlotProposal(
  supabase: SupabaseClient,
  input: RespondSlotProposalInput,
): Promise<ServiceResult<{ outcome: string; slotsUpdated: number }>> {
  const { proposalId, responderId, decision } = input;
  if (!proposalId || (decision !== "accepted" && decision !== "declined")) {
    return { ok: false, error: "proposalId e decision (accepted|declined) obrigatórios.", status: 400 };
  }

  const { data, error } = await supabase.rpc("care_routine_respond_slot_proposal", {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_actor_user_id: responderId,
  });
  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  const r = (data ?? {}) as {
    outcome?: string;
    slots_updated?: number;
    proposed_by?: string;
    group_id?: string;
  };
  if (r.outcome === "not_found") return { ok: false, error: "Proposta não encontrada.", status: 404 };
  if (r.outcome === "forbidden") return { ok: false, error: "Sem acesso a esta proposta.", status: 403 };
  if (r.outcome === "own_proposal") {
    return { ok: false, error: "Quem propôs não pode aceitar a própria proposta — o OK é do outro responsável.", status: 403 };
  }
  if (r.outcome === "already_responded") {
    return { ok: false, error: "Esta proposta já foi respondida.", status: 409 };
  }
  if (r.outcome !== "accepted" && r.outcome !== "declined") {
    return { ok: false, error: "Resposta inválida da proposta.", status: 500 };
  }

  captureServerEvent(responderId, `care_slot_proposal_${r.outcome}`, {
    proposal_id: proposalId,
    slots_updated: r.slots_updated ?? 0,
  });

  // Side effects non-fatais (padrão do swap): push pro proponente + chat.
  if (r.proposed_by && r.group_id) {
    await sendProposalResponseNotifications({
      supabase,
      proposalId,
      proposerId: r.proposed_by,
      responderId,
      groupId: r.group_id,
      decision: r.outcome,
    });
  }

  return { ok: true, data: { outcome: r.outcome, slotsUpdated: r.slots_updated ?? 0 } };
}

async function sendProposalResponseNotifications(args: {
  supabase: SupabaseClient;
  proposalId: string;
  proposerId: string;
  responderId: string;
  groupId: string;
  decision: "accepted" | "declined";
}): Promise<void> {
  let phrase = "a mudança fixa de rotina";
  try {
    const { data } = await args.supabase
      .from("care_routine_slot_proposals")
      .select("weekday, leg, responsible_label, time_of_day")
      .eq("id", args.proposalId)
      .single();
    if (data) phrase = describeSlotProposal(data as Parameters<typeof describeSlotProposal>[0]);
  } catch {
    // fica a frase genérica
  }

  try {
    const { data: responder } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.responderId)
      .single();
    const name = responder?.full_name?.split(" ")[0] || "O outro responsável";
    await createNotificationWithPush(
      args.proposerId,
      "care_slot_proposal_response",
      args.decision === "accepted" ? "Rotina combinada! ✅" : "Proposta de rotina recusada",
      args.decision === "accepted"
        ? `${name} aceitou: ${phrase}.`
        : `${name} recusou a mudança fixa (${phrase}). A rotina continua como estava.`,
      "/calendario/rotina",
    );
  } catch {
    // ignore
  }

  try {
    const chatMsg =
      args.decision === "accepted"
        ? `✅ Rotina atualizada: ${phrase}`
        : `❌ Proposta de rotina recusada (${phrase})`;
    await postChatNotification(args.supabase, args.groupId, args.responderId, chatMsg);
  } catch {
    // ignore
  }
}
