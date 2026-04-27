import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCronWithReport } from "@/lib/cron/cron-executor";
import { generateDailyReport } from "@/lib/cron/report-aggregator";
import { sendCronReportEmail } from "@/lib/emails/send-cron-report";
import type { CronResult, CronReport } from "@/lib/cron/types";

/**
 * Aggregates all cron logs from today (BRT), generates a daily report, and sends it via email.
 */
async function executeDailyReport(): Promise<CronResult> {
  const supabase = createAdminClient();

  // Calculate BRT day boundaries in UTC (Brazil is fixed UTC-3, no DST since 2019)
  const now = new Date();
  const brazilStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const brazilNow = new Date(brazilStr);
  const startOfDayBRT = new Date(brazilNow.getFullYear(), brazilNow.getMonth(), brazilNow.getDate());
  // Convert BRT midnight to UTC by adding 3 hours
  const startUTC = new Date(startOfDayBRT.getTime() + 3 * 60 * 60 * 1000);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);

  // Fetch today's cron logs (exclude this cron's own log, which hasn't been saved yet)
  const { data: logs, error } = await supabase
    .from("cron_logs")
    .select("*")
    .gte("started_at", startUTC.toISOString())
    .lt("started_at", endUTC.toISOString())
    .neq("name", "daily-report")
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch cron logs: ${error.message}`);
  }

  const reports: CronReport[] = (logs ?? []).map((log) => ({
    name: log.name,
    startedAt: new Date(log.started_at),
    finishedAt: new Date(log.finished_at),
    durationMs: log.duration_ms,
    success: log.success,
    processed: log.processed,
    sent: log.sent,
    errors: log.errors ?? [],
  }));

  const dailyReport = generateDailyReport(reports);

  await sendCronReportEmail(dailyReport);

  return {
    success: true,
    processed: dailyReport.totalCrons,
    sent: 1, // 1 email sent
    metadata: {
      date: dailyReport.date,
      totalCrons: dailyReport.totalCrons,
      successCount: dailyReport.successCount,
      failureCount: dailyReport.failureCount,
      totalSent: dailyReport.totalSent,
    },
  };
}

// Called by Vercel Cron every day at 01:00 UTC (22:00 BRT)
// Runs after all other crons have completed for the day
export async function GET(request: NextRequest) {
  return runCronWithReport({
    name: "daily-report",
    request,
    execute: executeDailyReport,
  });
}
