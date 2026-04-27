import { getResend } from "@/lib/email";
import type { MonthlyChildData } from "@/lib/reports/monthly-child-report";
import { formatMonthlyReportHtml, formatMonthlyReportText } from "@/lib/reports/monthly-report-formatter";

/**
 * Sends the monthly child report email to a parent.
 */
export async function sendMonthlyReport(
  email: string,
  parentName: string,
  children: MonthlyChildData[]
): Promise<void> {
  const resend = getResend();

  const period = children[0]?.period?.label || "";
  const childNames = children.map((c) => c.child.full_name.split(" ")[0]);

  const subject = children.length === 1
    ? `${childNames[0]} — Relatorio de ${period}`
    : `${childNames.join(" e ")} — Relatorio de ${period}`;

  await resend.emails.send({
    from: "Kindar <noreply@kindar.com.br>",
    to: email,
    subject,
    html: formatMonthlyReportHtml(children, parentName),
    text: formatMonthlyReportText(children, parentName),
  });
}
