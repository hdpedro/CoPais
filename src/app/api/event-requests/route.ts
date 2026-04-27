/**
 * /api/event-requests
 *
 * Native-callable wrapper around the event-request workflow currently
 * implemented in `src/actions/events.ts`:
 *   - POST   → create a new event-action request (edit | cancel | reschedule | delete)
 *   - PATCH  → respond to a pending request (approved | rejected). On approval,
 *             applies the change to the underlying `events` row, with snapshot
 *             validation + approval_mode 'all' aggregation.
 *   - DELETE → cancel a pending request (only the requester can).
 *
 * Native previously did direct mutations against `event_requests`, `events`
 * and `event_history` from the client which:
 *   - skipped the `original_snapshot` conflict check (could overwrite a
 *     concurrent edit silently)
 *   - ignored `approval_mode = 'all'` (single approval would close requests
 *     that should require unanimity)
 *   - wrote `event_history` rows with the wrong column names (`changed_by`,
 *     `action`, `changes` — none exist; the actual columns are
 *     `performed_by`, `action_type`, `before_snapshot`, `after_snapshot`)
 *     so every audit row was being silently swallowed by the try/catch.
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";

type ActionType = "edit" | "cancel" | "reschedule" | "delete";
const VALID_ACTIONS: ActionType[] = ["edit", "cancel", "reschedule", "delete"];

type Decision = "approved" | "rejected";
const VALID_DECISIONS: Decision[] = ["approved", "rejected"];

type ApprovalMode = "any" | "all";

async function getUserName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  return data?.full_name?.split(" ")[0] || "Alguém";
}

async function saveEventHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: {
    eventId: string;
    groupId: string;
    actionType: string;
    performedBy: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  try {
    await admin.from("event_history").insert({
      event_id: params.eventId,
      group_id: params.groupId,
      action_type: params.actionType,
      performed_by: params.performedBy,
      before_snapshot: params.before ?? null,
      after_snapshot: params.after ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // History failure must not block the main action
  }
}

// ============================================================
// POST — create a new event-action request
// ============================================================
export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const eventId = body.eventId as string | undefined;
  const actionType = body.actionType as string | undefined;
  const affectedUserIds = Array.isArray(body.affectedUserIds)
    ? (body.affectedUserIds as string[]).filter((u) => typeof u === "string")
    : null;
  const proposedChanges =
    (body.proposedChanges as Record<string, unknown> | null | undefined) ?? null;
  const originalSnapshot =
    (body.originalSnapshot as Record<string, unknown> | undefined) ?? null;
  const reason = (body.reason as string | undefined) || null;
  const approvalModeIn = body.approvalMode as string | undefined;
  const approvalMode: ApprovalMode = approvalModeIn === "all" ? "all" : "any";

  if (!groupId || !eventId) {
    return NextResponse.json(
      { error: "groupId e eventId obrigatórios." },
      { status: 400 },
    );
  }
  if (!actionType || !VALID_ACTIONS.includes(actionType as ActionType)) {
    return NextResponse.json(
      { error: `actionType inválido. Valores aceitos: ${VALID_ACTIONS.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!affectedUserIds || affectedUserIds.length === 0) {
    return NextResponse.json(
      { error: "affectedUserIds não pode estar vazio." },
      { status: 400 },
    );
  }
  if (!originalSnapshot || typeof originalSnapshot !== "object") {
    return NextResponse.json(
      { error: "originalSnapshot obrigatório." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Group-membership gate
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // Event must belong to the group
  const { data: ev } = await admin
    .from("events")
    .select("id, group_id, title")
    .eq("id", eventId)
    .single();
  if (!ev || ev.group_id !== groupId) {
    return NextResponse.json(
      { error: "Evento não encontrado neste grupo." },
      { status: 404 },
    );
  }

  // Reject if there is already a pending request for this event (parity with PWA)
  const { data: existing } = await admin
    .from("event_requests")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Já existe uma solicitação pendente para este evento." },
      { status: 409 },
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("event_requests")
    .insert({
      group_id: groupId,
      event_id: eventId,
      requester_id: user.id,
      affected_user_ids: affectedUserIds,
      action_type: actionType,
      proposed_changes: proposedChanges,
      original_snapshot: originalSnapshot,
      reason,
      status: "pending",
      approval_mode: approvalMode,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma solicitação pendente para este evento." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: insertError?.message || "Erro ao criar pedido." },
      { status: 400 },
    );
  }

  // Audit
  await saveEventHistory(admin, {
    eventId,
    groupId,
    actionType: "request_created",
    performedBy: user.id,
    before: originalSnapshot,
    after: proposedChanges,
    metadata: { action_type: actionType, reason, approval_mode: approvalMode },
  });

  // Notify affected users (non-blocking)
  try {
    const requesterName = await getUserName(admin, user.id);
    const eventTitle = (ev.title as string) || "evento";
    const actionLabel: Record<ActionType, string> = {
      edit: "alterar",
      cancel: "cancelar",
      reschedule: "reagendar",
      delete: "excluir",
    };
    await Promise.allSettled(
      affectedUserIds.map((uid) =>
        createNotificationWithPush(
          uid,
          "event_request",
          "Solicitação de alteração",
          `${requesterName} quer ${actionLabel[actionType as ActionType]} "${eventTitle}"`,
          "/calendario",
        ),
      ),
    );
    await postChatNotification(
      admin,
      groupId,
      user.id,
      `🔔 Solicitou ${actionLabel[actionType as ActionType]} "${eventTitle}"`,
    );
  } catch {
    // non-critical
  }

  captureServerEvent(user.id, "event_request_created", {
    action_type: actionType,
    approval_mode: approvalMode,
  });

  revalidateTag(`event-requests-${groupId}`, "max");
  revalidatePath("/calendario");
  revalidatePath("/eventos");

  return NextResponse.json({ success: true, id: inserted.id });
}

// ============================================================
// PATCH — respond to a pending request (approved | rejected)
// ============================================================
export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestId = body.requestId as string | undefined;
  const decision = body.decision as string | undefined;

  if (!requestId || !decision) {
    return NextResponse.json(
      { error: "requestId e decision obrigatórios." },
      { status: 400 },
    );
  }
  if (!VALID_DECISIONS.includes(decision as Decision)) {
    return NextResponse.json(
      { error: `decision inválido. Valores aceitos: ${VALID_DECISIONS.join(", ")}.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("event_requests")
    .select(
      "id, group_id, event_id, requester_id, affected_user_ids, action_type, proposed_changes, original_snapshot, status, approval_mode, responded_by",
    )
    .eq("id", requestId)
    .single();

  if (!req) {
    return NextResponse.json(
      { error: "Solicitação não encontrada." },
      { status: 404 },
    );
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "Esta solicitação já foi respondida." },
      { status: 400 },
    );
  }

  // Caller must be one of the affected users
  const affectedIds: string[] = req.affected_user_ids || [];
  if (!affectedIds.includes(user.id)) {
    return NextResponse.json(
      { error: "Você não tem permissão para responder esta solicitação." },
      { status: 403 },
    );
  }

  // ── REJECTED — single rejection always closes the request ───────────
  if (decision === "rejected") {
    await admin
      .from("event_requests")
      .update({
        status: "rejected",
        responded_by: user.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await saveEventHistory(admin, {
      eventId: req.event_id,
      groupId: req.group_id,
      actionType: "request_rejected",
      performedBy: user.id,
      metadata: { request_id: requestId },
    });

    try {
      const responderName = await getUserName(admin, user.id);
      const eventTitle =
        (req.original_snapshot as Record<string, unknown> | null)?.title as
          | string
          | undefined || "evento";
      await createNotificationWithPush(
        req.requester_id,
        "event_response",
        "Solicitação recusada",
        `${responderName} recusou sua alteração em "${eventTitle}"`,
        "/calendario",
      );
      await postChatNotification(
        admin,
        req.group_id,
        user.id,
        `❌ Solicitação recusada: "${eventTitle}"`,
      );
    } catch {
      // non-critical
    }

    captureServerEvent(user.id, "event_request_rejected", {
      action_type: req.action_type,
    });
    revalidateTag(`event-requests-${req.group_id}`, "max");
    revalidatePath("/calendario");
    revalidatePath("/eventos");
    return NextResponse.json({ success: true, applied: false, status: "rejected" });
  }

  // ── APPROVED ────────────────────────────────────────────────────────
  // approval_mode = 'all' → every affected user must approve before applying.
  // approval_mode = 'any' → first approval applies the change.
  //
  // For 'all', we record this user's individual approval in the metadata
  // column and only apply the change once the set of approvers contains
  // every affected user. We continue to leave `status='pending'` until then.
  const approvalMode = (req.approval_mode || "any") as ApprovalMode;

  if (approvalMode === "all") {
    // Compute prior approvers from event_history (rows we wrote on each
    // partial approval). We can't put the list on event_requests itself
    // without a schema change.
    const { data: priorApprovals } = await admin
      .from("event_history")
      .select("performed_by")
      .eq("event_id", req.event_id)
      .eq("action_type", "request_partial_approval")
      .contains("metadata", { request_id: requestId });

    const priorIds = new Set<string>(
      (priorApprovals || []).map((r) => r.performed_by as string),
    );
    priorIds.add(user.id);

    const allApproved = affectedIds.every((uid) => priorIds.has(uid));

    if (!allApproved) {
      // Record partial approval and keep the request pending.
      await saveEventHistory(admin, {
        eventId: req.event_id,
        groupId: req.group_id,
        actionType: "request_partial_approval",
        performedBy: user.id,
        metadata: { request_id: requestId },
      });

      captureServerEvent(user.id, "event_request_partial_approval", {
        action_type: req.action_type,
        approvers_so_far: priorIds.size,
        approvers_needed: affectedIds.length,
      });

      revalidateTag(`event-requests-${req.group_id}`, "max");
      return NextResponse.json({
        success: true,
        applied: false,
        status: "pending",
        approvers_so_far: priorIds.size,
        approvers_needed: affectedIds.length,
      });
    }
    // Fall through to apply (all approvers in)
  }

  // Snapshot conflict-check before applying (parity with PWA action)
  const { data: currentEvent } = await admin
    .from("events")
    .select("*")
    .eq("id", req.event_id)
    .single();

  if (!currentEvent) {
    await admin
      .from("event_requests")
      .update({
        status: "cancelled_by_system",
        cancelled_reason: "event_deleted",
        responded_by: user.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    return NextResponse.json(
      { error: "O evento foi excluído desde a solicitação." },
      { status: 409 },
    );
  }

  const snapshot = (req.original_snapshot as Record<string, unknown>) || {};
  const criticalFields = ["title", "event_date", "event_time", "status"];
  const hasConflict = criticalFields.some(
    (field) =>
      String((currentEvent as Record<string, unknown>)[field] ?? "") !==
      String(snapshot[field] ?? ""),
  );
  if (hasConflict) {
    await admin
      .from("event_requests")
      .update({
        status: "cancelled_by_system",
        cancelled_reason: "event_changed_after_request",
        responded_by: user.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await saveEventHistory(admin, {
      eventId: req.event_id,
      groupId: req.group_id,
      actionType: "request_cancelled",
      performedBy: user.id,
      metadata: { request_id: requestId, reason: "event_changed_after_request" },
    });

    return NextResponse.json(
      {
        error:
          "O evento foi alterado desde a solicitação. A solicitação foi cancelada automaticamente.",
      },
      { status: 409 },
    );
  }

  // Apply change to the actual event row
  let applyError: string | null = null;
  if (req.action_type === "edit" || req.action_type === "reschedule") {
    if (req.proposed_changes && typeof req.proposed_changes === "object") {
      const { error } = await admin
        .from("events")
        .update(req.proposed_changes as Record<string, unknown>)
        .eq("id", req.event_id);
      if (error) applyError = error.message;
    }
  } else if (req.action_type === "cancel") {
    const { error } = await admin
      .from("events")
      .update({ status: "cancelled" })
      .eq("id", req.event_id);
    if (error) applyError = error.message;
  } else if (req.action_type === "delete") {
    const { error } = await admin
      .from("events")
      .delete()
      .eq("id", req.event_id);
    if (error) applyError = error.message;
  }

  if (applyError) {
    return NextResponse.json({ error: applyError }, { status: 400 });
  }

  // Mark request approved
  await admin
    .from("event_requests")
    .update({
      status: "approved",
      responded_by: user.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await saveEventHistory(admin, {
    eventId: req.event_id,
    groupId: req.group_id,
    actionType: "request_approved",
    performedBy: user.id,
    before: req.original_snapshot as Record<string, unknown> | null,
    after: req.proposed_changes as Record<string, unknown> | null,
    metadata: { request_id: requestId, approval_mode: approvalMode },
  });

  // Notify requester (non-blocking)
  try {
    const responderName = await getUserName(admin, user.id);
    const eventTitle =
      ((req.original_snapshot as Record<string, unknown> | null)?.title as
        | string
        | undefined) || "evento";
    await createNotificationWithPush(
      req.requester_id,
      "event_response",
      "Solicitação aprovada!",
      `${responderName} aprovou sua alteração em "${eventTitle}"`,
      "/calendario",
    );
    await postChatNotification(
      admin,
      req.group_id,
      user.id,
      `✅ Solicitação aprovada: "${eventTitle}"`,
    );
  } catch {
    // non-critical
  }

  captureServerEvent(user.id, "event_request_approved", {
    action_type: req.action_type,
    approval_mode: approvalMode,
  });

  revalidateTag(`event-requests-${req.group_id}`, "max");
  revalidatePath("/calendario");
  revalidatePath("/eventos");

  return NextResponse.json({ success: true, applied: true, status: "approved" });
}

// ============================================================
// DELETE — requester cancels their own pending request
// ============================================================
export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestId = url.searchParams.get("id");
  if (!requestId) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("event_requests")
    .select("id, group_id, event_id, requester_id, status")
    .eq("id", requestId)
    .single();

  if (!req) {
    return NextResponse.json(
      { error: "Solicitação não encontrada." },
      { status: 404 },
    );
  }
  if (req.requester_id !== user.id) {
    return NextResponse.json(
      { error: "Apenas o autor pode cancelar a solicitação." },
      { status: 403 },
    );
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "Esta solicitação já foi respondida." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("event_requests")
    .update({
      status: "cancelled_by_system",
      cancelled_reason: "cancelled_by_requester",
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await saveEventHistory(admin, {
    eventId: req.event_id,
    groupId: req.group_id,
    actionType: "request_cancelled",
    performedBy: user.id,
    metadata: { request_id: requestId, reason: "cancelled_by_requester" },
  });

  captureServerEvent(user.id, "event_request_cancelled", {});

  revalidateTag(`event-requests-${req.group_id}`, "max");
  revalidatePath("/calendario");
  revalidatePath("/eventos");

  return NextResponse.json({ success: true });
}
