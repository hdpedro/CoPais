"use server";

import { createNotificationWithPush } from "@/lib/push";
import { getBrazilToday } from "@/lib/calendar-utils";
import { birthdayInYear, computeAgeOnDate } from "@/lib/birthday-utils";

const REMINDER_DAYS_AHEAD = 7;

/**
 * Send 7-day-ahead birthday reminders for every child whose next birthday
 * (resolved with the 29/02 → 28/02 fallback) lands exactly on today + 7 days
 * in Brazil time. Notifies every member of the child's group.
 *
 * Called daily by the Vercel cron `/api/cron/birthday-reminders`.
 */
export async function sendBirthdayReminders() {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = getBrazilToday();
  const [ty, tm, td] = today.split("-").map(Number);
  const targetDate = new Date(ty, tm - 1, td);
  targetDate.setDate(targetDate.getDate() + REMINDER_DAYS_AHEAD);
  const targetKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  const targetYear = targetDate.getFullYear();

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date, group_id");

  if (!children || children.length === 0) return { sent: 0 };

  const matches = children.filter((c) => c.birth_date && birthdayInYear(c.birth_date, targetYear) === targetKey);

  if (matches.length === 0) return { sent: 0 };

  const groupIds = [...new Set(matches.map((c) => c.group_id))];
  const { data: allMembers } = await supabase
    .from("group_members")
    .select("user_id, group_id")
    .in("group_id", groupIds);

  const membersByGroup: Record<string, string[]> = {};
  for (const m of allMembers || []) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m.user_id);
  }

  let sentCount = 0;

  for (const child of matches) {
    const firstName = (child.full_name || "").split(" ")[0] || "criança";
    const age = computeAgeOnDate(child.birth_date, targetKey);
    const [, mm, dd] = targetKey.split("-");
    const dateBr = `${dd}/${mm}`;

    const title = `🎂 Aniversário de ${firstName} em 7 dias`;
    const body = `${firstName} faz ${age} ${age === 1 ? "ano" : "anos"} em ${dateBr}. Hora de planejar!`;
    const link = `/calendario?day=${targetKey}`;

    const members = membersByGroup[child.group_id] || [];

    await Promise.all(
      members.map((userId) =>
        createNotificationWithPush(userId, "birthday_reminder", title, body, link).catch(() => {
          /* notification failure is non-critical */
        })
      )
    );
    sentCount += members.length;
  }

  return { sent: sentCount };
}
