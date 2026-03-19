"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createCustodyEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;
  const responsibleUserId = formData.get("responsibleUserId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const custodyType = formData.get("custodyType") as string;
  const notes = formData.get("notes") as string;
  const startTime = formData.get("startTime") as string | null;
  const endTime = formData.get("endTime") as string | null;
  const isRecurring = formData.get("isRecurring") === "true";
  const recurrenceRule = formData.get("recurrenceRule") as string | null;
  const recurrenceUntil = formData.get("recurrenceUntil") as string | null;

  // If recurring, generate individual events
  if (isRecurring && recurrenceRule && recurrenceUntil) {
    const events = generateRecurringEvents({
      groupId,
      childId,
      responsibleUserId,
      startDate,
      endDate,
      custodyType,
      notes,
      startTime,
      endTime,
      recurrenceRule,
      recurrenceUntil,
      createdBy: user.id,
    });

    if (events.length > 0) {
      const { error } = await supabase.from("custody_events").insert(events);
      if (error) redirect("/calendario/novo?error=" + encodeURIComponent(error.message));
    }
  } else {
    const eventData: Record<string, unknown> = {
      group_id: groupId,
      child_id: childId,
      responsible_user_id: responsibleUserId,
      start_date: startDate,
      end_date: endDate,
      custody_type: custodyType,
      notes: notes || null,
      created_by: user.id,
    };
    // Only include time/recurring fields if they have values (columns may not exist yet)
    if (startTime) eventData.start_time = startTime;
    if (endTime) eventData.end_time = endTime;
    if (isRecurring) eventData.is_recurring = true;

    const { error } = await supabase.from("custody_events").insert(eventData);

    if (error) redirect("/calendario/novo?error=" + encodeURIComponent(error.message));
  }

  redirect("/calendario");
}

function generateRecurringEvents(params: {
  groupId: string;
  childId: string;
  responsibleUserId: string;
  startDate: string;
  endDate: string;
  custodyType: string;
  notes: string | null;
  startTime: string | null;
  endTime: string | null;
  recurrenceRule: string;
  recurrenceUntil: string;
  createdBy: string;
}) {
  const events: Array<Record<string, unknown>> = [];
  const start = new Date(params.startDate + "T12:00:00");
  const until = new Date(params.recurrenceUntil + "T12:00:00");

  // Calculate event duration in days
  const eventStart = new Date(params.startDate + "T12:00:00");
  const eventEnd = new Date(params.endDate + "T12:00:00");
  const durationDays = Math.round((eventEnd.getTime() - eventStart.getTime()) / (86400000));

  let interval = 7; // weekly by default
  if (params.recurrenceRule === "daily") interval = 1;
  else if (params.recurrenceRule === "biweekly") interval = 14;
  else if (params.recurrenceRule === "monthly") interval = 30;

  const current = new Date(start);
  while (current <= until && events.length < 52) {
    const endD = new Date(current);
    endD.setDate(endD.getDate() + durationDays);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const ev: Record<string, unknown> = {
      group_id: params.groupId,
      child_id: params.childId,
      responsible_user_id: params.responsibleUserId,
      start_date: fmt(current),
      end_date: fmt(endD),
      custody_type: params.custodyType,
      notes: params.notes || null,
      created_by: params.createdBy,
    };
    if (params.startTime) ev.start_time = params.startTime;
    if (params.endTime) ev.end_time = params.endTime;
    ev.is_recurring = true;
    ev.recurrence_rule = params.recurrenceRule;

    events.push(ev);

    current.setDate(current.getDate() + interval);
  }

  return events;
}

export async function createSwapRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    return { error: "Sem permissao para este grupo." };
  }

  const originalDate = formData.get("originalDate") as string;
  const proposedDate = formData.get("proposedDate") as string;
  const reason = formData.get("reason") as string;
  const targetUserId = formData.get("targetUserId") as string;

  if (!targetUserId) return { error: "Responsavel nao encontrado para este dia." };

  const { error } = await supabase.from("swap_requests").insert({
    group_id: groupId,
    requester_id: user.id,
    target_user_id: targetUserId,
    original_date: originalDate,
    proposed_date: proposedDate || null,
    reason: reason || null,
    status: "pending",
  });

  if (error) return { error: error.message };

  revalidatePath("/calendario");
  return { success: true };
}

