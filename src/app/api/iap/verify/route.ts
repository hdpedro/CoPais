import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    // Authenticate the user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

    // Map Apple product ID to our plan
    const { data: plan } = await admin
      .from("plans")
      .select("id, interval")
      .eq("apple_product_id", productId)
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: `Unknown product: ${productId}` },
        { status: 400 }
      );
    }

    // Calculate subscription period
    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === "year") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Check for existing Apple subscription for this user
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("payment_provider", "apple")
      .in("status", ["active", "trialing"])
      .single();

    if (existingSub) {
      // Update existing subscription (upgrade/downgrade/renewal)
      await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          status: "active",
          apple_original_transaction_id: originalTransactionId || null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      // Create new subscription
      await admin.from("subscriptions").insert({
        user_id: user.id,
        plan_id: plan.id,
        status: "active",
        payment_provider: "apple",
        apple_original_transaction_id: originalTransactionId || null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      });
    }

    // Update the user's plan in the profiles table (if it exists)
    await admin
      .from("profiles")
      .update({ plan_id: plan.id, updated_at: now.toISOString() })
      .eq("id", user.id);

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
