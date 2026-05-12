/* ------------------------------------------------------------------ */
/* services/swap.ts                                                    */
/* Single source of truth for swap_request business logic.             */
/* Called by:                                                          */
/*   - src/actions/calendar.ts (PWA server actions, RLS client)        */
/*   - src/app/api/swaps/route.ts (Native REST, admin client)          */
/*   - src/lib/ai/tools.ts:create_swap_request / respond_swap_request  */
/*     (Assistant + WhatsApp, admin client)                            */
/*                                                                     */
/* Side effects (push, chat post, posthog) live HERE so all three      */
/* callers stay aligned. Callers handle only:                          */
/*   - Auth (resolve userId)                                           */
/*   - Input validation (HTTP/FormData parsing)                        */
/*   - Response shape (NextResponse vs redirect vs ToolResult)         */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyApprovalRequest } from "@/lib/whatsapp/notify";

export type SwapType = "swap" | "visit";

export interface CreateSwapInput {
  groupId: string;
  requesterId: string;
  targetUserId: string;
  originalDate: string; // YYYY-MM-DD
  proposedDate?: string | null;
  reason?: string | null;
  type?: SwapType;
}

export interface RespondSwapInput {
  swapId: string;
  responderId: string;
  decision: "approved" | "rejected";
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* Create swap request                                                 */
/* ------------------------------------------------------------------ */

export async function createSwapRequest(
  supabase: SupabaseClient,
  input: CreateSwapInput,
): Promise<ServiceResult<{ id: string; type: "visit" | "debt" | "swap" }>> {
  const {
    groupId,
    requesterId,
    targetUserId,
    originalDate,
    proposedDate = null,
    reason = null,
    type = "swap",
  } = input;

  if (!groupId || !targetUserId || !originalDate) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }
  if (!ISO_DATE.test(originalDate)) {
    return { ok: false, error: "originalDate inválida (YYYY-MM-DD).", status: 400 };
  }
  if (proposedDate && !ISO_DATE.test(proposedDate)) {
    return { ok: false, error: "proposedDate inválida (YYYY-MM-DD).", status: 400 };
  }

  // Self-swap protection — without this, tapping "Solicitar troca" no próprio
  // dia inserts uma swap_requests row com requester_id === target_user_id.
  if (targetUserId === requesterId) {
    return { ok: false, error: "Você já é responsável por este dia.", status: 400 };
  }

