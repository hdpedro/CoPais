import { NextRequest, NextResponse } from "next/server";
import { runDailyVaccineDueNotify } from "@/lib/services/vaccine-notifier";

/**
 * Cron diário (Vercel schedule). Dispara push de reforço pra cada criança
 * com pendência REAL (overdue/due_soon) nos dias-gatilho (30/7/1/0).
 *
 * Roda também o "take card" reminder pra appointments 24h ahead.
 *
 * NUNCA dispara pra historical_gap ou out_of_window. Respeita dismissals.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyVaccineDueNotify();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] vaccine-due-notify failed:", error);
    return NextResponse.json(
      { error: "Failed to send vaccine due notifications" },
      { status: 500 },
    );
  }
}
