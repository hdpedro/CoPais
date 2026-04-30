import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Prunes the webhook_events idempotency log to keep it bounded.
 *
 * Stripe retries failed webhooks for up to 3 days. RevenueCat retries
 * for up to 7 days with exponential backoff. We keep 90 days as a
 * safety margin and prune anything older.
 *
 * Runs daily at 04:30 UTC.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from("webhook_events")
      .delete({ count: "exact" })
      .lt("received_at", cutoff);

    if (error) throw error;

    return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff });
  } catch (error) {
    console.error("[CRON] webhook-events-prune failed:", error);
    reportServerError(error, {
      filePath: "src/app/api/cron/webhook-events-prune/route.ts",
      severity: "warning",
    });
    return NextResponse.json({ error: "Prune failed" }, { status: 500 });
  }
}