  // Group-membership gate (both requester and target must belong).
  const { data: memberships } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .in("user_id", [requesterId, targetUserId]);
  const hasRequester = memberships?.some((m) => m.user_id === requesterId);
  const hasTarget = memberships?.some((m) => m.user_id === targetUserId);
  if (!hasRequester) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }
  if (!hasTarget) {
    return { ok: false, error: "Usuário alvo não pertence a este grupo.", status: 400 };
  }

  const isVisit = type === "visit";
  const isDebtSwap = type === "swap" && !proposedDate;
  const finalReason = isDebtSwap
    ? `[DIVIDA] ${reason || ""}`.trim()
    : reason || null;

  const { data: inserted, error } = await supabase
    .from("swap_requests")
    .insert({
      group_id: groupId,
      requester_id: requesterId,
      target_user_id: targetUserId,
      original_date: originalDate,
      proposed_date: proposedDate,
      reason: finalReason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message || "Falha ao criar troca.", status: 400 };
  }

  const swapId = inserted.id as string;

  captureServerEvent(requesterId, "swap_request_created", {
    group_id: groupId,
    type: isVisit ? "visit" : isDebtSwap ? "debt" : "swap",
  });

  // Push + chat side-effects (non-blocking, identical for PWA/Native/WhatsApp).
  await sendSwapCreatedNotifications({
    supabase,
    groupId,
    requesterId,
    targetUserId,
    originalDate,
    proposedDate,
    isVisit,
    isDebtSwap,
  });

  // WhatsApp approval card to the target (fire-and-forget; only sent if
  // target has WhatsApp linked and custody_alerts pref enabled).
  const dateBR = originalDate.split("-").reverse().join("/");
  const propBR = proposedDate ? proposedDate.split("-").reverse().join("/") : null;
  const approvalBody = isVisit
    ? `Solicitação de visita para ${dateBR}.`
    : isDebtSwap
      ? `Pedido do dia ${dateBR} (ficará devendo).${reason ? `\nMotivo: ${reason}` : ""}`
      : `Troca: ${dateBR} ↔ ${propBR}.${reason ? `\nMotivo: ${reason}` : ""}`;
  notifyApprovalRequest({
    targetUserId,
    entity: "swap",
    entityId: swapId,
    body: approvalBody,
  }).catch(() => {
    // already swallowed inside notifyApprovalRequest
  });

  return {
    ok: true,
    data: {
      id: swapId,
      type: isVisit ? "visit" : isDebtSwap ? "debt" : "swap",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Respond to swap request (approve / reject + materialize custody)    */
/* ------------------------------------------------------------------ */

export async function respondToSwapRequest(
  supabase: SupabaseClient,
  input: RespondSwapInput,
): Promise<ServiceResult<{ id: string; decision: "approved" | "rejected" }>> {
  const { swapId, responderId, decision } = input;

  if (!swapId || (decision !== "approved" && decision !== "rejected")) {
    return {
      ok: false,
      error: "swapId e decision (approved|rejected) obrigatórios.",
      status: 400,
    };
  }

  const { data: req } = await supabase
    .from("swap_requests")
    .select(
      "id, group_id, requester_id, target_user_id, original_date, proposed_date, reason, status",
    )
    .eq("id", swapId)
    .single();

  if (!req) {
    return { ok: false, error: "Solicitação não encontrada.", status: 404 };
  }
  if (req.target_user_id !== responderId) {
    return {
      ok: false,
      error: "Apenas o destinatário pode responder.",
      status: 403,
    };
  }
  if (req.status !== "pending") {
    return { ok: false, error: "Esta solicitação já foi processada.", status: 400 };
  }

  // Idempotent status update — only flips if still pending.
  const { data: updated, error: updateError } = await supabase
    .from("swap_requests")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", swapId)
    .eq("status", "pending")
    .select("id");
  if (updateError) {
    return { ok: false, error: updateError.message, status: 400 };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Já processada por outro usuário.", status: 409 };
  }

  // Materialize custody on approval.
  if (decision === "approved") {
    const materialize = await materializeApprovedSwap(supabase, {
      groupId: req.group_id,
      requesterId: req.requester_id,
      targetUserId: req.target_user_id,
      originalDate: req.original_date,
      proposedDate: req.proposed_date,
      reason: req.reason,
      createdBy: responderId,
    });
    if (!materialize.ok) return materialize;
  }

  captureServerEvent(responderId, `swap_${decision}`, {
    swap_id: swapId,
    group_id: req.group_id,
  });

  await sendSwapResponseNotifications({
    supabase,
    requesterId: req.requester_id,
    responderId,
    groupId: req.group_id,
    originalDate: req.original_date,
    decision,
  });

  return { ok: true, data: { id: req.id, decision } };
}

/* ------------------------------------------------------------------ */
/* List pending swaps for a user (used by WhatsApp inbox query)        */
/* ------------------------------------------------------------------ */

export async function listPendingSwapsForUser(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<
  Array<{
    id: string;
    requester_id: string;
    requester_name: string;
    original_date: string;
    proposed_date: string | null;
    reason: string | null;
  }>
> {
  const { data: rows } = await supabase
    .from("swap_requests")
    .select("id, requester_id, original_date, proposed_date, reason")
    .eq("group_id", groupId)
    .eq("target_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return [];

  const requesterIds = Array.from(new Set(rows.map((r) => r.requester_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", requesterIds);
  const nameById = new Map(
    (profiles || []).map((p) => [p.id as string, (p.full_name as string) || "Alguém"]),
  );

  return rows.map((r) => ({
    id: r.id as string,
    requester_id: r.requester_id as string,
    requester_name: nameById.get(r.requester_id as string) || "Alguém",
    original_date: r.original_date as string,
    proposed_date: (r.proposed_date as string) || null,
    reason: (r.reason as string) || null,
  }));
}

/* ------------------------------------------------------------------ */
/* Internal: materialize approved swap as custody_events rows          */
/* Direction fix (Angelino PR + 2026-05-01): day flips to whoever was  */
/* NOT the current owner. Without this, requester offering OWN day     */
/* incorrectly hands the day back to the original owner.               */
/* ------------------------------------------------------------------ */

async function materializeApprovedSwap(
  supabase: SupabaseClient,
  params: {
    groupId: string;
    requesterId: string;
    targetUserId: string;
    originalDate: string;
    proposedDate: string | null;
    reason: string | null;
    createdBy: string;
  },
): Promise<ServiceResult<{ inserted: number }>> {
  const swapEvents: Array<Record<string, unknown>> = [];

  const { data: origEvents } = await supabase
    .from("custody_events")
    .select("child_id, responsible_user_id, start_date, end_date")
    .eq("group_id", params.groupId)
    .lte("start_date", params.originalDate)
    .gte("end_date", params.originalDate)
    .limit(1);

  if (origEvents && origEvents[0]) {
    const currentOwner = origEvents[0].responsible_user_id;
    const newOwner =
      currentOwner === params.requesterId
        ? params.targetUserId
        : params.requesterId;
    swapEvents.push({
      group_id: params.groupId,
      child_id: origEvents[0].child_id,
      responsible_user_id: newOwner,
      start_date: params.originalDate,
      end_date: params.originalDate,
      custody_type: "swap",
      notes: params.proposedDate
        ? `Troca aprovada: ${params.reason || "sem motivo"}`
        : `Dívida de dia: ${params.reason || "sem motivo"}`,
      created_by: params.createdBy,
    });
  }

  if (params.proposedDate) {
    const { data: propEvents } = await supabase
      .from("custody_events")
      .select("child_id, responsible_user_id, start_date, end_date")
      .eq("group_id", params.groupId)
      .lte("start_date", params.proposedDate)
      .gte("end_date", params.proposedDate)
      .limit(1);
    if (propEvents && propEvents[0]) {
      swapEvents.push({
        group_id: params.groupId,
        child_id: propEvents[0].child_id,
        responsible_user_id:
          propEvents[0].responsible_user_id === params.requesterId
            ? params.targetUserId
            : params.requesterId,
        start_date: params.proposedDate,
        end_date: params.proposedDate,
        custody_type: "swap",
        notes: `Troca aprovada: ${params.reason || "sem motivo"}`,
        created_by: params.createdBy,
      });
    }
  }

  if (swapEvents.length === 0) {
    return { ok: true, data: { inserted: 0 } };
  }

  // UPSERT idempotente — se respondToSwapRequest for chamada 2x (race
  // condition de double-tap ou retry), nao gera custody_events duplicados.
  // Migration 00076 garante o UNIQUE index. Bug Hailla 2026-05-11.
  const { error } = await supabase
    .from("custody_events")
    .upsert(swapEvents, {
      onConflict: "group_id,start_date,end_date,custody_type,responsible_user_id,child_id",
      ignoreDuplicates: true,
    });
  if (error) return { ok: false, error: error.message, status: 400 };
  return { ok: true, data: { inserted: swapEvents.length } };
}

/* ------------------------------------------------------------------ */
/* Internal: notifications on swap creation                            */
/* ------------------------------------------------------------------ */

async function sendSwapCreatedNotifications(args: {
  supabase: SupabaseClient;
  groupId: string;
  requesterId: string;
  targetUserId: string;
  originalDate: string;
  proposedDate: string | null;
  isVisit: boolean;
  isDebtSwap: boolean;
}): Promise<void> {
  try {
    const { data: requesterProfile } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.requesterId)
      .single();
    const requesterName =
      requesterProfile?.full_name?.split(" ")[0] || "Alguém";
    const dateFormatted = new Date(
      args.originalDate + "T12:00:00",
    ).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    const notifTitle = args.isVisit
      ? "Solicitação de Visita"
      : args.isDebtSwap
        ? "Solicitação de Dia (dívida)"
        : "Solicitação de Troca";
    const notifBody = args.isVisit
      ? `${requesterName} quer visitar em ${dateFormatted}`
      : args.isDebtSwap
        ? `${requesterName} quer pegar o dia ${dateFormatted} (ficará devendo)`
        : `${requesterName} quer trocar o dia ${dateFormatted}`;
    await createNotificationWithPush(
      args.targetUserId,
      "swap_request",
      notifTitle,
      notifBody,
      "/calendario",
    );
  } catch {
    // ignore — push failure must never block the swap creation
  }

  try {
    const chatIcon = args.isVisit ? "👀" : args.isDebtSwap ? "📅" : "🔄";
    const longDate = (iso: string) =>
      new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
        weekday: "short",
      });
    const shortDate = (iso: string) =>
      new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
      });
    const chatMsg = args.isVisit
      ? `${chatIcon} Solicitou visita para ${longDate(args.originalDate)}`
      : args.isDebtSwap
        ? `${chatIcon} Solicitou o dia ${longDate(args.originalDate)} (dívida de dia)`
        : `${chatIcon} Solicitou troca: ${shortDate(args.originalDate)} ↔ ${shortDate(String(args.proposedDate))}`;
    await postChatNotification(args.supabase, args.groupId, args.requesterId, chatMsg);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Internal: notifications on swap response                            */
/* ------------------------------------------------------------------ */

async function sendSwapResponseNotifications(args: {
  supabase: SupabaseClient;
  requesterId: string;
  responderId: string;
  groupId: string;
  originalDate: string;
  decision: "approved" | "rejected";
}): Promise<void> {
  try {
    const { data: responderProfile } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.responderId)
      .single();
    const responderName =
      responderProfile?.full_name?.split(" ")[0] || "Alguém";
    await createNotificationWithPush(
      args.requesterId,
      "swap_response",
      args.decision === "approved" ? "Troca Aceita!" : "Troca Recusada",
      args.decision === "approved"
        ? `${responderName} aceitou sua solicitação de troca`
        : `${responderName} recusou sua solicitação de troca`,
      "/calendario",
    );
  } catch {
    // ignore
  }

  try {
    const dateStr = new Date(
      args.originalDate + "T12:00:00",
    ).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    const chatMsg =
      args.decision === "approved"
        ? `✅ Troca aceita para ${dateStr}`
        : `❌ Troca recusada para ${dateStr}`;
    await postChatNotification(
      args.supabase,
      args.groupId,
      args.responderId,
      chatMsg,
    );
  } catch {
    // ignore
  }
}
