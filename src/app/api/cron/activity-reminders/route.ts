import { NextRequest, NextResponse } from "next/server";
import { sendActivityReminders, sendMissedReportReminders } from "@/actions/activities";

// This endpoint should be called by Vercel Cron or external scheduler
// every day at ~20:00 (BRT) to send reminders for tomorrow's activities
// and follow-up reminders for yesterday's unreported activities
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Send tomorrow's activity reminders and yesterday's unreported activity reminders in parallel
    const [tomorrowResult, reportResult] = await Promise.all([
      sendActivityReminders(),
      sendMissedReportReminders(),
    ]);

    return NextResponse.json({
      ok: true,
      tomorrowReminders: tomorrowResult.sent,
      reportReminders: reportResult.sent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Activity reminders failed:", error);
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 }
    );
  }
}
