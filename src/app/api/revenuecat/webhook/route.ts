import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSplitExpenseForPeriod } from "@/lib/billing/split";
import { sendSubscriptionWelcomeEmail } from "@/lib/emails/subscription-welcome";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { getPrimaryGroupId } from "@/lib/billing";

/**
 * RevenueCat webhook — receives server-side events for iOS and Android
 * in-app purchases. This is the canonical source of truth for native
 * subscriptions; the client-side flow in `iap.ts` calls `/api/iap/verify`
 * immediately after a purchase (optimistic update), and this webhook
 * reconciles any divergence.
 *
 * Events we care about:
 *   INITIAL_PURCHASE    — first-time buy, create sub
 *   RENEWAL             — new period, extend period_end + create split expense
 *   CANCELLATION        — user canceled auto-renew (still active until period_end)
 *   EXPIRATION          — subscription ended (no more access)
 *   BILLING_ISSUE       — Apple/Google couldn't charge — mark past_due
 *   PRODUCT_CHANGE      — user upgraded/downgraded plan
 *   UNCANCELLATION      — user restored auto-renew
 *
 * Docs: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 *
 * Security: RevenueCat signs requests with a shared secret passed in the
 * Authorization header as `Bearer <secret>`. Configure in RevenueCat
 * Dashboard > Integrations > Webhooks. Set REVENUECAT_WEBHOOK_SECRET env.
 */

interface RevenueCatEvent {
  type: string;
  id: string;
  app_user_id: string; // = Supabase user.id (set by iap.ts identifyUser)
  original_app_user_id: string;
  product_id: string;
  period_type: "NORMAL" | "TRIAL" | "INTRO" | "PROMOTIONAL";
  purchased_at_ms: number;
  expiration_at_ms: number | null;
  store: "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";
  environment: "SANDBOX" | "PRODUCTION";
  entitlement_ids?: string[];
  cancel_reason?: string;
  transaction_id?: string;
  original_transaction_id?: string;
}

