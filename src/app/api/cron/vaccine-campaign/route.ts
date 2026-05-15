import { NextRequest, NextResponse } from "next/server";
import { runMonthlyCampaignReminder } from "@/lib/services/vaccine-notifier";

/**
 * Cron MENSAL — dispara push pra campanhas de vacina anual (Influenza, COVID-19)
 * para cada criança ≥9 anos ainda sem registro no ano vigente.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMonthlyCampaignReminder();
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[CRON] vaccine-campaign failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
