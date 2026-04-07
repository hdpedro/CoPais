"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { createNotificationWithPush } from "@/lib/push";
// recurrence-utils no longer used — occurrences are pre-computed in calendar_occurrences table
import { formatDateKey, getBrazilToday } from "@/lib/calendar-utils";
import { captureServerEvent } from "@/lib/posthog-server";

export async function createActivity(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const membership = { groupId: activeGroup.groupId, role: activeGroup.role };

  const name = (formData.get("name") as string)?.trim();
  const category = formData.get("category") as string;
  const childId = formData.get("childId") as string | null;
  const recurrenceType = formData.get("recurrenceType") as string || "never";
  const daysOfWeekRaw = formData.get("daysOfWeek") as string;
  const dayOfMonth = formData.get("dayOfMonth") as string;
  const startDate = formData.get("startDate") as string || getBrazilToday();
  const endDate = formData.get("endDate") as string;
  const customInterval = formData.get("customInterval") as string;
  const customUnit = formData.get("customUnit") as string;
  const timeStart = formData.get("timeStart") as string;
  const timeEnd = formData.get("timeEnd") as string;
  const location = (formData.get("location") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();
  const checklistItemsRaw = formData.get("checklistItems") as string;
  const teacherName = (formData.get("teacherName") as string)?.trim();
  const className = (formData.get("className") as string)?.trim();
  const roomName = (formData.get("room") as string)?.trim();
  const responsibleId = (formData.get("responsibleId") as string)?.trim();

  if (!name) {
    return { error: "Nome da atividade e obrigatorio." };
  }

  const { data: activity, error } = await supabase
    .from("child_activities")
    .insert({
      group_id: membership.groupId,
      child_id: childId || null,
      name: name.trim(),
      category: category || "other",
      recurrence_type: recurrenceType,
      start_date: startDate,
      end_date: endDate || null,
      days_of_week: daysOfWeekRaw || null,
      day_of_month: dayOfMonth ? parseInt(dayOfMonth) : null,
      custom_interval: customInterval ? parseInt(customInterval) : 1,
      custom_unit: customUnit || "week",
      time_start: timeStart || null,
      time_end: timeEnd || null,
      location: location?.trim() || null,
      notes: notes?.trim() || null,
      teacher_name: teacherName || null,
      class_name: className || null,
      room: roomName || null,
      responsible_id: responsibleId || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Erro ao criar atividade: " + error.message };
  }

  // Insert checklist items
  if (checklistItemsRaw && activity) {
    try {
      const items: string[] = JSON.parse(checklistItemsRaw);
      if (items.length > 0) {
        const rows = items
          .filter((item) => item.trim())
          .map((item, i) => ({
            activity_id: activity.id,
            name: item.trim(),
            sort_order: i,
          }));
        if (rows.length > 0) {
          await supabase.from("activity_checklist_items").insert(rows);
        }
      }
    } catch {
      // ignore parse error
    }
  }

  // Pre-compute occurrence dates for fast calendar/dashboard queries
  if (activity) {
    const { generateOccurrences } = await import("@/lib/occurrence-generator");
    await generateOccurrences(supabase, {
      id: activity.id,
      group_id: membership.groupId,
      child_id: childId || null,
      recurrence_type: recurrenceType,
      start_date: startDate,
      end_date: endDate || null,
      days_of_week: daysOfWeekRaw || null,
      day_of_month: dayOfMonth ? parseInt(dayOfMonth) : null,
      custom_interval: customInterval ? parseInt(customInterval) : 1,
      custom_unit: customUnit || "week",
    });
  }

  captureServerEvent(user.id, "activity_created", { name, category });

  // Notify other group members
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", membership.groupId)
    .neq("user_id", user.id);

  let childName = "As criancas";
  if (childId) {
    const { data: child } = await supabase
      .from("children")
      .select("full_name")
      .eq("id", childId)
      .single();
    childName = child?.full_name?.split(" ")[0] || "Crianca";
  }

  if (members && members.length > 0) {
    try {
      await Promise.all(
        members.map((m) =>
          createNotificationWithPush(
            m.user_id,
            "activity",
            `Nova atividade: ${name}`,
            `${childName} tem uma nova atividade cadastrada: ${name}`,
            "/calendario"
          ).catch(() => {/* notification failure is non-critical */})
        )
      );
    } catch { /* notification failure is non-critical */ }
  }

  redirect("/calendario?success=Compromisso+criado+com+sucesso");
}

export async function deleteActivity(activityId: string) {
  if (!activityId?.trim()) {
    return { error: "ID da atividade obrigatorio" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };
  const membership = { groupId: activeGroup.groupId, role: activeGroup.role };

  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, group_id")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== membership.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  const { error } = await supabase
    .from("child_activities")
    .delete()
    .eq("id", activityId);

  if (error) return { error: error.message };

  captureServerEvent(user.id, "activity_deleted", { activityId });

  redirect("/calendario?success=Compromisso+removido");
}

export async function toggleChecklistItem(
  activityId: string,
  itemId: string,
  occurrenceDate: string,
  completed: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  if (completed) {
    const { error } = await supabase
      .from("checklist_completions")
      .upsert({
        activity_id: activityId,
        item_id: itemId,
        occurrence_date: occurrenceDate,
        completed_by: user.id,
      }, { onConflict: "item_id,occurrence_date" });

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("checklist_completions")
      .delete()
      .eq("item_id", itemId)
      .eq("occurrence_date", occurrenceDate);

    if (error) return { error: error.message };
  }

  return { success: true };
}

/**
 * Send push notifications for tomorrow's activities.
 * Called by cron job API route.
 */
export async function sendActivityReminders() {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);

  // Find tomorrow's activities via pre-computed calendar_occurrences (no runtime recurrence)
  const { data: occurrences } = await supabase
    .from("calendar_occurrences")
    .select("activity_id, child_activities!inner(id, name, category, time_start, group_id, child_id, children(full_name), activity_checklist_items(id, name, sort_order))")
    .eq("occurrence_date", tomorrowKey);

  if (!occurrences || occurrences.length === 0) return { sent: 0 };

  let sentCount = 0;

  const tomorrowActivities = occurrences.map((occ) => {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    return act;
  }).filter(Boolean);

  // Fetch members for all relevant groups in one batch (fixes N+1)
  const groupIds = [...new Set(tomorrowActivities.map((a) => a.group_id))];
  const { data: allMembers } = await supabase
    .from("group_members")
    .select("user_id, group_id")
    .in("group_id", groupIds);

  const membersByGroup: Record<string, string[]> = {};
  for (const m of allMembers || []) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m.user_id);
  }

  for (const activity of tomorrowActivities) {
    const childName = (activity.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";
    const items = (activity.activity_checklist_items as unknown as { name: string; sort_order: number }[]) || [];
    const itemList = items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.name)
      .join(", ");

    const timeStr = activity.time_start
      ? ` as ${activity.time_start.slice(0, 5)}`
      : "";

    const members = membersByGroup[activity.group_id] || [];

    try {
      await Promise.all(
        members.map((userId) => {
          const body = itemList
            ? `${childName} tem ${activity.name}${timeStr} amanha! Preparar: ${itemList}`
            : `${childName} tem ${activity.name}${timeStr} amanha!`;

          return createNotificationWithPush(
            userId,
            "activity_reminder",
            `${activity.name} amanha!`,
            body,
            "/atividades"
          ).catch(() => {/* notification failure is non-critical */});
        })
      );
      sentCount += members.length;
    } catch { /* notification failure is non-critical */ }
  }

  return { sent: sentCount };
}