export async function respondToSwapRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestId = formData.get("requestId") as string;
  const response = formData.get("response") as "approved" | "rejected";

  // Fetch the swap request
  const { data: req } = await supabase
    .from("swap_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!req || req.target_user_id !== user.id) {
    return { error: "Solicitacao nao encontrada" };
  }

  // Update status
  const { error: updateError } = await supabase
    .from("swap_requests")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", requestId);

  if (updateError) {
    return { error: updateError.message };
  }

  // If approved, swap custody for those dates
  if (response === "approved" && req.proposed_date) {
    // Find events that cover the original and proposed dates
    const { data: origEvents } = await supabase
      .from("custody_events")
      .select("*")
      .eq("group_id", req.group_id)
      .lte("start_date", req.original_date)
      .gte("end_date", req.original_date)
      .limit(1);

    const { data: propEvents } = await supabase
      .from("custody_events")
      .select("*")
      .eq("group_id", req.group_id)
      .lte("start_date", req.proposed_date)
      .gte("end_date", req.proposed_date)
      .limit(1);

    // Create swap events for single days
    const swapEvents = [];

    // Swap logic: requester wants original_date covered by target,
    // and in return covers target's proposed_date
    if (origEvents && origEvents[0]) {
      swapEvents.push({
        group_id: req.group_id,
        child_id: origEvents[0].child_id,
        responsible_user_id: req.target_user_id, // target covers requester's date
        start_date: req.original_date,
        end_date: req.original_date,
        custody_type: "swap",
        notes: `Troca aprovada: ${req.reason || "sem motivo"}`,
        created_by: user.id,
      });
    }

    if (propEvents && propEvents[0]) {
      swapEvents.push({
        group_id: req.group_id,
        child_id: propEvents[0].child_id,
        responsible_user_id: req.requester_id, // requester covers target's date
        start_date: req.proposed_date,
        end_date: req.proposed_date,
        custody_type: "swap",
        notes: `Troca aprovada: ${req.reason || "sem motivo"}`,
        created_by: user.id,
      });
    }

    if (swapEvents.length > 0) {
      const { error: insertError } = await supabase.from("custody_events").insert(swapEvents);
      if (insertError) {
        return { error: insertError.message };
      }
    }
  }

  revalidatePath("/calendario");
  return { success: true };
}

