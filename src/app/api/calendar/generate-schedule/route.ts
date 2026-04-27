/**
 * POST /api/calendar/generate-schedule
 *
 * Native-callable wrapper around `generateSchedule` from
 * `src/actions/calendar.ts`. CRITICAL: this preserves historical
 * `custody_events` (only deletes events with `start_date >= today`)
 * and rolls back on insert failure — protecting against the data-loss
 * P0 caused by the previous native direct-mutate path.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

interface RequestBody {
  groupId?: string;
  childId?: string;
  pattern?: (string | null)[];
  startDate?: string;
  months?: number;
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const { groupId, childId, pattern, startDate: startDateStr, months } = body;

  if (!groupId || !childId || !pattern || !startDateStr || !months) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (!Array.isArray(pattern) || pattern.length !== 14 || pattern.every((p) => p === null)) {
    return NextResponse.json({ error: "Padrão de escala inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Admin-only gate
  const { data: membership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sem permissão para este grupo." }, { status: 403 });
  }
  if (membership.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem gerar escalas." },
      { status: 403 },
    );
  }

  // Generation algorithm — identical to src/actions/calendar.ts:436-538
  const startDate = new Date(startDateStr + "T12:00:00");
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const startDayOfWeek = startDate.getDay();
  const refMonday = new Date(startDate);
  const daysToMonday = startDayOfWeek === 0 ? -6 : -(startDayOfWeek - 1);
  refMonday.setDate(refMonday.getDate() + daysToMonday);

  const events: Array<Record<string, unknown>> = [];
  const current = new Date(startDate);
  let rangeStart: Date | null = null;
  let rangeUserId: string | null = null;

  while (current < endDate) {
    const dayOfWeek = current.getDay();
    const daysSinceRef = Math.round((current.getTime() - refMonday.getTime()) / 86400000);
    const weekInCycle = Math.floor(daysSinceRef / 7) % 2;
    const patternIdx = weekInCycle * 7 + dayOfWeek;
    const userId = pattern[patternIdx];

    if (userId !== null) {
      if (rangeUserId !== userId) {
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
        rangeStart = new Date(current);
        rangeUserId = userId;
      }
    } else {
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
    return NextResponse.json(
      { error: "Nenhum evento gerado. Verifique o padrão." },
      { status: 400 },
    );
  }

  // History guard: never touch events with start_date < today.
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: existingEvents } = await admin
    .from("custody_events")
    .select("*")
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .eq("custody_type", "regular")
    .gte("start_date", todayStr);

  const { error: deleteError } = await admin
    .from("custody_events")
    .delete()
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .eq("custody_type", "regular")
    .gte("start_date", todayStr);

  if (deleteError) {
    return NextResponse.json(
      { error: "Erro ao limpar escala anterior: " + deleteError.message },
      { status: 500 },
    );
  }

  try {
    for (let i = 0; i < events.length; i += 100) {
      const batch = events.slice(i, i + 100);
      const { error } = await admin.from("custody_events").insert(batch);
      if (error) {
        if (existingEvents && existingEvents.length > 0) {
          const restoreData = existingEvents.map((row) => {
            const copy = { ...row } as Record<string, unknown>;
            delete copy.id;
            return copy;
          });
          await admin.from("custody_events").insert(restoreData);
        }
        return NextResponse.json(
          { error: "Erro ao inserir nova escala: " + error.message },
          { status: 500 },
        );
      }
    }
  } catch (e) {
    if (existingEvents && existingEvents.length > 0) {
      const restoreData = existingEvents.map((row) => {
        const copy = { ...row } as Record<string, unknown>;
        delete copy.id;
        return copy;
      });
      await admin.from("custody_events").insert(restoreData);
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado ao gerar escala.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Persist the schedule configuration (upsert).
  await admin
    .from("custody_schedules")
    .upsert(
      {
        group_id: groupId,
        child_id: childId,
        pattern,
        start_date: startDateStr,
        months,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,child_id" },
    );

  captureServerEvent(user.id, "schedule_generated");
  revalidateTag(`calendar-${groupId}`, "max");
  return NextResponse.json({ success: true, events: events.length });
}
