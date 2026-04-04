import { NextResponse } from "next/server";

/**
 * Apple IAP / RevenueCat verification endpoint (stub).
 *
 * Will be implemented when:
 * 1. Kindar is published on the App Store via Capacitor
 * 2. RevenueCat account is configured
 * 3. Apple IAP products are created
 *
 * Expected flow:
 * - Native app sends receipt/transaction to this endpoint
 * - Server verifies with RevenueCat API
 * - Creates/updates subscription in DB
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Apple IAP verification not yet implemented",
      message: "Use Stripe checkout for web/PWA subscriptions",
    },
    { status: 501 }
  );
}
