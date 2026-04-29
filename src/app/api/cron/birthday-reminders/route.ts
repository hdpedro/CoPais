import { NextRequest, NextResponse } from "next/server";
import { sendBirthdayReminders } from "@/actions/birthdays";

// Called by Vercel Cron every day at 11:00 UTC (~08:00 BRT).
// Sends a 7-day-ahead reminder to every group member for each child
// whose birthday lands on today + 7.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendBirthdayReminders();
    return NextResponse.json({
      ok: true,
      sent: result.sent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Birthday reminders failed:", error);
    return NextResponse.json(
      { error: "Failed to send birthday reminders" },
      { status: 500 }
    );
  }
}
