import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCronWithReport } from "@/lib/cron/cron-executor";
import { collectMonthlyData } from "@/lib/reports/monthly-child-report";
import { sendMonthlyReport } from "@/lib/emails/send-monthly-report";
import type { CronResult } from "@/lib/cron/types";

/**
 * Generates and sends monthly child reports to all parents.
 * Runs on the 1st of each month, reporting on the previous month.
 */
async function executeMonthlyReport(): Promise<CronResult> {
  const supabase = createAdminClient();

  // Calculate previous month
  const now = new Date();
  const brazilStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const brazilNow = new Date(brazilStr);
  const currentMonth = brazilNow.getMonth() + 1; // 1-indexed
  const currentYear = brazilNow.getFullYear();
  const reportMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const reportYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // Get all active groups
  const { data: groups } = await supabase
    .from("coparenting_groups")
    .select("id");

  if (!groups || groups.length === 0) {
    return { success: true, processed: 0, sent: 0, metadata: { reason: "no groups" } };
  }

  let totalSent = 0;
  let totalProcessed = 0;
  const errors: string[] = [];

  for (const group of groups) {
    try {
      // Get children for this group
      const { data: children } = await supabase
        .from("children")
        .select("id, full_name, birth_date, sex, photo_url")
        .eq("group_id", group.id);

      if (!children || children.length === 0) continue;

      // Collect data for each child in parallel
      const childReports = await Promise.all(
        children.map((child) =>
          collectMonthlyData(child.id, group.id, reportYear, reportMonth, {
            full_name: child.full_name,
            birth_date: child.birth_date,
            sex: child.sex,
            photo_url: child.photo_url,
          })
        )
      );

      // Skip if no child has data
      const childrenWithData = childReports.filter((r) => r.hasData);
      if (childrenWithData.length === 0) continue;

      totalProcessed += childrenWithData.length;

      // Get group members with email
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id, profiles(full_name, email)")
        .eq("group_id", group.id);

      if (!members) continue;

      // Send email to each member
      for (const member of members) {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const email = (profile as { email: string; full_name: string } | null)?.email;
        const name = (profile as { email: string; full_name: string } | null)?.full_name || "Responsavel";

        if (!email) continue;

        try {
          await sendMonthlyReport(email, name, childrenWithData);
          totalSent++;
        } catch (err) {
          errors.push(`email ${email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`group ${group.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: errors.length === 0,
    processed: totalProcessed,
    sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
    metadata: {
      reportMonth,
      reportYear,
      groupsProcessed: groups.length,
    },
  };
}

// Called by Vercel Cron on the 1st of each month at 12:00 UTC (09:00 BRT)
export async function GET(request: NextRequest) {
  return runCronWithReport({
    name: "monthly-report",
    request,
    execute: executeMonthlyReport,
  });
}
