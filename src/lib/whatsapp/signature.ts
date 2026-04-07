/* ------------------------------------------------------------------ */
/* WhatsApp Webhook Signature Verification                            */
/* HMAC-SHA256 validation for Meta webhook requests                    */
/* ------------------------------------------------------------------ */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify the X-Hub-Signature-256 header from Meta webhook.
 * Returns true if signature is valid.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | null
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error("[WA-SIGNATURE] WHATSAPP_APP_SECRET not configured");
    return false;
  }

  if (!signature) {
    console.error("[WA-SIGNATURE] No signature header present");
    return false;
  }

  // Header format: "sha256=<hex>"
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    console.error("[WA-SIGNATURE] Invalid signature format");
    return false;
  }

  const signatureHash = signature.slice(expectedPrefix.length);
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");

  const hmac = createHmac("sha256", appSecret);
  hmac.update(body);
  const computedHash = hmac.digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signatureHash, "hex"),
      Buffer.from(computedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Hash a phone number with SHA-256 for indexed lookups.
 */
export function hashPhone(phone: string): string {
  const hmac = createHmac("sha256", "kindar-phone-salt");
  hmac.update(normalizePhone(phone));
  return hmac.digest("hex");
}

/**
 * Normalize phone number to E.164 format with +.
 * Meta sends without +, we store with +.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