/* ------------------------------------------------------------------ */
/*  Activity Reports                                                    */
/* ------------------------------------------------------------------ */

export async function submitActivityReport(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");

  const activityId = formData.get("activityId") as string;
  const occurrenceDate = formData.get("occurrenceDate") as string;
  const status = formData.get("status") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const childMood = (formData.get("childMood") as string) || null;

  if (!activityId || !occurrenceDate || !status) {
    return { error: "Campos obrigatorios faltando." };
  }

  if (!["completed", "missed", "cancelled"].includes(status)) {
    return { error: "Status invalido." };
  }

  if (childMood && !["happy", "neutral", "sad", "anxious", "tired"].includes(childMood)) {
    return { error: "Humor invalido." };
  }

  // Verify activity belongs to user's group
  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, name, group_id, child_id, children(full_name)")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada." };
  }

  // Use admin client to bypass RLS (upsert with user client fails silently)
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createAdminClient();

  // Check if report already exists
  const { data: existingReport } = await adminDb
    .from("activity_reports")
    .select("id")
    .eq("activity_id", activityId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  let saveError;
  if (existingReport) {
    const { error } = await adminDb
      .from("activity_reports")
      .update({ status, notes, child_mood: childMood, reported_by: user.id })
      .eq("id", existingReport.id);
    saveError = error;
  } else {
    const { error } = await adminDb
      .from("activity_reports")
      .insert({
        group_id: activeGroup.groupId,
        activity_id: activityId,
        occurrence_date: occurrenceDate,
        reported_by: user.id,
        status,
        notes,
        child_mood: childMood,
      });
    saveError = error;
  }

  if (saveError) {
    return { error: "Erro ao salvar relatorio: " + saveError.message };
  }

  captureServerEvent(user.id, "activity_report_submitted", { status });

  // Send notification to other parent about the activity report
  try {
    const childName = (activity.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";
    const statusLabels: Record<string, string> = {
      completed: "foi realizada ✅",
      missed: "nao aconteceu ❌",
      cancelled: "foi cancelada 🚫",
    };
    const statusLabel = statusLabels[status] || status;
    const moodLabels: Record<string, string> = {
      happy: "😊", neutral: "😐", sad: "😢", anxious: "😰", tired: "😴",
    };
    const moodText = childMood ? ` Humor: ${moodLabels[childMood] || childMood}` : "";

    // Chat notification
    const { postChatNotification } = await import("@/lib/chat-notify");
    await postChatNotification(
      supabase,
      activeGroup.groupId,
      user.id,
      `${activity.name} de ${childName} (${occurrenceDate}) ${statusLabel}.${moodText}${notes ? " Obs: " + notes : ""}`
    );

    // Push notification to other members
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", activeGroup.groupId)
      .neq("user_id", user.id);

    if (members && members.length > 0) {
      const { sendPushToUser } = await import("@/lib/push");
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      const senderName = profile?.full_name?.split(" ")[0] || "Responsavel";

      for (const member of members) {
        try {
          await sendPushToUser(member.user_id, {
            title: `${activity.name} — ${statusLabel}`,
            body: `${senderName} reportou: ${childName} ${statusLabel}${moodText}`,
            url: "/dashboard",
          });
        } catch { /* push failure is non-critical */ }
      }
    }
  } catch { /* notification failure is non-critical */ }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");

  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getPendingReports(groupId: string, userId: string) {
  const supabase = await createClient();

  const today = getBrazilToday();
  const todayKey = today;
  const todayDate = new Date(today + "T12:00:00");
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoKey = formatDateKey(sevenDaysAgo);

  // Get occurrences from last 7 days via pre-computed table (no runtime recurrence)
  const { data: occurrences } = await supabase
    .from("calendar_occurrences")
    .select("occurrence_date, activity_id, child_activities!inner(id, name, category, time_start, time_end, child_id, children(full_name))")
    .eq("group_id", groupId)
    .gte("occurrence_date", sevenDaysAgoKey)
    .lte("occurrence_date", todayKey)
    .limit(200);

  if (!occurrences || occurrences.length === 0) return [];

  // Get current hour in Brazil timezone to check if today's activities already ended
  const nowBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentTimeMinutes = nowBrazil.getHours() * 60 + nowBrazil.getMinutes();

  const pendingPairs: {
    activityId: string;
    activityName: string;
    category: string;
    childName: string;
    timeStart: string | null;
    occurrenceDate: string;
  }[] = [];

  for (const occ of occurrences) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    const dateKey = occ.occurrence_date;

    // For today's activities: only include if the activity has already ended
    if (dateKey === todayKey) {
      const timeEnd = act.time_end || act.time_start;
      if (timeEnd) {
        const [h, m] = timeEnd.split(":").map(Number);
        const actEndMinutes = h * 60 + (m || 0);
        if (currentTimeMinutes < actEndMinutes + 30) continue;
      } else {
        continue;
      }
    }

    pendingPairs.push({
      activityId: act.id,
      activityName: act.name,
      category: act.category,
      childName: (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
      timeStart: act.time_start,
      occurrenceDate: dateKey,
    });
  }

  if (pendingPairs.length === 0) return [];

  // Get existing reports for these activities in the date range
  const activityIds = [...new Set(pendingPairs.map((p) => p.activityId))];
  const { data: existingReports } = await supabase
    .from("activity_reports")
    .select("activity_id, occurrence_date")
    .in("activity_id", activityIds)
    .gte("occurrence_date", sevenDaysAgoKey)
    .lte("occurrence_date", todayKey);

  const reportedSet = new Set(
    (existingReports || []).map((r) => `${r.activity_id}:${r.occurrence_date}`)
  );

  // Filter to only pending (unreported) occurrences
  return pendingPairs
    .filter((p) => !reportedSet.has(`${p.activityId}:${p.occurrenceDate}`))
    .sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate));
}

