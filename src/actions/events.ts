"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";

// ============================================================
// HELPERS
// ============================================================

async function getOtherGroupMembers(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  groupId: string,
  excludeUserId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", excludeUserId);
  return data?.map((m: { user_id: string }) => m.user_id) || [];
}

async function saveEventHistory(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  params: {
    eventId: string;
    groupId: string;
    actionType: string;
    performedBy: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  try {
    await supabase.from("event_history").insert({
      event_id: params.eventId,
      group_id: params.groupId,
      action_type: params.actionType,
      performed_by: params.performedBy,
      before_snapshot: params.before || null,
      after_snapshot: params.after || null,
      metadata: params.metadata || null,
    });
  } catch {
    // History failure should not block main action
  }
}

async function cancelPendingRequests(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  eventId: string,
  reason: string
) {
  try {
    await supabase
      .from("event_requests")
      .update({
        status: "cancelled_by_system",
        cancelled_reason: reason,
        responded_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("status", "pending");
  } catch {
    // Failure should not block main action
  }
}

async function getUserName(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  return data?.full_name?.split(" ")[0] || "Alguem";
}

async function notifyGroupMembers(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  groupId: string,
  excludeUserId: string,
  type: string,
  title: string,
  message: string,
  link: string
) {
  const members = await getOtherGroupMembers(supabase, groupId, excludeUserId);
  await Promise.allSettled(
    members.map((uid) => createNotificationWithPush(uid, type, title, message, link))
  );
}

// ============================================================
// CREATE EVENT
// ============================================================

export async function createEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const endDateRaw = formData.get("endDate") as string | null;
  const isAllDay = formData.get("allDay") === "true";

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;

  // Verify child belongs to group
  if (childId) {
    const { data: child } = await supabase.from("children").select("id").eq("id", childId).eq("group_id", groupId).single();
    if (!child) redirect("/eventos?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
  }

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const eventDate = formData.get("eventDate") as string;
  const eventTime = formData.get("eventTime") as string;
  const location = (formData.get("location") as string)?.trim();
  const assignedTo = formData.get("assignedTo") as string | null;

  if (!title) {
    redirect("/calendario?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  // Handle image upload (max 5MB)
  const image = formData.get("image") as File;
  let imageUrl: string | null = null;

  if (image && image.size > 5 * 1024 * 1024) {
    redirect("/eventos?error=" + encodeURIComponent("Imagem muito grande. Maximo 5MB."));
  }

  // Validate image MIME type
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
  if (image && image.size > 0 && !ALLOWED_IMAGE_TYPES.includes(image.type)) {
    redirect("/calendario?error=" + encodeURIComponent("Tipo de arquivo não permitido."));
  }

  if (image && image.size > 0) {
    try {
      const fileName = `events/${groupId}/${Date.now()}-${image.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, image);

      if (!uploadError) {
        // Path-only (post-migration 062). Reads sign URLs at render time.
        imageUrl = fileName;
      } else {
        console.error("Event image upload failed:", uploadError.message);
        imageUrl = null;
      }
    } catch (err) {
      console.error("Event image upload error:", err);
      imageUrl = null;
    }
  }

  // Build event rows (multi-day creates one event per day)
  const eventRows: Array<Record<string, unknown>> = [];
  const startDate = new Date(eventDate + "T12:00:00");
  const endDate = endDateRaw && endDateRaw >= eventDate ? new Date(endDateRaw + "T12:00:00") : startDate;
  const dayCount = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (86400000)) + 1);
  const maxDays = Math.min(dayCount, 60); // safety limit

  for (let i = 0; i < maxDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    eventRows.push({
      group_id: groupId,
      child_id: childId || null,
      title: maxDays > 1 ? `${title} (${i + 1}/${maxDays})` : title,
      description: description || null,
      event_date: dateStr,
      end_date: maxDays > 1 ? endDate.toISOString().slice(0, 10) : null,
      event_time: isAllDay ? null : (eventTime || null),
      all_day: isAllDay,
      location: location || null,
      image_url: imageUrl,
      assigned_to: (assignedTo && assignedTo !== "other") ? assignedTo : null,
      created_by: user.id,
    });
  }

  const { data: insertedEvents, error } = await supabase.from("events").insert(eventRows).select("id");

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_created", { category: "calendar", title });

  // Save history for created events
  if (insertedEvents) {
    for (const ev of insertedEvents) {
      await saveEventHistory(supabase, {
        eventId: ev.id,
        groupId,
        actionType: "created",
        performedBy: user.id,
        after: eventRows[0],
      });
    }
  }

  // Post to chat
  try {
    const dateFormatted = new Date(eventDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    const multiDayText = maxDays > 1 ? ` (${maxDays} dias)` : "";
    await postChatNotification(
      supabase, groupId, user.id,
      `📅 Novo evento: ${title}${eventTime ? ` às ${eventTime}` : ""}${multiDayText} — ${dateFormatted}${location ? ` · ${location}` : ""}`
    );
  } catch {
    // Notification failure should not break the action
  }

  // Send push notification if assigned to another user
  if (assignedTo && assignedTo !== "other" && assignedTo !== user.id) {
    try {
      const creatorName = await getUserName(supabase, user.id);
      const dateFormatted2 = new Date(eventDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

      await createNotificationWithPush(
        assignedTo,
        "event_changed",
        "Novo compromisso para voce",
        `${creatorName} atribuiu "${title}" para voce em ${dateFormatted2}`,
        "/calendario"
      );
    } catch {
      // push notification failure is non-critical
    }
  }

  // Notify other group members about the new event
  try {
    const creatorName = await getUserName(supabase, user.id);
    const dateFormatted3 = new Date(eventDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    await notifyGroupMembers(
      supabase, groupId, user.id,
      "event_changed",
      "Novo evento criado",
      `${creatorName} criou "${title}" em ${dateFormatted3}`,
      "/calendario"
    );
  } catch {
    // non-critical
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  revalidatePath("/chat");
  redirect("/calendario");
}

// ============================================================
// UPDATE EVENT
// ============================================================

export async function updateEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/calendario?error=" + encodeURIComponent("Sem permissao."));
  }

  // Fetch existing event
  const { data: existingEvent } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("group_id", groupId)
    .single();

  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }

  // Permission check: if not creator and not admin, create a request instead
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (memberRole?.role !== "admin") {
      // Create request instead of blocking
      const childId = formData.get("childId") as string;
      const title = (formData.get("title") as string)?.trim();
      const description = (formData.get("description") as string)?.trim();
      const eventDate = formData.get("eventDate") as string;
      const eventTime = formData.get("eventTime") as string;
      const location = (formData.get("location") as string)?.trim();

      const result = await requestEventChange({
        supabase,
        user,
        groupId,
        eventId,
        existingEvent,
        actionType: "edit",
        proposedChanges: {
          child_id: childId || null,
          title,
          description: description || null,
          event_date: eventDate,
          event_time: eventTime || null,
          location: location || null,
        },
        reason: formData.get("reason") as string,
      });

      if (result.error) {
        redirect("/calendario?error=" + encodeURIComponent(result.error));
      }
      redirect("/calendario?requestSent=true");
    }
  }

  const childId = formData.get("childId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const eventDate = formData.get("eventDate") as string;
  const eventTime = formData.get("eventTime") as string;
  const location = (formData.get("location") as string)?.trim();

  if (!title) {
    redirect("/calendario?error=" + encodeURIComponent("Titulo obrigatorio."));
  }

  const updateData = {
    child_id: childId || null,
    title,
    description: description || null,
    event_date: eventDate,
    event_time: eventTime || null,
    location: location || null,
  };

  const { error } = await supabase.from("events").update(updateData)
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_updated", { eventId });

  // Save history
  await saveEventHistory(supabase, {
    eventId,
    groupId,
    actionType: "updated",
    performedBy: user.id,
    before: existingEvent,
    after: updateData,
    metadata: { impact_type: existingEvent.event_date !== eventDate ? "schedule" : "none" },
  });

  // Auto-cancel pending requests
  await cancelPendingRequests(supabase, eventId, "event_changed");

  // Notify other group members
  try {
    const userName = await getUserName(supabase, user.id);
    const changes: string[] = [];
    if (existingEvent.title !== title) changes.push(`titulo: "${existingEvent.title}" → "${title}"`);
    if (existingEvent.event_date !== eventDate) {
      const oldDate = new Date(existingEvent.event_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
      const newDate = new Date(eventDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
      changes.push(`data: ${oldDate} → ${newDate}`);
    }
    if (existingEvent.event_time !== (eventTime || null)) {
      changes.push(`horario: ${existingEvent.event_time || "sem horario"} → ${eventTime || "sem horario"}`);
    }

    const changeText = changes.length > 0 ? ` (${changes.join(", ")})` : "";

    await notifyGroupMembers(
      supabase, groupId, user.id,
      "event_changed",
      "Evento alterado",
      `${userName} alterou "${existingEvent.title}"${changeText}`,
      "/calendario"
    );

    await postChatNotification(
      supabase, groupId, user.id,
      `✏️ Evento alterado: ${existingEvent.title}${changeText}`
    );
  } catch {
    // non-critical
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}

// ============================================================
// DELETE EVENT
// ============================================================

export async function deleteEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/calendario?error=" + encodeURIComponent("Sem permissao."));
  }

  // Fetch existing event
  const { data: existingEvent } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("group_id", groupId)
    .single();

  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }

  // Permission check: if not creator and not admin, create a request
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (memberRole?.role !== "admin") {
      const result = await requestEventChange({
        supabase,
        user,
        groupId,
        eventId,
        existingEvent,
        actionType: "delete",
        proposedChanges: null,
        reason: formData.get("reason") as string,
      });

      if (result.error) {
        redirect("/calendario?error=" + encodeURIComponent(result.error));
      }
      redirect("/calendario?requestSent=true");
    }
  }

  // Save history before deleting
  await saveEventHistory(supabase, {
    eventId,
    groupId,
    actionType: "deleted",
    performedBy: user.id,
    before: existingEvent,
  });

  // Cancel pending requests before delete
  await cancelPendingRequests(supabase, eventId, "event_deleted");

  const { error } = await supabase.from("events").delete()
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_deleted", { eventId });

  // Notify other group members
  try {
    const userName = await getUserName(supabase, user.id);
    const dateFormatted = new Date(existingEvent.event_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

    await notifyGroupMembers(
      supabase, groupId, user.id,
      "event_changed",
      "Evento excluido",
      `${userName} excluiu "${existingEvent.title}" de ${dateFormatted}`,
      "/calendario"
    );

    await postChatNotification(
      supabase, groupId, user.id,
      `🗑️ Evento excluido: ${existingEvent.title} — ${dateFormatted}`
    );
  } catch {
    // non-critical
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}

// ============================================================
// CANCEL EVENT
// ============================================================

export async function cancelEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/calendario?error=" + encodeURIComponent("Sem permissao."));
  }

  // Fetch existing event
  const { data: existingEvent } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("group_id", groupId)
    .single();

  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }

  // Permission check: if not creator and not admin, create a request
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (memberRole?.role !== "admin") {
      const result = await requestEventChange({
        supabase,
        user,
        groupId,
        eventId,
        existingEvent,
        actionType: "cancel",
        proposedChanges: { status: "cancelled" },
        reason: formData.get("reason") as string,
      });

      if (result.error) {
        redirect("/calendario?error=" + encodeURIComponent(result.error));
      }
      redirect("/calendario?requestSent=true");
    }
  }

  const { error } = await supabase.from("events").update({ status: "cancelled" })
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  // Save history
  await saveEventHistory(supabase, {
    eventId,
    groupId,
    actionType: "cancelled",
    performedBy: user.id,
    before: existingEvent,
    after: { ...existingEvent, status: "cancelled" },
  });

  // Cancel pending requests
  await cancelPendingRequests(supabase, eventId, "event_cancelled");

  // Notify other group members
  try {
    const userName = await getUserName(supabase, user.id);
    const dateFormatted = new Date(existingEvent.event_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

    await notifyGroupMembers(
      supabase, groupId, user.id,
      "event_changed",
      "Evento cancelado",
      `${userName} cancelou "${existingEvent.title}" de ${dateFormatted}`,
      "/calendario"
    );

    await postChatNotification(
      supabase, groupId, user.id,
      `❌ Evento cancelado: ${existingEvent.title} — ${dateFormatted}`
    );
  } catch {
    // non-critical
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}

// ============================================================
// REQUEST EVENT CHANGE (internal helper, called by update/cancel/delete)
// ============================================================

async function requestEventChange(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  groupId: string;
  eventId: string;
  existingEvent: Record<string, unknown>;
  actionType: "edit" | "cancel" | "reschedule" | "delete";
  proposedChanges: Record<string, unknown> | null;
  reason: string | null;
}) {
  const { supabase, user, groupId, eventId, existingEvent, actionType, proposedChanges, reason } = params;

  // Get affected users (all group members except requester)
  const affectedUserIds = await getOtherGroupMembers(supabase, groupId, user.id);

  if (affectedUserIds.length === 0) {
    return { error: "Nenhum outro membro no grupo para aprovar." };
  }

  // Check if there's already a pending request for this event
  const { data: existingRequest } = await supabase
    .from("event_requests")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .single();

  if (existingRequest) {
    return { error: "Ja existe uma solicitacao pendente para este evento. Aguarde a resposta." };
  }

  // Create the request
  const { error: insertError } = await supabase.from("event_requests").insert({
    group_id: groupId,
    event_id: eventId,
    requester_id: user.id,
    affected_user_ids: affectedUserIds,
    action_type: actionType,
    proposed_changes: proposedChanges,
    original_snapshot: existingEvent,
    reason: reason || null,
    status: "pending",
    approval_mode: "any",
  });

  if (insertError) {
    // Handle unique constraint violation gracefully
    if (insertError.code === "23505") {
      return { error: "Ja existe uma solicitacao pendente para este evento." };
    }
    return { error: insertError.message };
  }

  // Save history
  await saveEventHistory(supabase, {
    eventId,
    groupId,
    actionType: "request_created",
    performedBy: user.id,
    before: existingEvent,
    after: proposedChanges,
    metadata: { action_type: actionType, reason },
  });

  // Notify affected users
  try {
    const requesterName = await getUserName(supabase, user.id);
    const eventTitle = existingEvent.title as string;

    const actionLabel: Record<string, string> = {
      edit: "alterar",
      cancel: "cancelar",
      reschedule: "reagendar",
      delete: "excluir",
    };

    let detailText = "";
    if (actionType === "edit" && proposedChanges) {
      const changes: string[] = [];
      if (proposedChanges.event_date && proposedChanges.event_date !== existingEvent.event_date) {
        const oldDate = new Date((existingEvent.event_date as string) + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", weekday: "short" });
        const newDate = new Date((proposedChanges.event_date as string) + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", weekday: "short" });
        changes.push(`${oldDate} → ${newDate}`);
      }
      if (proposedChanges.event_time && proposedChanges.event_time !== existingEvent.event_time) {
        changes.push(`${existingEvent.event_time || "sem horario"} → ${proposedChanges.event_time}`);
      }
      if (changes.length > 0) detailText = ` (${changes.join(", ")})`;
    }

    await Promise.allSettled(
      affectedUserIds.map((uid) =>
        createNotificationWithPush(
          uid,
          "event_request",
          "Solicitacao de alteracao",
          `${requesterName} quer ${actionLabel[actionType]} "${eventTitle}"${detailText}`,
          "/calendario"
        )
      )
    );

    await postChatNotification(
      supabase, groupId, user.id,
      `🔔 Solicitou ${actionLabel[actionType]} "${eventTitle}"${detailText}`
    );
  } catch {
    // non-critical
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  return { success: true, requestCreated: true };
}

// ============================================================
// RESPOND TO EVENT REQUEST
// ============================================================

export async function respondToEventRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const requestId = formData.get("requestId") as string;
  const response = formData.get("response") as "approved" | "rejected";

  // Fetch the request
  const { data: req } = await supabase
    .from("event_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!req) return { error: "Solicitacao nao encontrada." };
  if (req.status !== "pending") return { error: "Esta solicitacao ja foi respondida." };

  // Verify user is affected
  const affectedIds: string[] = req.affected_user_ids || [];
  if (!affectedIds.includes(user.id)) {
    return { error: "Voce nao tem permissao para responder esta solicitacao." };
  }

  if (response === "approved") {
    // CRITICAL: Validate snapshot before applying
    const { data: currentEvent } = await supabase
      .from("events")
      .select("*")
      .eq("id", req.event_id)
      .single();

    if (!currentEvent) {
      // Event was deleted since request was created
      await supabase.from("event_requests").update({
        status: "cancelled_by_system",
        cancelled_reason: "event_deleted",
        responded_at: new Date().toISOString(),
      }).eq("id", requestId);
      return { error: "O evento foi excluido desde a solicitacao." };
    }

    // Compare critical fields with original snapshot
    const snapshot = req.original_snapshot as Record<string, unknown>;
    const criticalFields = ["title", "event_date", "event_time", "status"];
    const hasConflict = criticalFields.some(
      (field) => String(currentEvent[field] ?? "") !== String(snapshot[field] ?? "")
    );

    if (hasConflict) {
      await supabase.from("event_requests").update({
        status: "cancelled_by_system",
        cancelled_reason: "event_changed_after_request",
        responded_at: new Date().toISOString(),
      }).eq("id", requestId);

      await saveEventHistory(supabase, {
        eventId: req.event_id,
        groupId: req.group_id,
        actionType: "request_cancelled",
        performedBy: user.id,
        metadata: { request_id: requestId, reason: "event_changed_after_request" },
      });

      return { error: "O evento foi alterado desde a solicitacao. A solicitacao foi cancelada automaticamente." };
    }

    // Apply changes based on action type
    if (req.action_type === "edit" || req.action_type === "reschedule") {
      const { error: updateError } = await supabase
        .from("events")
        .update(req.proposed_changes as Record<string, unknown>)
        .eq("id", req.event_id);

      if (updateError) return { error: updateError.message };
    } else if (req.action_type === "cancel") {
      const { error: updateError } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", req.event_id);

      if (updateError) return { error: updateError.message };
    } else if (req.action_type === "delete") {
      const { error: deleteError } = await supabase
        .from("events")
        .delete()
        .eq("id", req.event_id);

      if (deleteError) return { error: deleteError.message };
    }

    // Update request status
    await supabase.from("event_requests").update({
      status: "approved",
      responded_by: user.id,
      responded_at: new Date().toISOString(),
    }).eq("id", requestId);

    // Save history
    await saveEventHistory(supabase, {
      eventId: req.event_id,
      groupId: req.group_id,
      actionType: "request_approved",
      performedBy: user.id,
      before: req.original_snapshot as Record<string, unknown>,
      after: req.proposed_changes as Record<string, unknown>,
      metadata: { request_id: requestId },
    });

    // Notify requester
    try {
      const responderName = await getUserName(supabase, user.id);
      const eventTitle = (req.original_snapshot as Record<string, unknown>)?.title as string;

      await createNotificationWithPush(
        req.requester_id,
        "event_response",
        "Solicitacao aprovada!",
        `${responderName} aprovou sua alteracao em "${eventTitle}"`,
        "/calendario"
      );

      await postChatNotification(
        supabase, req.group_id, user.id,
        `✅ Solicitacao aprovada: "${eventTitle}"`
      );
    } catch {
      // non-critical
    }
  } else {
    // Rejected
    await supabase.from("event_requests").update({
      status: "rejected",
      responded_by: user.id,
      responded_at: new Date().toISOString(),
    }).eq("id", requestId);

    await saveEventHistory(supabase, {
      eventId: req.event_id,
      groupId: req.group_id,
      actionType: "request_rejected",
      performedBy: user.id,
      metadata: { request_id: requestId },
    });

    // Notify requester
    try {
      const responderName = await getUserName(supabase, user.id);
      const eventTitle = (req.original_snapshot as Record<string, unknown>)?.title as string;

      await createNotificationWithPush(
        req.requester_id,
        "event_response",
        "Solicitacao recusada",
        `${responderName} recusou sua alteracao em "${eventTitle}"`,
        "/calendario"
      );

      await postChatNotification(
        supabase, req.group_id, user.id,
        `❌ Solicitacao recusada: "${eventTitle}"`
      );
    } catch {
      // non-critical
    }
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  return { success: true };
}

// ============================================================
// GET PENDING EVENT REQUESTS (for UI)
// ============================================================

export async function getPendingEventRequests(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("event_requests")
    .select(`
      *,
      requester:profiles!event_requests_requester_id_fkey(full_name, avatar_url)
    `)
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return data || [];
}

// ============================================================
// CHECK IF EVENT HAS PENDING REQUEST (for UI blocking)
// ============================================================

export async function eventHasPendingRequest(eventId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("event_requests")
    .select("id, action_type, requester_id")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .single();

  return data || null;
}
