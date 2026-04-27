import type { CronReport, DailyReport } from "./types";

/**
 * Aggregates individual cron reports into a daily summary.
 * Uses BRT date for the report date field.
 */
export function generateDailyReport(reports: CronReport[]): DailyReport {
  const now = new Date();
  const brazilStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

  return {
    date: brazilStr,
    totalCrons: reports.length,
    successCount: reports.filter((r) => r.success).length,
    failureCount: reports.filter((r) => !r.success).length,
    totalProcessed: reports.reduce((sum, r) => sum + r.processed, 0),
    totalSent: reports.reduce((sum, r) => sum + r.sent, 0),
    totalErrors: reports.reduce((sum, r) => sum + r.errors.length, 0),
    details: reports,
  };
}
