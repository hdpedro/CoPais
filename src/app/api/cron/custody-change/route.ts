import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { buildCustodyMap, formatDateKey, type ParentColorMap, type CustodyEvent } from "@/lib/calendar-utils";

/**
 * GET /api/cron/custody-change
 * Called daily by Vercel Cron (e.g., at 20:00 BRT) to notify parents
 * when tomorrow is a custody change day (responsible parent switches).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Use Brazil timezone for date calculations
    const now = new Date();
    const brazilStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const brazilNow = new Date(brazilStr);

    const today = new Date(brazilNow);
    const tomorrow = new Date(brazilNow);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayKey = formatDateKey(today);
    const tomorrowKey = formatDateKey(tomorrow);

    // Get all groups
    const { data: groups } = await supabase
      .from("groups")
      .select("id");

    if (!groups || groups.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "no groups" });
    }

    let totalSent = 0;

    for (const group of groups) {
      // Get group members with profiles
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id, profiles(full_name)")
        .eq("group_id", group.id)
        .order("joined_at", { ascending: true });

      if (!members || members.length === 0) continue;

      // Build parent color map (colors don't matter for notifications, but needed for buildCustodyMap)
      const parentColors: ParentColorMap = {};
      for (const m of members) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        parentColors[m.user_id] = {
          name: (p as { full_name: string } | null)?.full_name || "Usuario",
          color: "#000",
        };
      }

      // Get custody events covering today and tomorrow
      const { data: events } = await supabase
        .from("custody_events")
        .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
        .eq("group_id", group.id)
        .lte("start_date", tomorrowKey)
        .gte("end_date", todayKey);

      if (!events || events.length === 0) continue;

      const custodyEvents = events as CustodyEvent[];
      const custodyMap = buildCustodyMap(custodyEvents, parentColors);

      const todayInfo = custodyMap.get(todayKey);
      const tomorrowInfo = custodyMap.get(tomorrowKey);

      // Check if there's a custody change (different responsible parent)
      if (!todayInfo || !tomorrowInfo) continue;
      if (todayInfo.userId === tomorrowInfo.userId) continue;

      // There IS a change — find child names from events covering tomorrow
      const childNames = new Set<string>();
      for (const evt of custodyEvents) {
        const start = evt.start_date;
        const end = evt.end_date;
        if (tomorrowKey >= start && tomorrowKey <= end) {
          const childName = (evt.children as { full_name: string } | null)?.full_name;
          if (childName) {
            childNames.add(childName.split(" ")[0]);
          }
        }
      }

      const childLabel = childNames.size > 0
        ? Array.from(childNames).join(", ")
        : "a crianca";

      const tomorrowParentName = tomorrowInfo.userName.split(" ")[0];
      const message = `Amanha e dia de troca de guarda. ${childLabel} estara com ${tomorrowParentName}.`;

      // Send push to all group members
      await Promise.allSettled(
        members.map((member) =>
          sendPushToUser(member.user_id, {
            title: "Troca de Guarda",
            body: message,
            url: "/calendario",
            tag: "custody_change",
          })
        )
      );

      totalSent += members.length;
    }

    return NextResponse.json({
      ok: true,
      sent: totalSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Custody change notification failed:", error);
    return NextResponse.json(
      { error: "Failed to send custody change notifications" },
      { status: 500 }
    );
  }
}