export async function POST(req: NextRequest) {
  // 1. Verify shared secret. RC's webhook UI lets you paste any string
  // as the Authorization header value — so the operator may have pasted
  // the raw secret without a "Bearer " prefix. Accept both forms so we
  // don't 401 over a UX detail.
  const authHeader = req.headers.get("authorization") || "";
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const valid =
    authHeader === expected || // raw token (what RC sends if you paste hex only)
    authHeader === `Bearer ${expected}`; // standard Bearer form
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const event: RevenueCatEvent | undefined = body.event;
  if (!event) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  // Sandbox isolation — Vercel injects VERCEL_ENV = 'production' | 'preview' | 'development'.
  // Apple/Google sandbox transactions get a separate RevenueCat environment tag,
  // but RC delivers BOTH to whichever webhook URL is configured. Without this gate
  // a single sandbox purchase in production sandbox testing creates a real, paid-
  // looking subscription row (the UNIQUE index `idx_subscriptions_active_user_provider`
  // would even overwrite the user's legitimate sub on the same provider).
  //
  // Policy:
  //   - production deploy + SANDBOX event → ignore (return 200 so RC stops retrying)
  //   - preview/dev + any event → accept (sandbox testing happens here)
  //   - production deploy + PRODUCTION event → accept (the only real path)
  if (event.environment === "SANDBOX" && process.env.VERCEL_ENV === "production") {
    console.log(
      `[revenuecat/webhook] Ignoring SANDBOX event ${event.id} (${event.type}) in production deploy`,
    );
    return NextResponse.json({ ok: true, ignored: true, reason: "sandbox_in_production" });
  }

  const admin = createAdminClient();

  // Idempotency guard — RC retries with the same event.id on failure.
  // STRICT: a non-23505 DB error must return 500 so RC retries rather than
  // letting partial side effects (subscription INSERT, welcome email)
  // execute without idempotency cover. See stripe/webhook for full rationale.
  const dedup = await admin
    .from("webhook_events")
    .insert({ provider: "revenuecat", event_id: event.id, event_type: event.type })
    .select("id")
    .single();
  if (dedup.error) {
    if (dedup.error.code === "23505") {
      console.log(`[revenuecat/webhook] Duplicate event ${event.id} (${event.type}) — skipping`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[revenuecat/webhook] Dedup insert failed:", dedup.error);
    reportServerError(dedup.error, {
      filePath: "src/app/api/revenuecat/webhook/route.ts",
      severity: "critical",
    });
    return NextResponse.json({ error: "Idempotency check failed" }, { status: 500 });
  }

  try {
    // 2. Resolve provider + plan from product_id
    const providerTag = event.store === "PLAY_STORE" ? "google" : "apple";
    const methodHint = event.store === "PLAY_STORE" ? "google_iap" : "apple_iap";

    const { data: plan } = await admin
      .from("plans")
      .select("id, interval")
      .eq("apple_product_id", event.product_id)
      .maybeSingle();

    if (!plan) {
      console.warn(`[revenuecat/webhook] Unknown product_id: ${event.product_id}`);
      // Return 200 anyway — we don't want RevenueCat to retry an event
      // we can never resolve. Log for manual investigation.
      return NextResponse.json({ ok: true, ignored: true, reason: "unknown_product" });
    }

    // 3. Resolve user's primary group via the canonical resolver so we
    // respect `profiles.last_active_group_id` for multi-group users (same
    // as /api/billing/status). Previously this used `joined_at ASC` inline,
    // which would route an IAP purchase to the wrong group when the user
    // belongs to more than one (separated parent re-partnered, consultant
    // in N families). Mismatch with billing/status caused UI/DB drift.
    const coparentingGroupId = await getPrimaryGroupId(admin, event.app_user_id);

    // 4. Route by event type
    const now = new Date();
    const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const periodStart = new Date(event.purchased_at_ms);

    switch (event.type) {
      case "INITIAL_PURCHASE":
      case "UNCANCELLATION": {
        // Expire the 7-day trial sub if active.
        await admin
          .from("subscriptions")
          .update({ status: "expired", updated_at: now.toISOString() })
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", "trial")
          .in("status", ["active", "trialing"]);

        // Upsert by (user_id, payment_provider). Include 'pending' so we
        // pick up the optimistic row written by /api/iap/verify and flip it
        // to active here — that's the security model: pending rows do NOT
        // grant access until this trusted webhook confirms the purchase.
        const { data: existing } = await admin
          .from("subscriptions")
          .select("id")
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["pending", "active", "trialing", "past_due", "canceled"])
          .maybeSingle();

        // Shared fields between INSERT and UPDATE.
        const baseSubPayload = {
          plan_id: plan.id,
          status: "active" as const,
          apple_original_transaction_id:
            providerTag === "apple" ? event.original_transaction_id || null : null,
          google_purchase_token:
            providerTag === "google" ? event.original_transaction_id || null : null,
          payment_method_hint: methodHint,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd?.toISOString() ?? now.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        };

        if (existing) {
          // UPDATE — do NOT overwrite `coparenting_group_id` or `is_sandbox`.
          // Both are set on INSERT and reflect the original purchase context.
          // Overwriting `coparenting_group_id` could silently move a sub to
          // another group if the user joined a new group between purchase
          // and renewal. Overwriting `is_sandbox` is even worse: an
          // UNCANCELLATION SANDBOX event delivered to a preview deploy
          // could flip a real production sub to is_sandbox=true.
          await admin.from("subscriptions").update(baseSubPayload).eq("id", existing.id);
        } else {
          await admin.from("subscriptions").insert({
            ...baseSubPayload,
            user_id: event.app_user_id,
            payment_provider: providerTag,
            // INSERT path only — see comment above for why we don't set these
            // on UPDATE.
            coparenting_group_id: coparentingGroupId,
            is_sandbox: event.environment === "SANDBOX",
          });
        }

        // Telemetria — INITIAL_PURCHASE conta como checkout_completed +
        // subscription_started; UNCANCELLATION é só resume (não cria sub
        // nova) então fica como evento próprio pra retention dashboards.
        const isInitial = event.type === "INITIAL_PURCHASE";
        // RevenueCat envia `price_in_purchased_currency` (em unidades, e.g.
        // 19.90) e `currency` (ex: 'BRL'). Pra paridade com Stripe events
        // (que enviam em centavos), convertemos pra cents. `null` se RC não
        // mandou (sandbox às vezes não inclui).
        const rcPrice = (event as unknown as { price_in_purchased_currency?: number })
          .price_in_purchased_currency;
        const amountCents =
          typeof rcPrice === "number" ? Math.round(rcPrice * 100) : null;
        const currency =
          (event as unknown as { currency?: string }).currency ?? null;

        if (isInitial) {
          captureServerEvent(event.app_user_id, "checkout_completed", {
            provider: providerTag === "google" ? "google_iap" : "apple_iap",
            plan_id: plan.id,
            is_trial: event.period_type === "TRIAL" || event.period_type === "INTRO",
            store: event.store,
            environment: event.environment,
            amount_brl_cents: amountCents,
            currency,
          });
          captureServerEvent(event.app_user_id, "subscription_started", {
            provider: providerTag === "google" ? "google_iap" : "apple_iap",
            plan_id: plan.id,
            is_trial: event.period_type === "TRIAL" || event.period_type === "INTRO",
            payment_method: methodHint,
            store: event.store,
            environment: event.environment,
            transaction_id: event.original_transaction_id,
            amount_brl_cents: amountCents,
            currency,
          });
        } else {
          captureServerEvent(event.app_user_id, "subscription_uncancelled", {
            provider: providerTag === "google" ? "google_iap" : "apple_iap",
            plan_id: plan.id,
            store: event.store,
          });
        }

        // Welcome email on first purchase only. UNCANCELLATION doesn't
        // qualify — that's someone resuming auto-renew after canceling.
        // Detached: see comment in stripe/webhook for why we don't await.
        if (event.type === "INITIAL_PURCHASE") {
          void (async () => {
            const { data: profile } = await admin
              .from("profiles")
              .select("email, full_name")
              .eq("id", event.app_user_id)
              .maybeSingle();
            if (profile?.email) {
              try {
                await sendSubscriptionWelcomeEmail(profile.email, profile.full_name, plan.id);
              } catch (err) {
                console.warn("[revenuecat/webhook] welcome email failed (non-fatal):", err);
              }
            }
          })();
        }
        break;
      }

      case "RENEWAL": {
        // Extend period + create split expense if auto_split is on.
        const { data: dbSub } = await admin
          .from("subscriptions")
          .select("id, coparenting_group_id, user_id, plan_id, auto_split, auto_split_co_user_id, auto_split_co_share")
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["active", "past_due"])
          .maybeSingle();

        if (dbSub) {
          await admin
            .from("subscriptions")
            .update({
              plan_id: plan.id,
              status: "active",
              current_period_start: periodStart.toISOString(),
              current_period_end: periodEnd?.toISOString() ?? now.toISOString(),
              cancel_at_period_end: false,
              updated_at: now.toISOString(),
            })
            .eq("id", dbSub.id);

          // Auto-split on renewal (mirrors Stripe webhook logic)
          if (
            dbSub.auto_split &&
            dbSub.auto_split_co_user_id &&
            dbSub.auto_split_co_share &&
            dbSub.coparenting_group_id
          ) {
            await createSplitExpenseForPeriod(admin, {
              subscriptionId: dbSub.id,
              groupId: dbSub.coparenting_group_id,
              payerUserId: dbSub.user_id,
              coUserId: dbSub.auto_split_co_user_id,
              coSharePercent: dbSub.auto_split_co_share,
              planId: plan.id,
              periodStart: periodStart.toISOString().slice(0, 10),
            });
          }

          captureServerEvent(event.app_user_id, "subscription_renewed", {
            provider: providerTag === "google" ? "google_iap" : "apple_iap",
            plan_id: plan.id,
            subscription_id: dbSub.id,
            period_start: periodStart.toISOString(),
            split_active: !!dbSub.auto_split,
            store: event.store,
          });
        }
        break;
      }

      case "CANCELLATION": {
        // User canceled auto-renew — subscription still active until expiration.
        await admin
          .from("subscriptions")
          .update({
            cancel_at_period_end: true,
            updated_at: now.toISOString(),
          })
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["active", "past_due"]);

        // `cancel_reason` da Apple/Google distingue "user requested" vs
        // "billing issue" vs "developer cancellation" — útil pra entender
        // se churn é decisão ou problema técnico.
        captureServerEvent(event.app_user_id, "subscription_cancel_scheduled", {
          provider: providerTag === "google" ? "google_iap" : "apple_iap",
          plan_id: plan.id,
          cancel_reason: event.cancel_reason ?? null,
          store: event.store,
        });
        break;
      }

      case "EXPIRATION": {
        // Subscription ended. Capture lifetime BEFORE the UPDATE so we can
        // attribute properly (post-UPDATE the row reflects cancellation).
        const { data: dbSubForExpiry } = await admin
          .from("subscriptions")
          .select("id, current_period_start")
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["active", "past_due"])
          .maybeSingle();

        await admin
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: now.toISOString(),
          })
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["active", "past_due"]);

        const lifetimeDays = dbSubForExpiry?.current_period_start
          ? Math.floor(
              (Date.now() - new Date(dbSubForExpiry.current_period_start).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

        captureServerEvent(event.app_user_id, "subscription_canceled", {
          provider: providerTag === "google" ? "google_iap" : "apple_iap",
          plan_id: plan.id,
          cancel_reason: event.cancel_reason ?? "expired",
          store: event.store,
          subscription_id: dbSubForExpiry?.id ?? null,
          lifetime_days: lifetimeDays,
        });
        break;
      }

      case "BILLING_ISSUE": {
        await admin
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: now.toISOString(),
          })
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .eq("status", "active");

        captureServerEvent(event.app_user_id, "payment_failed", {
          provider: providerTag === "google" ? "google_iap" : "apple_iap",
          plan_id: plan.id,
          store: event.store,
        });
        break;
      }

      case "PRODUCT_CHANGE": {
        // User upgraded/downgraded — new plan takes effect on next period.
        // We update the plan_id now; period_end follows existing renewal cycle.
        await admin
          .from("subscriptions")
          .update({
            plan_id: plan.id,
            updated_at: now.toISOString(),
          })
          .eq("user_id", event.app_user_id)
          .eq("payment_provider", providerTag)
          .in("status", ["active", "past_due"]);

        captureServerEvent(event.app_user_id, "subscription_plan_changed", {
          provider: providerTag === "google" ? "google_iap" : "apple_iap",
          new_plan_id: plan.id,
          store: event.store,
        });
        break;
      }

      default:
        // Other events (TRANSFER, SUBSCRIBER_ALIAS, etc) don't affect
        // our subscriptions table directly. Log and move on.
        console.log(`[revenuecat/webhook] Ignoring event type: ${event.type}`);
    }

    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "revenuecat")
      .eq("event_id", event.id);
    console.log(`[revenuecat/webhook] OK: ${event.type} for user ${event.app_user_id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[revenuecat/webhook] Error handling ${event.type}:`, err);
    reportServerError(err, {
      filePath: "src/app/api/revenuecat/webhook/route.ts",
      severity: "critical",
    });
    // KEEP the dedup row — same rationale as stripe/webhook. RC retries
    // use the same event.id, so on retry the 23505 path short-circuits
    // cleanly. Deleting here would let a partial-state retry duplicate
    // side effects (subscription INSERT, welcome email, split expense).
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("webhook_events")
      .update({ error: message.slice(0, 500) })
      .eq("provider", "revenuecat")
      .eq("event_id", event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
