"use client";

import { isNativeApp, isIOS } from "./capacitor";

export type PaymentPlatform = "stripe" | "apple_iap";

export function getPaymentPlatform(): PaymentPlatform {
  if (isNativeApp() && isIOS()) {
    return "apple_iap";
  }
  return "stripe";
}
