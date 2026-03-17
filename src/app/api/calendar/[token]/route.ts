import { createClient } from "@supabase/supabase-js";
import { generateICalFeed } from "@/lib/ical";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Use service role to validate token (no user session available)
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

  // Fetch custody events for the group
  const { data: events } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", tokenData.group_id)
    .order("start_date");

  if (!events) {
    return new Response("Erro ao buscar eventos", { status: 500 });
  }

  // Get group name
  const { data: group } = await supabase
    .from("coparenting_groups")
    .select("name")
    .eq("id", tokenData.group_id)
    .single();

  // Convert to iCal format
  const icalEvents = events.map((e) => ({
    uid: `${e.id}@2lares.app`,
    startDate: e.start_date,
    endDate: e.end_date,
    startTime: e.start_time as string | null,
    endTime: e.end_time as string | null,
    summary: `${(e.children as any)?.full_name || "Crianca"} com ${(e.profiles as any)?.full_name || "Responsavel"}`,
    description: e.notes || undefined,
  }));

  const calName = `2Lares - ${group?.name || "Guarda"}`;
  const ical = generateICalFeed(icalEvents, calName);

  return new Response(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="2lares-guarda.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
