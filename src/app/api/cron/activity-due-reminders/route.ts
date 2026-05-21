import { NextRequest, NextResponse } from "next/server";
import { runActivityDueReminders } from "@/lib/services/activity-reminders";

/**
 * Cron a cada 15min (Vercel schedule). Dispara push de lembrete pré-evento
 * pra cada atividade cuja janela (event_at - reminder_lead_minutes) cai no
 * slot atual ±8min/+7min. Recipient é o responsible_id da atividade (ou
 * todos members do grupo como degradação segura quando NULL).
 *
 * Idempotência via activity_reminder_sends — re-rodar no mesmo slot insere
 * 0 rows novos.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runActivityDueReminders();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] activity-due-reminders failed:", error);
    return NextResponse.json(
      { error: "Failed to send activity due reminders" },
      { status: 500 },
    );
  }
}
