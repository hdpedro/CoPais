/**
 * Unified Payment System — Apple IAP + Stripe
 *
 * iOS native app → Apple In-App Purchase (StoreKit 2 via Capacitor plugin)
 * Web / Android  → Stripe Checkout
 *
 * Detects platform and routes automatically.
 * Follows GripFlow pattern: gripflow/src/lib/payments.ts
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

// ── Types ──

export type PaymentPlatform = "apple" | "stripe";

interface AppleProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  priceValue: number;
  currency: string;
}

interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  originalTransactionId?: string;
  jwsTransaction?: string;
  expirationDate?: number;
  error?: string;
}

interface RestoreResult {
  success: boolean;
  transactions: Array<{
    productId: string;
    transactionId: string;
    originalTransactionId: string;
    jwsTransaction: string;
    expirationDate: number;
  }>;
}

interface StoreKitPlugin {
  getProducts(options: {
    productIds: string[];
  }): Promise<{ products: AppleProduct[] }>;
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
}

// ── Plugin Registration ──

let StoreKit: StoreKitPlugin | null = null;
if (
  typeof window !== "undefined" &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios"
) {
  StoreKit = registerPlugin<StoreKitPlugin>("StoreKit");
}

// ── Platform Detection ──

export function getPaymentPlatform(): PaymentPlatform {
  if (typeof window === "undefined") return "stripe";
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios")
    return "apple";
  return "stripe";
}

// ── Apple IAP ──

/**
 * Load product info from App Store (localized prices)
 */
export async function loadAppleProducts(
  productIds: string[]
): Promise<AppleProduct[]> {
  if (!StoreKit) return [];
  try {
    const { products } = await StoreKit.getProducts({ productIds });
    return products;
  } catch {
    return [];
  }
}

/**
 * Purchase via Apple IAP and verify on server
 */
export async function purchaseApple(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  if (!StoreKit) return { success: false, error: "StoreKit not available" };

  const result = await StoreKit.purchase({ productId });

  if (!result.success) {
    return { success: false, error: result.error || "Purchase failed" };
  }

  // Verify receipt on server and activate subscription
  if (result.jwsTransaction) {
    try {
      const res = await fetch("/api/iap/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jwsTransaction: result.jwsTransaction,
          productId,
          transactionId: result.transactionId,
          originalTransactionId: result.originalTransactionId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || "Server verification failed",
        };
      }
    } catch {
      return { success: false, error: "Connection error during verification" };
    }
  }

  return { success: true };
}

/**
 * Restore previous Apple purchases
 */
export async function restoreApplePurchases(): Promise<{
  success: boolean;
  restoredCount: number;
  error?: string;
}> {
  if (!StoreKit)
    return { success: false, restoredCount: 0, error: "StoreKit not available" };

  try {
    const result = await StoreKit.restorePurchases();

    if (!result.success || result.transactions.length === 0) {
      return { success: false, restoredCount: 0, error: "No purchases to restore" };
    }

    // Verify each restored transaction on server
    let restoredCount = 0;
    for (const txn of result.transactions) {
      try {
        const res = await fetch("/api/iap/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jwsTransaction: txn.jwsTransaction,
            productId: txn.productId,
            transactionId: txn.transactionId,
            originalTransactionId: txn.originalTransactionId,
            isRestore: true,
          }),
        });
        if (res.ok) restoredCount++;
      } catch {
        // Continue with next transaction
      }
    }

    return { success: restoredCount > 0, restoredCount };
  } catch {
    return { success: false, restoredCount: 0, error: "Restore failed" };
  }
}

// ── Stripe ──

/**
 * Start Stripe Checkout session and return redirect URL
 */
export async function purchaseStripe(
  priceId: string,
  planId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId, planId }),
    });
    const data = await res.json();
    if (data.url) return { success: true, url: data.url };
    return { success: false, error: data.error || "Checkout failed" };
  } catch {
    return { success: false, error: "Connection error" };
  }
}
