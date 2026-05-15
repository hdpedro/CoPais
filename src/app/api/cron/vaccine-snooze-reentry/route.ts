import { NextRequest, NextResponse } from "next/server";
import { runDailyVaccineSnoozeReentry } from "@/lib/services/vaccine-notifier";

/**
 * Cron diário (Vercel schedule). Limpa dismissals 'already_scheduled'
 * expirados (>30d) e dispara push suave de reentrada quando não houver
 * vaccination_record matching nesse intervalo.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyVaccineSnoozeReentry();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] vaccine-snooze-reentry failed:", error);
    return NextResponse.json(
      { error: "Failed to process vaccine snooze reentry" },
      { status: 500 },
    );
  }
}