export async function generateSchedule(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    return { error: "Sem permissao para este grupo." };
  }

  const childId = formData.get("childId") as string;
  const patternJson = formData.get("pattern") as string;
  const startDateStr = formData.get("startDate") as string;
  const months = parseInt(formData.get("months") as string, 10);

  if (!groupId || !childId || !patternJson || !startDateStr || !months) {
    return { error: "Dados incompletos." };
  }

  let pattern: (string | null)[];
  try {
    pattern = JSON.parse(patternJson);
  } catch {
    return { error: "Padrao de escala com formato invalido." };
  }
  if (pattern.length !== 14 || pattern.every((p) => p === null)) {
    return { error: "Padrao de escala invalido." };
  }

  // Generate events by repeating the 14-day pattern
  const startDate = new Date(startDateStr + "T12:00:00");
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // CRITICAL: Pattern indices are day-of-week aligned:
  // pattern[0]=Dom, pattern[1]=Seg, ..., pattern[6]=Sab (Week 1)
  // pattern[7]=Dom, pattern[8]=Seg, ..., pattern[13]=Sab (Week 2)
  // We must map each date to its correct day-of-week in the pattern,
  // NOT just apply sequentially from the start date.

  // Reference point: the MONDAY of the start date's week
  // This anchors the 14-day cycle so Mon-Sun belong to the SAME week.
  // Without this, Sunday would be grouped with the NEXT week's Monday,
  // causing the calendar to show Sunday assigned to the wrong parent.
  const startDayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const refMonday = new Date(startDate);
  // Calculate days back to Monday: Sun(0)->-6, Mon(1)->0, Tue(2)->-1, etc.
  const daysToMonday = startDayOfWeek === 0 ? -6 : -(startDayOfWeek - 1);
  refMonday.setDate(refMonday.getDate() + daysToMonday);

  // Walk through each day, grouping consecutive days with the same parent into ranges
  const events: Array<Record<string, unknown>> = [];
  const current = new Date(startDate);
  let rangeStart: Date | null = null;
  let rangeUserId: string | null = null;

  while (current < endDate) {
    const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysSinceRef = Math.round((current.getTime() - refMonday.getTime()) / 86400000);
    const weekInCycle = Math.floor(daysSinceRef / 7) % 2; // 0=Week1, 1=Week2
    const patternIdx = weekInCycle * 7 + dayOfWeek;
    const userId = pattern[patternIdx];

    if (userId !== null) {
      if (rangeUserId === userId) {
        // Continue current range
      } else {
        // Close previous range if any
        if (rangeStart && rangeUserId) {
          const prevDay = new Date(current);
          prevDay.setDate(prevDay.getDate() - 1);
          events.push({
            group_id: groupId,
            child_id: childId,
            responsible_user_id: rangeUserId,
            start_date: fmt(rangeStart),
            end_date: fmt(prevDay),
            custody_type: "regular",
            notes: "Gerado pela escala quinzenal",
            created_by: user.id,
          });
        }
        // Start new range
        rangeStart = new Date(current);
        rangeUserId = userId;
      }
    } else {
      // Unassigned day — close any open range
      if (rangeStart && rangeUserId) {
        const prevDay = new Date(current);
        prevDay.setDate(prevDay.getDate() - 1);
        events.push({
          group_id: groupId,
          child_id: childId,
          responsible_user_id: rangeUserId,
          start_date: fmt(rangeStart),
          end_date: fmt(prevDay),
          custody_type: "regular",
          notes: "Gerado pela escala quinzenal",
          created_by: user.id,
        });
        rangeStart = null;
        rangeUserId = null;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Close final range
  if (rangeStart && rangeUserId) {
    const lastDay = new Date(current);
    lastDay.setDate(lastDay.getDate() - 1);
    events.push({
      group_id: groupId,
      child_id: childId,
      responsible_user_id: rangeUserId,
      start_date: fmt(rangeStart),
      end_date: fmt(lastDay),
      custody_type: "regular",
      notes: "Gerado pela escala quinzenal",
      created_by: user.id,
    });
  }

  if (events.length === 0) {
    return { error: "Nenhum evento gerado. Verifique o padrao." };
  }

  // Use service role to bypass RLS for batch insert
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete ALL existing regular schedule events for this child/group before inserting new ones
  // This catches old events regardless of their notes text (old versions used different text)
  const { error: deleteError } = await adminClient
    .from("custody_events")
    .delete()
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .eq("custody_type", "regular");

  if (deleteError) return { error: "Erro ao limpar escala anterior: " + deleteError.message };

  // Insert in batches of 100 to avoid payload limits
  for (let i = 0; i < events.length; i += 100) {
    const batch = events.slice(i, i + 100);
    const { error } = await adminClient.from("custody_events").insert(batch);
    if (error) return { error: error.message };
  }

  // Save schedule configuration for future editing (upsert)
  await adminClient
    .from("custody_schedules")
    .upsert(
      {
        group_id: groupId,
        child_id: childId,
        pattern: pattern,
        start_date: startDateStr,
        months,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,child_id" }
    );

  revalidatePath("/calendario");
  return { success: true, count: events.length };
}

export async function getOrCreateCalendarToken(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  // Check existing token
  const { data: existing } = await supabase
    .from("calendar_tokens")
    .select("token")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .single();

  if (existing) return { token: existing.token };

  // Create new token
  const { data: newToken, error } = await supabase
    .from("calendar_tokens")
    .insert({ user_id: user.id, group_id: groupId })
    .select("token")
    .single();

  if (error) return { error: error.message };
  return { token: newToken.token };
}
