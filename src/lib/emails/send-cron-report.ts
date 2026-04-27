import { getResend } from "@/lib/email";
import type { DailyReport } from "@/lib/cron/types";
import { formatReportHtml, formatReportText } from "@/lib/cron/report-formatter";

/**
 * Sends the daily cron report via email using Resend.
 * Requires CRON_REPORT_EMAIL env var to be set.
 */
export async function sendCronReportEmail(report: DailyReport): Promise<void> {
  const recipient = process.env.CRON_REPORT_EMAIL;
  if (!recipient) {
    console.warn("[cron-report] CRON_REPORT_EMAIL not set, skipping email");
    return;
  }

  const resend = getResend();
  const statusTag = report.failureCount > 0 ? "!" : "OK";

  await resend.emails.send({
    from: "Kindar <noreply@kindar.com.br>",
    to: recipient,
    subject: `[Crons ${statusTag}] ${report.date} — ${report.successCount}/${report.totalCrons} OK, ${report.totalSent} enviados`,
    html: formatReportHtml(report),
    text: formatReportText(report),
  });
}
