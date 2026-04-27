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
    // Select first so we can email the users after. Returning rows
    // from the update would be cleaner but .returns() after update in
    // Supabase JS is awkward across versions — two queries is fine.
    const { data: expired, error: selectError } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("status", "trialing")
      .eq("payment_provider", "trial")
      .lt("trial_end", nowIso);

    if (selectError) throw selectError;
    const expiredList = expired ?? [];

    if (expiredList.length === 0) {
      return NextResponse.json({ ok: true, expired: 0, timestamp: nowIso });
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ status: "expired", updated_at: nowIso })
      .in(
        "id",
        expiredList.map((r) => r.id)
      );

    if (updateError) throw updateError;

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
