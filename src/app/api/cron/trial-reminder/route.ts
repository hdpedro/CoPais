import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTrialEndingSoonEmail } from "@/lib/emails/trial";
import { sendPushToUser } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import type { Locale } from "@/i18n";

/**
 * Runs daily at ~14:00 BRT. Sends:
 *   - Email on day 5 ("2 days left")
 *   - Push notification on day 6 ("trial acaba amanhã")
 *
 * We compute the day relative to trial_end so a user created at
 * different hours still gets a single reminder per channel. The query
 * buckets trial_end by the number of days from now (2 for email,
 * 1 for push) with a 24h window.
 *
 * Defensive: we don't dedupe via state on the subscription row (no
 * "last_reminder_sent_at" column), we rely on the 24h windows being
 * non-overlapping. If the cron is paused then restarted, users could
 * in theory get a double reminder — acceptable risk for a 7-day flow.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // "Ends in ~2 days" window: trial_end between now+36h and now+60h
  const emailWindowStart = new Date(now + 36 * 60 * 60 * 1000).toISOString();
  const emailWindowEnd = new Date(now + 60 * 60 * 60 * 1000).toISOString();
  // "Ends in ~1 day" window: trial_end between now+12h and now+36h
  const pushWindowStart = new Date(now + 12 * 60 * 60 * 1000).toISOString();
  const pushWindowEnd = new Date(now + 36 * 60 * 60 * 1000).toISOString();

  try {
    const [emailBatch, pushBatch] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("user_id, trial_end")
        .eq("status", "trialing")
        .eq("payment_provider", "trial")
        .gte("trial_end", emailWindowStart)
        .lt("trial_end", emailWindowEnd),
      supabase
        .from("subscriptions")
        .select("user_id, trial_end")
        .eq("status", "trialing")
        .eq("payment_provider", "trial")
        .gte("trial_end", pushWindowStart)
        .lt("trial_end", pushWindowEnd),
    ]);

    const emailRows = emailBatch.data ?? [];
    const pushRows = pushBatch.data ?? [];

    // Email fan-out — look up profile email/name then send.
    let emailsSent = 0;
    if (emailRows.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", emailRows.map((r) => r.user_id));

      await Promise.allSettled(
        (profiles ?? []).map(async (p) => {
          const row = emailRows.find((r) => r.user_id === p.id);
          const daysRemaining = row?.trial_end
            ? Math.max(1, Math.ceil((new Date(row.trial_end).getTime() - now) / day))
            : 2;
          await sendTrialEndingSoonEmail(p.email, p.full_name, daysRemaining);
          captureServerEvent(p.id, "trial_reminder_email_sent", { days_remaining: daysRemaining });
          emailsSent++;
        })
      );
    }

    // Push fan-out — 1 day left, urgent copy. Each recipient receives the
    // copy in their own locale (profiles.locale). One bulk locale query +
    // dictionary cache keyed by locale to avoid rebuilding closures per user.
    let pushesSent = 0;
    const pushRecipientIds = pushRows.map((r) => r.user_id);
    const localeByUser = await getUsersLocale(pushRecipientIds);
    const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
    async function getT(locale: Locale) {
      const cached = tByLocale.get(locale);
      if (cached) return cached;
      const fn = await getServerT(locale);
      tByLocale.set(locale, fn);
      return fn;
    }
    await Promise.allSettled(
      pushRows.map(async (row) => {
        const locale = localeByUser.get(row.user_id) ?? ("pt" as Locale);
        const t = await getT(locale);
        await sendPushToUser(row.user_id, {
          title: t("push.trialReminder.title"),
          body: t("push.trialReminder.body"),
          // FIX 2026-05-17: era `/configuracoes/assinatura` (404, rota não
          // existe). Rota correta é `/assinatura` (alinhado com renewal-reminder).
          url: "/assinatura",
          tag: "trial-ending",
          notificationType: "trial_reminder",
        });
        captureServerEvent(row.user_id, "trial_reminder_push_sent");
        pushesSent++;
      })
    );

    return NextResponse.json({
      ok: true,
      emailsSent,
      pushesSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] trial-reminder failed:", error);
    reportServerError(error, {
      filePath: "src/app/api/cron/trial-reminder/route.ts",
      severity: "warning",
    });
    return NextResponse.json({ error: "Trial reminder failed" }, { status: 500 });
  }
}
