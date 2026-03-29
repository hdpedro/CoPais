"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";

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
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
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

  const { error } = await supabase.from("events").insert(eventRows);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_created", { category: "calendar", title });

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
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const creatorName = creatorProfile?.full_name?.split(" ")[0] || "Alguém";
      const dateFormatted2 = new Date(eventDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

      // Use the existing push API endpoint instead of web-push directly
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/push/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: assignedTo,
          title: "Kindar — Novo compromisso para você",
          body: `${creatorName} atribuiu "${title}" para você em ${dateFormatted2}`,
          url: "/calendario",
        }),
      });
    } catch {
      // push notification failure is non-critical
    }
  }

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  revalidatePath("/chat");
  redirect("/calendario");
}

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

  // Verify user created the event or is admin
  const { data: existingEvent } = await supabase.from("events").select("created_by").eq("id", eventId).eq("group_id", groupId).single();
  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", user.id).single();
    if (memberRole?.role !== "admin") {
      redirect("/calendario?error=" + encodeURIComponent("Apenas o criador ou admin pode editar este evento."));
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

  const { error } = await supabase.from("events").update({
    child_id: childId || null,
    title,
    description: description || null,
    event_date: eventDate,
    event_time: eventTime || null,
    location: location || null,
  }).eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_updated", { eventId });

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}

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

  // Verify user created the event or is admin
  const { data: existingEvent } = await supabase.from("events").select("created_by").eq("id", eventId).eq("group_id", groupId).single();
  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", user.id).single();
    if (memberRole?.role !== "admin") {
      redirect("/calendario?error=" + encodeURIComponent("Apenas o criador ou admin pode excluir este evento."));
    }
  }

  const { error } = await supabase.from("events").delete()
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "event_deleted", { eventId });

  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}

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

  // Verify user created the event or is admin
  const { data: existingEvent } = await supabase.from("events").select("created_by").eq("id", eventId).eq("group_id", groupId).single();
  if (!existingEvent) {
    redirect("/calendario?error=" + encodeURIComponent("Evento nao encontrado."));
  }
  if (existingEvent.created_by !== user.id) {
    const { data: memberRole } = await supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", user.id).single();
    if (memberRole?.role !== "admin") {
      redirect("/calendario?error=" + encodeURIComponent("Apenas o criador ou admin pode cancelar este evento."));
    }
  }

  const { error } = await supabase.from("events").update({ status: "cancelled" })
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/calendario?error=" + encodeURIComponent(error.message));
  revalidatePath("/calendario");
  revalidatePath("/eventos");
  redirect("/calendario");
}
