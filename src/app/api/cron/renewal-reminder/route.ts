import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRenewalReminderEmail } from "@/lib/emails/renewal-reminder";
import { sendPushToUser } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import type { Locale } from "@/i18n";

/**
 * Runs daily at ~12:00 UTC / 09:00 BRT. Sends a renewal heads-up to
 * users whose subscription renews in ~3 days.
 *
 * We skip:
 *   - payment_provider='trial' — those are app-level trials, no money
 *   - cancel_at_period_end=true — user already canceled, no need to warn
 *   - apple/google IAP — the stores already send their own notice
 *     (reduces email fatigue; customers who opted for IAP expect the
 *     Apple/Google flow as the source of truth)
 *
 * So in practice this cron sends reminders only for Stripe-managed subs
 * (card and PIX), which is where renewal surprise is highest.
 *
 * Window: period_end between 60h and 84h from now (~2.5 to 3.5 days).
 * A 24h window prevents sending twice if the cron runs at slightly
 * different times across days.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const windowStart = new Date(now + 60 * hour).toISOString();
  const windowEnd = new Date(now + 84 * hour).toISOString();

  try {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan_id, current_period_end")
      .eq("status", "active")
      .eq("payment_provider", "stripe")
      .eq("cancel_at_period_end", false)
      .gte("current_period_end", windowStart)
      .lt("current_period_end", windowEnd);

    if (error) throw error;

    const toRemind = subs ?? [];
    if (toRemind.length === 0) {
      return NextResponse.json({ ok: true, reminded: 0, timestamp: new Date().toISOString() });
    }

    // Look up profiles in one query, then fan out emails + pushes.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in(
        "id",
        toRemind.map((s) => s.user_id)
      );

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    let emailsSent = 0;
    let pushesSent = 0;

    // Resolve each recipient's locale once. Email body still uses the legacy
    // template (locale handled inside sendRenewalReminderEmail), but the push
    // title/body need per-recipient translation.
    const recipientIds = toRemind.map((s) => s.user_id);
    const localeByUser = await getUsersLocale(recipientIds);
    const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
    async function getT(locale: Locale) {
      const cached = tByLocale.get(locale);
      if (cached) return cached;
      const fn = await getServerT(locale);
      tByLocale.set(locale, fn);
      return fn;
    }

    await Promise.allSettled(
      toRemind.map(async (sub) => {
        const profile = profileMap.get(sub.user_id);
        if (!profile?.email) return;

        const locale = localeByUser.get(sub.user_id) ?? ("pt" as Locale);
        const t = await getT(locale);

        await Promise.allSettled([
          sendRenewalReminderEmail(profile.email, profile.full_name, sub.plan_id, sub.current_period_end).then(
            () => {
              emailsSent++;
            }
          ),
          sendPushToUser(sub.user_id, {
            title: t("push.renewalReminder.title", { days: 3 }),
            body: t("push.renewalReminder.body"),
            url: "/assinatura",
            tag: "renewal-reminder",
            notificationType: "renewal_reminder",
          }).then(() => {
            pushesSent++;
          }),
        ]);

        captureServerEvent(sub.user_id, "renewal_reminder_sent", {
          plan_id: sub.plan_id,
          days_until_renewal: 3,
        });
      })
    );

    return NextResponse.json({
      ok: true,
      reminded: toRemind.length,
      emailsSent,
      pushesSent,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRON] renewal-reminder failed:", err);
    reportServerError(err, {
      filePath: "src/app/api/cron/renewal-reminder/route.ts",
      severity: "warning",
    });
    return NextResponse.json({ error: "Renewal reminder failed" }, { status: 500 });
  }
}