export async function getReportsForDate(groupId: string, dateKey: string) {
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from("activity_reports")
    .select("activity_id, status, notes, child_mood, reported_by, profiles!activity_reports_reported_by_fkey(full_name)")
    .eq("group_id", groupId)
    .eq("occurrence_date", dateKey);

  return reports || [];
}

/**
 * Send reminders for yesterday's unreported activities.
 * Called by the cron job alongside sendActivityReminders.
 */
export async function sendMissedReportReminders() {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = getBrazilToday();
  const todayDate = new Date(today + "T12:00:00");
  const yesterday = new Date(todayDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDateKey(yesterday);

  // Find yesterday's activities via pre-computed calendar_occurrences (no runtime recurrence)
  const { data: occurrences } = await supabase
    .from("calendar_occurrences")
    .select("occurrence_date, group_id, activity_id, child_activities!inner(id, name, category, time_start, group_id, child_id, children(full_name))")
    .eq("occurrence_date", yesterdayKey);

  if (!occurrences || occurrences.length === 0) return { sent: 0 };

  let sentCount = 0;

  // Group by group_id for efficient report checking
  type ActivityFromOcc = { id: string; name: string; category: string; time_start: string | null; group_id: string; child_id: string | null; children: unknown };
  const byGroup: Record<string, ActivityFromOcc[]> = {};
  for (const occ of occurrences) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    if (!byGroup[occ.group_id]) byGroup[occ.group_id] = [];
    byGroup[occ.group_id].push(act as unknown as ActivityFromOcc);
  }

  for (const [groupId, groupActivities] of Object.entries(byGroup)) {
    const actIds = groupActivities.map((a) => a.id);
    const { data: existingReports } = await supabase
      .from("activity_reports")
      .select("activity_id")
      .in("activity_id", actIds)
      .eq("occurrence_date", yesterdayKey);

    const reportedIds = new Set((existingReports || []).map((r) => r.activity_id));
    const unreported = groupActivities.filter((a) => !reportedIds.has(a.id));

    if (unreported.length === 0) continue;

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    if (!members) continue;

    try {
      const notificationPromises = unreported.flatMap((act) => {
        const childName = (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";
        return members.map((member) =>
          createNotificationWithPush(
            member.user_id,
            "activity_report",
            `${act.name} de ontem - como foi?`,
            `${childName} teve ${act.name} ontem. Como foi a atividade?`,
            "/calendario"
          ).catch(() => {/* notification failure is non-critical */})
        );
      });
      await Promise.all(notificationPromises);
      sentCount += unreported.length * members.length;
    } catch { /* notification failure is non-critical */ }
  }

  return { sent: sentCount };
}

/* ------------------------------------------------------------------ */
/*  Cancel single occurrence of a recurring activity                   */
/* ------------------------------------------------------------------ */

export async function cancelActivityOccurrence(activityId: string, occurrenceDate: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  // Verify activity belongs to user's group
  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, name, group_id, child_id, children(full_name)")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  // Upsert an activity_report with status 'cancelled' for this date
  const { error } = await supabase
    .from("activity_reports")
    .upsert({
      group_id: activeGroup.groupId,
      activity_id: activityId,
      occurrence_date: occurrenceDate,
      reported_by: user.id,
      status: "cancelled",
      notes: null,
      child_mood: null,
    }, { onConflict: "activity_id,occurrence_date" });

  if (error) return { error: error.message };

  captureServerEvent(user.id, "activity_occurrence_cancelled", { activityId, date: occurrenceDate });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");

  return { success: true };
}

/* ------------------------------------------------------------------ */
/*  Change responsible for an activity occurrence                       */
/* ------------------------------------------------------------------ */

export async function changeActivityResponsible(
  activityId: string,
  occurrenceDate: string,
  newResponsibleId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  // Verify activity belongs to user's group
  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, name, group_id, child_id, children(full_name)")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  // Use admin client for all DB operations (bypass RLS completely)
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createAdminClient();

  // Check if report already exists
  const { data: existingReport } = await adminDb
    .from("activity_reports")
    .select("id")
    .eq("activity_id", activityId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  let saveError;
  if (existingReport) {
    const { error } = await adminDb
      .from("activity_reports")
      .update({ responsible_override: newResponsibleId })
      .eq("id", existingReport.id);
    saveError = error;
  } else {
    const { error } = await adminDb
      .from("activity_reports")
      .insert({
        group_id: activeGroup.groupId,
        activity_id: activityId,
        occurrence_date: occurrenceDate,
        reported_by: user.id,
        status: "completed",
        responsible_override: newResponsibleId,
      });
    saveError = error;
  }

  if (saveError) return { error: saveError.message };

  // Get the name of the new responsible
  const { data: newResponsibleProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", newResponsibleId)
    .single();

  const newResponsibleName = newResponsibleProfile?.full_name?.split(" ")[0] || "Alguem";
  const childName = (activity.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";

  // Send push notification to the new responsible
  if (newResponsibleId !== user.id) {
    await createNotificationWithPush(
      newResponsibleId,
      "activity",
      `Voce e o responsavel por ${activity.name}`,
      `Voce foi designado para levar ${childName} a ${activity.name} em ${occurrenceDate}.`,
      "/calendario"
    );
  }

  // Post chat notification
  const { postChatNotification } = await import("@/lib/chat-notify");
  await postChatNotification(
    supabase,
    activeGroup.groupId,
    user.id,
    `Responsavel por ${activity.name} de ${childName} (${occurrenceDate}) alterado para ${newResponsibleName}.`
  );

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");

  return { success: true };
}

/* ------------------------------------------------------------------ */
/*  Change responsible for ALL future occurrences (update activity)    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Edit ALL occurrences of an activity (update child_activities)       */
/* ------------------------------------------------------------------ */

export async function editActivityAll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  const activityId = formData.get("activityId") as string;
  if (!activityId?.trim()) return { error: "ID da atividade obrigatorio" };

  // Verify activity belongs to user's group
  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, group_id")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  const name = (formData.get("name") as string)?.trim();
  const timeStart = formData.get("timeStart") as string;
  const timeEnd = formData.get("timeEnd") as string;
  const location = (formData.get("location") as string)?.trim();
  const teacherName = (formData.get("teacherName") as string)?.trim();
  const className = (formData.get("className") as string)?.trim();
  const roomName = (formData.get("room") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();
  const responsibleId = (formData.get("responsibleId") as string)?.trim();

  if (name) updates.name = name;
  // Allow clearing time fields with empty string
  if (timeStart !== null && timeStart !== undefined) updates.time_start = timeStart || null;
  if (timeEnd !== null && timeEnd !== undefined) updates.time_end = timeEnd || null;
  if (location !== undefined) updates.location = location || null;
  if (teacherName !== undefined) updates.teacher_name = teacherName || null;
  if (className !== undefined) updates.class_name = className || null;
  if (roomName !== undefined) updates.room = roomName || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (responsibleId !== undefined) updates.responsible_id = responsibleId || null;

  if (Object.keys(updates).length === 0) {
    return { error: "Nenhum campo para atualizar" };
  }

  const { error } = await supabase
    .from("child_activities")
    .update(updates)
    .eq("id", activityId);

  if (error) return { error: error.message };

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");

  return { success: true };
}

/* ------------------------------------------------------------------ */
/*  Edit a SINGLE occurrence (upsert overrides in activity_reports)     */
/* ------------------------------------------------------------------ */

export async function editActivityOccurrence(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  const activityId = formData.get("activityId") as string;
  const occurrenceDate = formData.get("occurrenceDate") as string;
  if (!activityId?.trim() || !occurrenceDate?.trim()) {
    return { error: "Campos obrigatorios faltando" };
  }

  // Verify activity belongs to user's group
  const { data: activity } = await supabase
    .from("child_activities")
    .select("id, group_id")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  // Build overrides object
  const overrides: Record<string, unknown> = {};
  const name = (formData.get("name") as string)?.trim();
  const timeStart = formData.get("timeStart") as string;
  const timeEnd = formData.get("timeEnd") as string;
  const location = (formData.get("location") as string)?.trim();
  const teacherName = (formData.get("teacherName") as string)?.trim();
  const className = (formData.get("className") as string)?.trim();
  const roomName = (formData.get("room") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();
  const responsibleId = (formData.get("responsibleId") as string)?.trim();

  if (name) overrides.name = name;
  if (timeStart !== null && timeStart !== undefined) overrides.time_start = timeStart || null;
  if (timeEnd !== null && timeEnd !== undefined) overrides.time_end = timeEnd || null;
  if (location !== undefined) overrides.location = location || null;
  if (teacherName !== undefined) overrides.teacher_name = teacherName || null;
  if (className !== undefined) overrides.class_name = className || null;
  if (roomName !== undefined) overrides.room = roomName || null;
  if (notes !== undefined) overrides.notes = notes || null;
  if (responsibleId !== undefined) overrides.responsible_id = responsibleId || null;

  // Check if there's already a report for this occurrence
  const { data: existingReport } = await supabase
    .from("activity_reports")
    .select("id, overrides")
    .eq("activity_id", activityId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();

  if (existingReport) {
    // Merge new overrides with existing ones
    const mergedOverrides = {
      ...((existingReport.overrides as Record<string, unknown>) || {}),
      ...overrides,
    };
    const { error } = await supabase
      .from("activity_reports")
      .update({ overrides: mergedOverrides })
      .eq("id", existingReport.id);

    if (error) return { error: error.message };
  } else {
    // Create new report with overrides (status defaults to 'completed' as a placeholder)
    const { error } = await supabase
      .from("activity_reports")
      .insert({
        group_id: activeGroup.groupId,
        activity_id: activityId,
        occurrence_date: occurrenceDate,
        reported_by: user.id,
        status: "completed",
        overrides,
      });

    if (error) return { error: error.message };
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");

  return { success: true };
}

export async function changeActivityResponsibleAll(
  activityId: string,
  newResponsibleId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  // Use admin client for ALL DB operations
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createAdminClient();

  // Verify activity belongs to user's group
  const { data: activity } = await adminDb
    .from("child_activities")
    .select("id, name, group_id, child_id, responsible_id, children(full_name)")
    .eq("id", activityId)
    .single();

  if (!activity || activity.group_id !== activeGroup.groupId) {
    return { error: "Atividade nao encontrada" };
  }

  // Update the activity's responsible_id permanently
  const { error } = await adminDb
    .from("child_activities")
    .update({ responsible_id: newResponsibleId })
    .eq("id", activityId);

  if (error) return { error: error.message };

  // Clear all existing responsible_overrides for this activity
  // (so the new permanent responsible takes effect everywhere)
  await adminDb
    .from("activity_reports")
    .update({ responsible_override: null })
    .eq("activity_id", activityId)
    .not("responsible_override", "is", null);

  // Get the name of the new responsible
  const { data: newResponsibleProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", newResponsibleId)
    .single();

  const newResponsibleName = newResponsibleProfile?.full_name?.split(" ")[0] || "Alguem";
  const childName = (activity.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";

  // Send push notification to the new responsible
  if (newResponsibleId !== user.id) {
    await createNotificationWithPush(
      newResponsibleId,
      "activity",
      `Voce e o responsavel por ${activity.name}`,
      `Voce foi designado permanentemente para ${childName} - ${activity.name}.`,
      "/calendario"
    );
  }

  // Post chat notification
  const { postChatNotification } = await import("@/lib/chat-notify");
  await postChatNotification(
    supabase,
    activeGroup.groupId,
    user.id,
    `Responsavel por ${activity.name} de ${childName} alterado permanentemente para ${newResponsibleName}.`
  );

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/calendario");

  return { success: true };
}

/* ------------------------------------------------------------------ */
/* Delete an event from the events table                               */
/* ------------------------------------------------------------------ */

export async function deleteEvent(eventId: string) {
  if (!eventId?.trim()) {
    return { error: "ID do evento obrigatorio" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  const { data: event } = await supabase
    .from("events")
    .select("id, group_id")
    .eq("id", eventId)
    .single();

  if (!event || event.group_id !== activeGroup.groupId) {
    return { error: "Evento nao encontrado" };
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId);

  if (error) {
    console.error("deleteEvent error:", error);
    return { error: error.message };
  }

  const { revalidatePath: rp } = await import("next/cache");
  rp("/calendario");

  return { success: true };
}

/* ------------------------------------------------------------------ */
/* Delete an appointment from the medical_appointments table           */
/* ------------------------------------------------------------------ */

export async function deleteAppointment(appointmentId: string) {
  if (!appointmentId?.trim()) {
    return { error: "ID da consulta obrigatorio" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) return { error: "Sem grupo" };

  const { data: apt } = await supabase
    .from("medical_appointments")
    .select("id, group_id")
    .eq("id", appointmentId)
    .single();

  if (!apt || apt.group_id !== activeGroup.groupId) {
    return { error: "Consulta nao encontrada" };
  }

  const { error } = await supabase
    .from("medical_appointments")
    .delete()
    .eq("id", appointmentId);

  if (error) {
    console.error("deleteAppointment error:", error);
    return { error: error.message };
  }

  const { revalidatePath: rp } = await import("next/cache");
  rp("/calendario");

  return { success: true };
}
