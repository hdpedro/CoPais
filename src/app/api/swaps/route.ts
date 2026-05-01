/**
 * POST  /api/swaps  → create a swap_requests row (custody day swap or debt-day).
 * PATCH /api/swaps  → respond to a pending swap (approved | rejected). When
 *                     approved the route ALSO materializes the resulting
 *                     custody_events rows so the calendar reflects the change.
 *
 * Native-callable wrapper around `src/actions/calendar.ts:requestSwap` and
 * `respondToSwapRequest`. The custody-direction logic (Angelino fix —
 * originalDate flips to whoever was NOT the original owner) lives here so
 * native and PWA both materialize swaps the same way.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const targetUserId = body.targetUserId as string | undefined;
  const originalDate = body.originalDate as string | undefined;
  const proposedDate = (body.proposedDate as string | null | undefined) || null;
  const reason = ((body.reason as string | null | undefined) || null);
  const requestType = (body.type as string | undefined) || "swap";

  if (!groupId || !targetUserId || !originalDate) {
    return NextResponse.json(
      { error: "Parâmetros obrigatórios ausentes." },
      { status: 400 },
    );
  }
  if (!ISO_DATE.test(originalDate)) {
    return NextResponse.json(
      { error: "originalDate inválida (YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  if (proposedDate && !ISO_DATE.test(proposedDate)) {
    return NextResponse.json(
      { error: "proposedDate inválida (YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "Não é possível solicitar troca consigo mesmo." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Group-membership gate (both requester and target).
  const { data: memberships } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .in("user_id", [user.id, targetUserId]);
  const hasRequester = memberships?.some((m) => m.user_id === user.id);
  const hasTarget = memberships?.some((m) => m.user_id === targetUserId);
  if (!hasRequester) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }
  if (!hasTarget) {
    return NextResponse.json(
      { error: "Usuário alvo não pertence a este grupo." },
      { status: 400 },
    );
  }

  const isVisit = requestType === "visit";
  const isDebtSwap = requestType === "swap" && !proposedDate;
  const finalReason = isDebtSwap
    ? `[DIVIDA] ${reason || ""}`.trim()
    : reason || null;

  const { data: inserted, error } = await admin
    .from("swap_requests")
    .insert({
      group_id: groupId,
      requester_id: user.id,
      target_user_id: targetUserId,
      original_date: originalDate,
      proposed_date: proposedDate,
      reason: finalReason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "swap_request_created", {
    group_id: groupId,
    type: isVisit ? "visit" : isDebtSwap ? "debt" : "swap",
  });

  // Push + chat side-effects (non-blocking, mirrors PWA action).
  try {
    const { data: requesterProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const requesterName = requesterProfile?.full_name?.split(" ")[0] || "Alguém";
    const dateFormatted = new Date(originalDate + "T12:00:00").toLocaleDateString(
      "pt-BR",
      { day: "numeric", month: "short" },
    );
    const notifTitle = isVisit
      ? "Solicitação de Visita"
      : isDebtSwap
        ? "Solicitação de Dia (dívida)"
        : "Solicitação de Troca";
    const notifBody = isVisit
      ? `${requesterName} quer visitar em ${dateFormatted}`
      : isDebtSwap
        ? `${requesterName} quer pegar o dia ${dateFormatted} (ficará devendo)`
        : `${requesterName} quer trocar o dia ${dateFormatted}`;
    await createNotificationWithPush(
      targetUserId,
      "swap_request",
      notifTitle,
      notifBody,
      "/calendario",
    );
  } catch {
    // ignore
  }

  try {
    const chatIcon = isVisit ? "👀" : isDebtSwap ? "📅" : "🔄";
    const chatMsg = isVisit
      ? `${chatIcon} Solicitou visita para ${new Date(originalDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", weekday: "short" })}`
      : isDebtSwap
        ? `${chatIcon} Solicitou o dia ${new Date(originalDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", weekday: "short" })} (dívida de dia)`
        : `${chatIcon} Solicitou troca: ${new Date(originalDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} ↔ ${new Date(String(proposedDate) + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;
    await postChatNotification(admin, groupId, user.id, chatMsg);
  } catch {
    // ignore
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return NextResponse.json({ success: true, id: inserted?.id });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const swapId = body.swapId as string | undefined;
  const decision = body.decision as "approved" | "rejected" | undefined;
  if (!swapId || (decision !== "approved" && decision !== "rejected")) {
    return NextResponse.json(
      { error: "swapId e decision (approved|rejected) obrigatórios." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: req } = await admin
    .from("swap_requests")
    .select(
      "id, group_id, requester_id, target_user_id, original_date, proposed_date, reason, status",
    )
    .eq("id", swapId)
    .single();
  if (!req) {
    return NextResponse.json(
      { error: "Solicitação não encontrada." },
      { status: 404 },
    );
  }
  if (req.target_user_id !== user.id) {
    return NextResponse.json(
      { error: "Apenas o destinatário pode responder." },
      { status: 403 },
    );
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "Esta solicitação já foi processada." },
      { status: 400 },
    );
  }

  // Idempotent status update.
  const { data: updated, error: updateError } = await admin
    .from("swap_requests")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", swapId)
    .eq("status", "pending")
    .select("id");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Já processada por outro usuário." },
      { status: 409 },
    );
  }

  // Materialize approved swap as custody_events rows.
  if (decision === "approved") {
    const { data: origEvents } = await admin
      .from("custody_events")
      .select("child_id, responsible_user_id, start_date, end_date")
      .eq("group_id", req.group_id)
      .lte("start_date", req.original_date)
      .gte("end_date", req.original_date)
      .limit(1);

    const swapEvents: Array<Record<string, unknown>> = [];

    if (origEvents && origEvents[0]) {
      // Direction fix (Angelino PR #3): day flips to whoever was NOT the
      // original owner. Requester offering OWN day → target gets it;
      // otherwise requester gets target's day as requested.
      const currentOwner = origEvents[0].responsible_user_id;
      const newOwner =
        currentOwner === req.requester_id
          ? req.target_user_id
          : req.requester_id;
      swapEvents.push({
        group_id: req.group_id,
        child_id: origEvents[0].child_id,
        responsible_user_id: newOwner,
        start_date: req.original_date,
        end_date: req.original_date,
        custody_type: "swap",
        notes: req.proposed_date
          ? `Troca aprovada: ${req.reason || "sem motivo"}`
          : `Dívida de dia: ${req.reason || "sem motivo"}`,
        created_by: user.id,
      });
    }

    if (req.proposed_date) {
      const { data: propEvents } = await admin
        .from("custody_events")
        .select("child_id, responsible_user_id, start_date, end_date")
        .eq("group_id", req.group_id)
        .lte("start_date", req.proposed_date)
        .gte("end_date", req.proposed_date)
        .limit(1);
      if (propEvents && propEvents[0]) {
        // Same flip-from-current-owner logic as original date — the day
        // goes to whoever was NOT the current owner. The previous
        // hardcoded `target_user_id` flipped the day BACK to the original
        // owner (Amanda), leaving Angelino's view showing Amanda's color
        // on dates he was supposed to have taken. (Bug 2026-05-01.)
        swapEvents.push({
          group_id: req.group_id,
          child_id: propEvents[0].child_id,
          responsible_user_id:
            propEvents[0].responsible_user_id === req.requester_id
              ? req.target_user_id
              : req.requester_id,
          start_date: req.proposed_date,
          end_date: req.proposed_date,
          custody_type: "swap",
          notes: `Troca aprovada: ${req.reason || "sem motivo"}`,
          created_by: user.id,
        });
      }
    }

    if (swapEvents.length > 0) {
      const { error: insertError } = await admin
        .from("custody_events")
        .insert(swapEvents);
      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 },
        );
      }
    }
  }

  captureServerEvent(user.id, `swap_${decision}`, {
    swap_id: swapId,
    group_id: req.group_id,
  });

  // Push + chat side-effects (non-blocking).
  try {
    const { data: responderProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const responderName =
      responderProfile?.full_name?.split(" ")[0] || "Alguém";
    await createNotificationWithPush(
      req.requester_id,
      "swap_response",
      decision === "approved" ? "Troca Aceita!" : "Troca Recusada",
      decision === "approved"
        ? `${responderName} aceitou sua solicitação de troca`
        : `${responderName} recusou sua solicitação de troca`,
      "/calendario",
    );
  } catch {
    // ignore
  }

  try {
    const dateStr = new Date(
      req.original_date + "T12:00:00",
    ).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    const chatMsg =
      decision === "approved"
        ? `✅ Troca aceita para ${dateStr}`
        : `❌ Troca recusada para ${dateStr}`;
    await postChatNotification(admin, req.group_id, user.id, chatMsg);
  } catch {
    // ignore
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return NextResponse.json({ success: true });
}
