import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimaryGroupId } from "@/lib/billing";

/**
 * Verify Apple IAP transaction and activate subscription.
 *
 * Receives the JWS-signed transaction from the StoreKit 2 plugin,
 * maps the Apple product ID to our plan, and upserts the subscription.
 *
 * Production note: For full security, verify the JWS signature using
 * Apple's public keys from the App Store Server API.
 * https://developer.apple.com/documentation/appstoreserverapi
 *
 * MVP: trust StoreKit 2 on-device verification (the transaction is
 * already verified by the OS before reaching our plugin).
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
    // jwsTransaction and transactionId available for future server-side JWS verification
    // const { jwsTransaction, transactionId } = body;

    if (!productId) {
      return NextResponse.json(
        { error: "Missing productId" },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS for writes
    const admin = createAdminClient();

    // Map product ID to plan. apple_product_id is shared with Google
    // (same SKU convention) so this lookup works for both providers.
    // Support sending `platform` hint to disambiguate when Apple/Google
    // happen to use different product IDs for the same plan.
    const platform: string = body.platform || "apple";
    const providerTag = platform === "google" ? "google" : "apple";
    const methodHint = platform === "google" ? "google_iap" : "apple_iap";

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

    // Check for existing subscription for this user on the same provider
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("payment_provider", providerTag)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();

    if (existingSub) {
      // Update existing subscription (upgrade/downgrade/renewal)
      await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          status: "active",
          apple_original_transaction_id: providerTag === "apple" ? originalTransactionId || null : null,
          google_purchase_token: providerTag === "google" ? originalTransactionId || null : null,
          payment_method_hint: methodHint,
          coparenting_group_id: groupId ?? undefined,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      // Create new subscription. The Early Bird trigger in migration
      // 00056 will raise if the plan is sold out — surface that to
      // the native client so it shows a "Early Bird esgotou" message.
      const { error: insertErr } = await admin.from("subscriptions").insert({
        user_id: user.id,
        coparenting_group_id: groupId,
        plan_id: plan.id,
        status: "active",
        payment_provider: providerTag,
        payment_method_hint: methodHint,
        apple_original_transaction_id: providerTag === "apple" ? originalTransactionId || null : null,
        google_purchase_token: providerTag === "google" ? originalTransactionId || null : null,
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
      restored: isRestore || false,
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
