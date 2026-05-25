import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSplitExpenseForPeriod } from "@/lib/billing/split";
import { sendSubscriptionWelcomeEmail } from "@/lib/emails/subscription-welcome";
import { sendTrialEndingSoonEmail } from "@/lib/emails/trial";
import { sendPaymentFailedEmail } from "@/lib/emails/payment-failed";
import { claimReferralReward } from "@/lib/referral-claim";
import { captureServerEvent } from "@/lib/posthog-server";
import { mapStripeStatus } from "@/lib/billing/stripe-status";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency guard — Stripe retries failed deliveries up to 3 days.
  // INSERT-then-process pattern: if we've already seen this event_id we
  // short-circuit with 200 so Stripe stops retrying.
  //
  // STRICT policy (changed 2026-05-25 after audit):
  //   - 23505 unique violation → duplicate, 200 idempotent success
  //   - Any other DB error → 500 so Stripe retries. We refuse to process
  //     side effects with broken idempotency, because if processing succeeds
  //     here without the dedup row, the retry will execute everything twice
  //     (e.g. claim referral coupon twice, send welcome email twice).
  const dedup = await supabase
    .from("webhook_events")
    .insert({ provider: "stripe", event_id: event.id, event_type: event.type })
    .select("id")
    .single();
  if (dedup.error) {
    if (dedup.error.code === "23505") {
      console.log(`[stripe/webhook] Duplicate event ${event.id} (${event.type}) — skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe/webhook] Dedup insert failed:", dedup.error);
    reportServerError(dedup.error, {
      filePath: "src/app/api/stripe/webhook/route.ts",
      severity: "critical",
    });
    return NextResponse.json({ error: "Idempotency check failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.supabase_user_id;
        const planId = session.metadata?.plan_id;
        if (!userId || !planId) break;

        const subscriptionId = session.subscription as string;
        const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
        const sub = subResponse as unknown as Stripe.Subscription;
        const periodStart = (sub as unknown as { current_period_start: number }).current_period_start;
        const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

        // Resolve the user's primary group. CRITICAL: without this the new
        // sub row has coparenting_group_id=NULL and v_group_active_subscription
        // (which filters by group_id) won't find it — the user pays but
        // the app shows them on Free. Discovered 2026-04-30 audit.
        const { data: primaryGroup } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const groupId = session.metadata?.group_id || primaryGroup?.group_id || null;

        // Expire only existing Stripe-provider subs for this user. CRITICAL:
        // scope by payment_provider="stripe" so an active Apple IAP sub is
        // NOT overwritten when the user starts/renews a subscription on web.
        // /api/iap/verify already filters symmetrically by payment_provider="apple".
        await supabase
          .from("subscriptions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("payment_provider", "stripe")
          .in("status", ["active", "trialing", "past_due"]);

        // Also expire the in-app trial (payment_provider='trial') if still
        // active — symmetric with /api/iap/verify so both flows behave the
        // same way when the user upgrades from the 7-day trial.
        await supabase
          .from("subscriptions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("payment_provider", "trial")
          .in("status", ["active", "trialing"]);

        // Insert the new subscription. payment_method_hint comes from
        // our checkout metadata so we can display "you're on PIX — saving R$5"
        // on the assinatura page without another Stripe round-trip.
        const paymentMethodHint = session.metadata?.payment_method_hint || "card";
        const couponCode = session.metadata?.coupon_code || null;
        // Stripe distinguishes test/live by SECRET KEY (sk_test_* vs sk_live_*),
        // so any event reaching us with `livemode=false` is a test-mode session.
        // Tag the resulting row so it never grants production access.
        const isSandbox = (event as unknown as { livemode?: boolean }).livemode === false;
        // Map Stripe statuses correctly. "incomplete" / "past_due" must NOT
        // grant access — the previous logic ("active" ? "active" : "trialing")
        // gave full access to users mid-3DS-confirmation or with declined cards.
        await supabase.from("subscriptions").insert({
          user_id: userId,
          coparenting_group_id: groupId,
          plan_id: planId,
          status: mapStripeStatus(sub.status),
          payment_provider: "stripe",
          payment_method_hint: paymentMethodHint,
          coupon_code: couponCode,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          is_sandbox: isSandbox,
        });

        // Increment redemption counter on the internal coupons row.
        // Best-effort — if it fails, Stripe still has the true count via
        // promotion_codes.times_redeemed and we can reconcile later.
        if (couponCode) {
          const { data: existing } = await supabase
            .from("coupons")
            .select("id, current_redemptions")
            .eq("code", couponCode)
            .maybeSingle();
          if (existing) {
            await supabase
              .from("coupons")
              .update({ current_redemptions: (existing.current_redemptions ?? 0) + 1 })
              .eq("id", existing.id);
          }
        }

        // Welcome email — fire and forget. Stripe gives us only ~10s
        // before it considers the webhook timed out and retries; an
        // email round-trip can easily exceed that during provider
        // hiccups. We detach it from the response path so a slow SMTP
        // never causes a duplicate webhook delivery.
        void (async () => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", userId)
            .maybeSingle();
          if (profile?.email) {
            try {
              await sendSubscriptionWelcomeEmail(profile.email, profile.full_name, planId);
            } catch (err) {
              console.warn("[stripe/webhook] welcome email failed (non-fatal):", err);
            }
          }
        })();

        // Referral reward — if this user was referred and this is their
        // first paid sub, credit 1 month free to both parties.
        //
        // Detached IIFE: claim involves Stripe API calls (coupon.create ×2 +
        // subscription.update on referrer) which can take >1s. Stripe expects
        // the webhook to respond within 30s; bundling claim into the sync
        // path eats into that budget and, more importantly, a slow claim
        // failure here would cascade into a webhook retry that duplicates
        // upstream side effects (welcome email, subscription INSERT).
        //
        // Idempotency is guaranteed by `referral_rewards.referred_subscription_id`
        // UNIQUE constraint — concurrent claims race-lose cleanly.
        void (async () => {
          try {
            const { data: newSub } = await supabase
              .from("subscriptions")
              .select("id")
              .eq("stripe_subscription_id", subscriptionId)
              .maybeSingle();
            if (newSub) {
              const reward = await claimReferralReward(supabase, userId, newSub.id);
              if (reward.claimed) {
                console.log(`[stripe/webhook] Referral reward claimed for user ${userId}`);
              }
            }
          } catch (err) {
            console.warn(`[stripe/webhook] referral claim failed (non-fatal):`, err);
          }
        })();

        // Telemetria do funil pago. PRECISA estar aqui (e não no client) — o
        // success_url redireciona pro `/pricing/success` antes do webhook ter
        // gravado a row, então qualquer evento client-side dispara num
        // momento em que `subscriptions` ainda nem existe pra esse user.
        //
        // NOTA sobre `amount_brl_cents`: Stripe `unit_amount` é em CENTAVOS
        // (1990 = R$ 19,90). Mantemos a unidade explícita no nome do property
        // pra evitar queries PostHog do tipo `SUM(amount) / count` retornarem
        // valor 100× maior do que esperado.
        const mappedStatus = mapStripeStatus(sub.status);
        const lineItem = sub.items.data[0];
        const amountBrl = lineItem?.price?.unit_amount ?? null;
        captureServerEvent(userId, "checkout_completed", {
          provider: "stripe",
          plan_id: planId,
          payment_method: paymentMethodHint,
          coupon_code: couponCode,
          is_trial: !!sub.trial_end,
          amount_brl_cents: amountBrl,
          group_id: groupId,
        });
        captureServerEvent(userId, "subscription_started", {
          provider: "stripe",
          plan_id: planId,
          status: mappedStatus,
          is_trial: !!sub.trial_end,
          payment_method: paymentMethodHint,
          coupon_code: couponCode,
          amount_brl_cents: amountBrl,
          stripe_subscription_id: subscriptionId,
        });

        console.log(`[stripe/webhook] Subscription created for user ${userId}, plan ${planId}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const periodStart = (sub as unknown as { current_period_start: number }).current_period_start;
        const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

        // Read the existing row so we can detect what actually changed and
        // emit the right telemetry. Stripe doesn't tell us "plan changed"
        // explicitly — we have to diff payload vs DB.
        const { data: priorSub } = await supabase
          .from("subscriptions")
          .select("plan_id, cancel_at_period_end, status")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        // Build update payload conditionally — never fall back to a hardcoded
        // plan_id ("harmonia_monthly") because doing so silently downgrades
        // legitimate Premium Jurídico users when an upstream metadata bug
        // strips the field. Only update plan_id if Stripe gives us one.
        type SubUpdate = {
          status: string;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          updated_at: string;
          plan_id?: string;
        };
        const newStatus = mapStripeStatus(sub.status);
        const updatePayload: SubUpdate = {
          status: newStatus,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        };
        if (sub.metadata?.plan_id) {
          updatePayload.plan_id = sub.metadata.plan_id;
        }

        await supabase
          .from("subscriptions")
          .update(updatePayload)
          .eq("stripe_subscription_id", sub.id);

        // Diff-based telemetry — Stripe's customer.subscription.updated
        // fires for many reasons (plan change, cancel scheduled, cancel
        // undone, payment method updated, …). We dispatch distinct PostHog
        // events so retention/MRR dashboards can break down by reason.
        if (priorSub) {
          // Plan change (upgrade or downgrade)
          if (sub.metadata?.plan_id && sub.metadata.plan_id !== priorSub.plan_id) {
            captureServerEvent(userId, "subscription_plan_changed", {
              provider: "stripe",
              old_plan_id: priorSub.plan_id,
              new_plan_id: sub.metadata.plan_id,
              stripe_subscription_id: sub.id,
            });
          }
          // Cancel scheduled (user clicked "cancel at end of period")
          if (!priorSub.cancel_at_period_end && sub.cancel_at_period_end) {
            captureServerEvent(userId, "subscription_cancel_scheduled", {
              provider: "stripe",
              plan_id: updatePayload.plan_id ?? priorSub.plan_id,
              stripe_subscription_id: sub.id,
              effective_at: new Date(periodEnd * 1000).toISOString(),
            });
          }
          // Cancel undone (user changed their mind before period end)
          if (priorSub.cancel_at_period_end && !sub.cancel_at_period_end) {
            captureServerEvent(userId, "subscription_uncancelled", {
              provider: "stripe",
              plan_id: updatePayload.plan_id ?? priorSub.plan_id,
              stripe_subscription_id: sub.id,
            });
          }
        }

        console.log(`[stripe/webhook] Subscription updated for user ${userId}: ${sub.status}`);
        break;
      }

      case "invoice.payment_succeeded": {
        // Only act on renewals (billing_reason='subscription_cycle').
        // The first payment goes through checkout.session.completed which
        // also fires this event with billing_reason='subscription_create' —
        // we skip that to avoid double-counting (welcome email, sub INSERT,
        // first split expense are all handled by checkout.session.completed).
        const invoice = event.data.object as Stripe.Invoice;
        const billingReason = (invoice as unknown as { billing_reason: string }).billing_reason;
        if (billingReason !== "subscription_cycle") break;

        const subscriptionId = (invoice as unknown as { subscription: string | null }).subscription;
        if (!subscriptionId) break;

        // Look up the sub once and use it for BOTH telemetry and (optional)
        // split expense creation. Previously the renewal event ONLY fired
        // when auto_split was on, because the split early-return was above
        // the captureServerEvent — so we lost ~70% of renewal data in
        // PostHog (most users don't have split). Fix: always capture, only
        // split if applicable.
        const { data: dbSub } = await supabase
          .from("subscriptions")
          .select("id, coparenting_group_id, user_id, plan_id, auto_split, auto_split_co_user_id, auto_split_co_share")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (!dbSub) break;

        const periodStartUnix = (invoice as unknown as { period_start: number }).period_start;
        const periodStart = new Date(periodStartUnix * 1000).toISOString().slice(0, 10);
        const invoiceAmountCents = (invoice as unknown as { amount_paid?: number }).amount_paid ?? null;

        // Telemetria de renovação — distinto de checkout_completed (que é só
        // a primeira). Permite calcular retention/MRR no PostHog sem precisar
        // joinar a tabela de subscriptions. SEMPRE dispara, mesmo sem split.
        captureServerEvent(dbSub.user_id, "subscription_renewed", {
          provider: "stripe",
          plan_id: dbSub.plan_id,
          subscription_id: dbSub.id,
          period_start: periodStart,
          split_active: !!dbSub.auto_split,
          amount_brl_cents: invoiceAmountCents,
        });

        // Auto-split expense — only when configured. Idempotency in
        // createSplitExpenseForPeriod protects against double-fire if Stripe
        // retries this invoice event.
        if (
          dbSub.auto_split &&
          dbSub.auto_split_co_user_id &&
          dbSub.auto_split_co_share &&
          dbSub.coparenting_group_id
        ) {
          const result = await createSplitExpenseForPeriod(supabase, {
            subscriptionId: dbSub.id,
            groupId: dbSub.coparenting_group_id,
            payerUserId: dbSub.user_id,
            coUserId: dbSub.auto_split_co_user_id,
            coSharePercent: dbSub.auto_split_co_share,
            planId: dbSub.plan_id,
            periodStart,
          });
          console.log(
            `[stripe/webhook] Renewal split for sub ${dbSub.id}: ${
              result.created ? "created" : "existed"
            } expense ${result.expenseId ?? ""}`
          );
        } else {
          console.log(`[stripe/webhook] Renewal for sub ${dbSub.id} (no split configured)`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        // Resolve user antes do UPDATE — depois da mudança de status, o
        // captureServerEvent ainda consegue carimbar o distinctId certo.
        const { data: dbSub } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id, current_period_start")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();

        await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (dbSub) {
          const lifetimeDays = dbSub.current_period_start
            ? Math.floor(
                (Date.now() - new Date(dbSub.current_period_start).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : null;
          captureServerEvent(dbSub.user_id, "subscription_canceled", {
            provider: "stripe",
            plan_id: dbSub.plan_id,
            stripe_subscription_id: sub.id,
            lifetime_days: lifetimeDays,
            cancel_reason: (sub as unknown as { cancellation_details?: { reason?: string } })
              .cancellation_details?.reason ?? null,
          });
        }

        console.log(`[stripe/webhook] Subscription canceled: ${sub.id}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as unknown as { subscription: string | null }).subscription;
        if (!subscriptionId) break;

        await supabase
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        // Email the user so they can update payment before Stripe gives up.
        // Detached + best-effort.
        const nextRetry = (invoice as unknown as { next_payment_attempt: number | null })
          .next_payment_attempt;
        void (async () => {
          const { data: dbSub } = await supabase
            .from("subscriptions")
            .select("user_id, plan_id")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();
          if (!dbSub) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", dbSub.user_id)
            .maybeSingle();
          if (!profile?.email) return;
          const planName = dbSub.plan_id?.startsWith("premium_juridico")
            ? "Premium Jurídico"
            : "Harmonia";
          const retryIso = nextRetry ? new Date(nextRetry * 1000).toISOString() : null;
          try {
            await sendPaymentFailedEmail(profile.email, profile.full_name, planName, retryIso);
          } catch (err) {
            console.warn("[stripe/webhook] payment-failed email failed (non-fatal):", err);
          }
        })();

        // Telemetria de falha de cobrança — útil pra correlacionar com
        // recovery email/push e medir taxa de recuperação pós-fail.
        const { data: dbSubForFail } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (dbSubForFail) {
          captureServerEvent(dbSubForFail.user_id, "payment_failed", {
            provider: "stripe",
            plan_id: dbSubForFail.plan_id,
            stripe_subscription_id: subscriptionId,
            next_retry_at: nextRetry ? new Date(nextRetry * 1000).toISOString() : null,
          });
        }

        console.log(`[stripe/webhook] Payment failed for subscription ${subscriptionId}`);
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Fired by Stripe ~3 days before the 14-day Stripe trial ends.
        // Email the user so they're not surprised by the first charge.
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000)
          : null;
        const daysRemaining = trialEnd
          ? Math.max(1, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 3;

        // Detached — same reasoning as the welcome email above.
        void (async () => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", userId)
            .maybeSingle();
          if (profile?.email) {
            try {
              await sendTrialEndingSoonEmail(profile.email, profile.full_name ?? undefined, daysRemaining);
            } catch (err) {
              console.warn("[stripe/webhook] trial-ending email failed (non-fatal):", err);
            }
          }
        })();

        // Telemetria — permite correlacionar "trial ending email enviado D-3"
        // com "user converteu/abandonou" pra otimizar timing de reminders.
        captureServerEvent(userId, "trial_ending_soon", {
          provider: "stripe",
          plan_id: sub.metadata?.plan_id ?? null,
          days_remaining: daysRemaining,
          trial_end_at: trialEnd?.toISOString() ?? null,
          stripe_subscription_id: sub.id,
        });

        console.log(`[stripe/webhook] Trial ending soon for user ${userId} (${daysRemaining}d)`);
        break;
      }
    }
    // Mark event as successfully processed for visibility / debugging.
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("event_id", event.id);
  } catch (error) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, error);
    reportServerError(error, { filePath: "src/app/api/stripe/webhook/route.ts", severity: "critical" });
    // Persist error for forensics + KEEP the dedup row. Previous logic
    // deleted it so Stripe could retry — but if processing partially
    // succeeded (e.g. subscription row already inserted), the retry would
    // duplicate side effects on top of that. Instead, we trust Stripe's
    // built-in retry semantics: a failed delivery (500 response) is retried
    // with the SAME event_id, so the dedup hit will short-circuit cleanly
    // and the operator can manually replay if needed.
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("webhook_events")
      .update({ error: message.slice(0, 500) })
      .eq("provider", "stripe")
      .eq("event_id", event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
