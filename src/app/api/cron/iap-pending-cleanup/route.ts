import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Cleans up orphaned `pending` IAP subscription rows.
 *
 * Background: when the native client purchases an IAP it calls
 * /api/iap/verify which writes a `pending` subscription row. The row
 * is upgraded to `active` when /api/revenuecat/webhook fires the
 * INITIAL_PURCHASE event (typically <5s later).
 *
 * If the webhook never arrives — RC misconfigured, network failure,
 * App Store sandbox quirks — the `pending` row stays forever, blocking
 * the user from re-trying (the verify endpoint sees an existing row
 * and re-uses it). The user reads "pendingReconciliation: true" on
 * every poll and wonders why their purchase never activates.
 *
 * This cron deletes pending rows older than 1 hour. RC's webhook
 * SLA is well under 5 minutes; 1 hour is generous. After deletion
 * the user can retry the purchase or restore (which will re-trigger
 * verify and create a fresh row).
 *
 * Runs hourly. Schedule wired in vercel.json.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago

  try {
    // Find pending IAP rows older than the cutoff.
    const { data: stale, error: selectErr } = await supabase
      .from("subscriptions")
      .select("id, user_id, payment_provider, plan_id, created_at")
      .eq("status", "pending")
      .in("payment_provider", ["apple", "google"])
      .lt("created_at", cutoff);

    if (selectErr) throw selectErr;
    const staleList = stale ?? [];

    if (staleList.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const { error: deleteErr } = await supabase
      .from("subscriptions")
      .delete()
      .in("id", staleList.map((r) => r.id));

    if (deleteErr) throw deleteErr;

    // Log so we notice if this fires often (= webhook config broken).
    console.warn(
      `[CRON] iap-pending-cleanup deleted ${staleList.length} orphaned pending rows. ` +
        `If >0 daily, check RevenueCat webhook delivery in dashboard.`
    );

    return NextResponse.json({
      ok: true,
      deleted: staleList.length,
      cutoff,
      sample: staleList.slice(0, 5).map((r) => ({
        userId: r.user_id,
        provider: r.payment_provider,
        planId: r.plan_id,
        ageMinutes: Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000),
      })),
    });
  } catch (error) {
    console.error("[CRON] iap-pending-cleanup failed:", error);
    reportServerError(error, {
      filePath: "src/app/api/cron/iap-pending-cleanup/route.ts",
      severity: "warning",
    });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
