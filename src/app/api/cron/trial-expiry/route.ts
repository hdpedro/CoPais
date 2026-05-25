import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTrialExpiredEmail } from "@/lib/emails/trial";
import { captureServerEvent } from "@/lib/posthog-server";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Runs daily. Marks trial subscriptions whose trial_end is in the past
 * as expired, then emails the payer so they know their group dropped
 * to Grátis. The app's billing status endpoint reads from the same
 * subscriptions table so the PWA / iOS / Android all see the change
 * on the next /api/billing/status call.
 *
 * We only touch rows with payment_provider='trial' so a past-due real
 * subscription (stripe/apple) is left alone — those have their own
 * lifecycle handled by webhooks.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  try {
    // Atomic UPDATE...RETURNING — Supabase JS exposes this via `.select()`
    // chained after `.update()`. One query instead of SELECT-then-UPDATE
    // avoids a race where a webhook flips the same row from `trialing` to
    // `active` between our SELECT and UPDATE (which previously would have
    // overwritten the legitimate Stripe/IAP activation with `expired`).
    //
    // The filter is identical to the old SELECT: only `payment_provider='trial'`
    // rows are touched, so an Apple/Stripe `trialing` sub is never disturbed.
    const { data: expired, error: updateError } = await supabase
      .from("subscriptions")
      .update({ status: "expired", updated_at: nowIso })
      .eq("status", "trialing")
      .eq("payment_provider", "trial")
      .lt("trial_end", nowIso)
      .select("id, user_id");

    if (updateError) throw updateError;
    const expiredList = expired ?? [];

    if (expiredList.length === 0) {
      return NextResponse.json({ ok: true, expired: 0, timestamp: nowIso });
    }

    // Fan out emails + analytics in parallel. Email failures are swallowed
    // by sendTrialExpiredEmail — we never want one flaky email to stall
    // the whole batch.
    const userIds = expiredList.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    await Promise.allSettled(
      (profiles ?? []).map(async (p) => {
        await sendTrialExpiredEmail(p.email, p.full_name);
        captureServerEvent(p.id, "trial_expired");
      })
    );

    return NextResponse.json({
      ok: true,
      expired: expiredList.length,
      timestamp: nowIso,
    });
  } catch (error) {
    console.error("[CRON] trial-expiry failed:", error);
    reportServerError(error, {
      filePath: "src/app/api/cron/trial-expiry/route.ts",
      severity: "warning",
    });
    return NextResponse.json({ error: "Trial expiry failed" }, { status: 500 });
  }
}
