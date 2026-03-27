import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toICalDate(dateStr: string, timeStr?: string | null): string {
  const d = dateStr.replace(/-/g, "");
  if (timeStr) {
    const t = timeStr.replace(/:/g, "").slice(0, 4) + "00";
    return `${d}T${t}`;
  }
  return d;
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up token
  const { data: tokenData } = await supabase
    .from("calendar_tokens")
    .select("user_id, group_id")
    .eq("token", token)
    .single();

  if (!tokenData) {
    return new Response("Token invalido", { status: 404 });
  }

  const groupId = tokenData.group_id;

  // Date range: 1 month back to 3 months ahead
  const now = new Date();
  const back = new Date(now); back.setMonth(back.getMonth() - 1);
  const fwd = new Date(now); fwd.setMonth(fwd.getMonth() + 3);
  const dateFrom = formatDateKey(back);
  const dateTo = formatDateKey(fwd);

  // Single batch — ALL queries in parallel, minimal columns
  const [custodyRes, eventsRes, activitiesRes, childrenRes, membersRes, groupRes] = await Promise.all([
    supabase.from("custody_events").select("id, child_id, responsible_user_id, start_date").eq("group_id", groupId).gte("start_date", dateFrom).lte("start_date", dateTo).limit(200),
    supabase.from("events").select("id, title, event_date, end_date, event_time, all_day, location").eq("group_id", groupId).eq("status", "active").gte("event_date", dateFrom).limit(50),
    supabase.from("child_activities").select("id, name, child_id, recurrence_type, start_date, end_date, days_of_week, time_start, time_end, location").eq("group_id", groupId).eq("is_active", true).limit(30),
    supabase.from("children").select("id, full_name").eq("group_id", groupId),
    supabase.from("group_members").select("user_id").eq("group_id", groupId),
    supabase.from("coparenting_groups").select("name").eq("id", groupId).single(),
  ]);

  // Profiles — single extra query
  const memberIds = (membersRes.data || []).map(m => m.user_id);
  const profilesRes = memberIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] as { id: string; full_name: string }[] };

  // Lookup maps
  const childMap = new Map<string, string>();
  (childrenRes.data || []).forEach(c => childMap.set(c.id, c.full_name));
  const profileMap = new Map<string, string>();
  (profilesRes.data || []).forEach(p => profileMap.set(p.id, p.full_name));

  // Build iCal inline (no external lib dependency)
  const calName = `Kindar - ${groupRes.data?.name || "Calendario"}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Kindar//Calendar//PT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcal(calName)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    // VTIMEZONE definition for Brazil
    "BEGIN:VTIMEZONE",
    "TZID:America/Sao_Paulo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:BRT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  // Custody events
  for (const e of custodyRes.data || []) {
    const child = childMap.get(e.child_id) || "Crianca";
    const parent = profileMap.get(e.responsible_user_id) || "Responsavel";
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:custody-${e.id}@kindar.app`);
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(e.start_date)}`);
    lines.push(`SUMMARY:${escapeIcal(`🏠 ${child} com ${parent}`)}`);
    lines.push(`CATEGORIES:GUARDA`);
    lines.push("END:VEVENT");
  }

  // Social events
  for (const e of eventsRes.data || []) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:event-${e.id}@kindar.app`);
    if (e.all_day || !e.event_time) {
      lines.push(`DTSTART;VALUE=DATE:${toICalDate(e.event_date)}`);
      if (e.end_date && e.end_date !== e.event_date) {
        lines.push(`DTEND;VALUE=DATE:${toICalDate(e.end_date)}`);
      }
    } else {
      lines.push(`DTSTART;TZID=America/Sao_Paulo:${toICalDate(e.event_date, e.event_time)}`);
    }
    lines.push(`SUMMARY:${escapeIcal(`📅 ${e.title}`)}`);
    if (e.location) lines.push(`LOCATION:${escapeIcal(e.location)}`);
    lines.push("END:VEVENT");
  }

  // Activities — generate occurrences inline (simple weekly only for speed)
  for (const act of activitiesRes.data || []) {
    const childName = childMap.get(act.child_id) || "Todos";
    const daysOfWeek: number[] = act.days_of_week || [1];

    // Generate dates for the range
    const cursor = new Date(now);
    const end = new Date(fwd);
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (daysOfWeek.includes(dow === 0 ? 7 : dow)) {
        const dk = formatDateKey(cursor);
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:act-${act.id}-${dk}@kindar.app`);
        if (act.time_start) {
          lines.push(`DTSTART;TZID=America/Sao_Paulo:${toICalDate(dk, act.time_start)}`);
          if (act.time_end) lines.push(`DTEND;TZID=America/Sao_Paulo:${toICalDate(dk, act.time_end)}`);
        } else {
          lines.push(`DTSTART;VALUE=DATE:${toICalDate(dk)}`);
        }
        lines.push(`SUMMARY:${escapeIcal(`⏰ ${act.name} — ${childName}`)}`);
        if (act.location) lines.push(`LOCATION:${escapeIcal(act.location)}`);
        lines.push("END:VEVENT");
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  lines.push("END:VCALENDAR");
  const ical = lines.join("\r\n");

  return new Response(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
