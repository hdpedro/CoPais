import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimaryGroupId } from "@/lib/billing";

/**
 * IAP verification endpoint — security model:
 *
 * The native client calls this immediately after a successful purchase
 * (optimistic update). However, this endpoint cannot trust the client's
 * claim — a malicious authenticated user could forge `productId` and
 * `originalTransactionId`. We therefore:
 *
 *   1. Write the subscription row with status='pending' (no premium yet).
 *   2. Wait for the RevenueCat webhook (signed with REVENUECAT_WEBHOOK_SECRET)
 *      to flip status to 'active'. RevenueCat performs Apple's StoreKit JWS
 *      verification server-side, so its webhooks are the source of truth.
 *   3. `getGroupSubscription.isActive` only returns true for status in
 *      ('active','trialing'), so 'pending' rows do NOT grant access.
 *
 * For restores (`isRestore=true`), we never write — the user either has
 * an existing active row (already covered) or they don't (RevenueCat will
 * fire its own restore-triggered events). This avoids creating phantom
 * pending rows on every app launch.
 *
 * For legitimate purchases, the typical RevenueCat webhook latency is
 * &lt; 5 seconds — users perceive the transition as instant. If the webhook
 * is delayed (rare), the native app retries `/api/billing/status` until
 * isActive=true.
 *
 * Future hardening: receive `jwsTransaction` from StoreKit 2 and verify
 * the signature against Apple Root CA before flipping to 'active'
 * directly. See `src/lib/iap-jws.ts` (planned).
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate: aceita Bearer (native via fetch) ou cookie (web).
    // O native envia Bearer porque Next middleware nao valida tokens em
    // /api/* e o cookie nao existe fora do webview com ssr configurado.
    const authHeader = req.headers.get("authorization");
    let user: { id: string } | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const adminForAuth = createAdminClient();
      const { data, error } = await adminForAuth.auth.getUser(token);
      if (!error && data.user) user = { id: data.user.id };
    } else {
      const supabase = await createClient();
      const { data: { user: webUser } } = await supabase.auth.getUser();
      if (webUser) user = { id: webUser.id };
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, originalTransactionId, isRestore } = body;
    // jwsTransaction reserved for future Apple Root CA chain verification.
    // const { jwsTransaction } = body;

    if (!productId) {
      return NextResponse.json(
        { error: "Missing productId" },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS for writes
    const admin = createAdminClient();

    const platform: string = body.platform || "apple";
    const providerTag = platform === "google" ? "google" : "apple";
    const methodHint = platform === "google" ? "google_iap" : "apple_iap";

    // Restore: never write. Look up existing entitlement and report it.
    // RevenueCat fires its own webhook events (NON_RENEWING_PURCHASE,
    // PRODUCT_CHANGE, etc.) when a restore reveals a subscription, so the
    // backend learns about it through the trusted path, not from us.
    if (isRestore) {
      const { data: existing } = await admin
        .from("subscriptions")
        .select("plan_id, current_period_end, status")
        .eq("user_id", user.id)
        .eq("payment_provider", providerTag)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle();

      return NextResponse.json({
        success: !!existing,
        plan: existing?.plan_id ?? null,
        expiresAt: existing?.current_period_end ?? null,
        restored: true,
        status: existing?.status ?? "none",
      });
    }

    const { data: plan } = await admin
      .from("plans")
      .select("id, interval, max_subscribers")
      .eq("apple_product_id", productId)
      .maybeSingle();

    if (!plan) {
      return NextResponse.json(
        { error: `Unknown product: ${productId}` },
        { status: 400 }
      );
    }

    // Resolve the user's primary group — subscriptions are per-group as
    // of migration 00054. Users without a group shouldn't reach checkout
    // but fail-soft so we don't crash on edge cases.
    const supabaseRead = await createClient();
    const groupId = await getPrimaryGroupId(supabaseRead, user.id);

    // Calculate subscription period
    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === "year") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Expire existing trial sub (if any) — user is upgrading from
    // the 7-day Premium Jurídico degustação. Keep IAP subs from a
    // different provider untouched to preserve cross-platform state.
    await admin
      .from("subscriptions")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("user_id", user.id)
      .eq("payment_provider", "trial")
      .in("status", ["active", "trialing"]);

    // Check for existing subscription for this user on the same provider.
    // Include 'pending' so a re-verify (idempotency) doesn't create a
    // duplicate row for the same purchase.
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("payment_provider", providerTag)
      .in("status", ["active", "trialing", "past_due", "pending"])
      .maybeSingle();

    // Decide the target status:
    //   - If user already has an active/trialing sub on this provider, keep
    //     it active (this is a renewal/plan-change path, RevenueCat will
    //     also fire RENEWAL or PRODUCT_CHANGE).
    //   - Otherwise, write 'pending'. RevenueCat webhook flips to 'active'
    //     after verifying the Apple/Google signature server-side.
    const isExistingActive =
      existingSub?.status === "active" || existingSub?.status === "trialing";
    const targetStatus = isExistingActive ? "active" : "pending";

    if (existingSub) {
      await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          status: targetStatus,
          apple_original_transaction_id:
            providerTag === "apple" ? originalTransactionId || null : null,
          google_purchase_token:
            providerTag === "google" ? originalTransactionId || null : null,
          payment_method_hint: methodHint,
          coparenting_group_id: groupId ?? undefined,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      const { error: insertErr } = await admin.from("subscriptions").insert({
        user_id: user.id,
        coparenting_group_id: groupId,
        plan_id: plan.id,
        status: targetStatus, // 'pending' — flipped by /api/revenuecat/webhook
        payment_provider: providerTag,
        payment_method_hint: methodHint,
        apple_original_transaction_id:
          providerTag === "apple" ? originalTransactionId || null : null,
        google_purchase_token:
          providerTag === "google" ? originalTransactionId || null : null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      });

      if (insertErr) {
        // Early Bird sold out, duplicate, or any other trigger/constraint
        if (insertErr.message?.includes("sold out") || insertErr.code === "check_violation") {
          return NextResponse.json(
            { error: "Early Bird esgotou — escolha o plano Harmonia (R$ 24,90/mês)." },
            { status: 409 }
          );
        }
        throw insertErr;
      }
    }

    return NextResponse.json({
      success: true,
      plan: plan.id,
      expiresAt: periodEnd.toISOString(),
      restored: false,
      status: targetStatus,
      pendingReconciliation: targetStatus === "pending",
    });
  } catch (error) {
    console.error("[IAP] Verify error:", error);
    reportServerError(error, { filePath: "src/app/api/iap/verify/route.ts" });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
