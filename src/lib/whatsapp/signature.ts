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
 *
 * Inputs aceitos (todos chegam ao mesmo resultado canonico):
 *   "+5521997859793"      -> "+5521997859793"
 *   "5521997859793"       -> "+5521997859793"  (Meta envia sem +)
 *   "21997859793"         -> "+5521997859793"  (BR-aware: prepend 55)
 *   "(21) 99785-9793"     -> "+5521997859793"
 *   "+1 555 123 4567"     -> "+15551234567"    (mantem int'l explicito)
 *
 * Estrategia BR-aware: se o input NAO comeca com '+' explicito e o numero
 * (so digitos) tem 10 ou 11 digitos sem prefixo '55', assume Brasil e
 * adiciona '+55'. Isso protege contra usuarios digitando o numero sem
 * codigo do pais no formulario do PWA — antes virava "+21..." que nao
 * batia com o "+5521..." que Meta envia no webhook.
 */
export function normalizePhone(phone: string): string {
  const trimmed = (phone || "").trim();
  if (!trimmed) return "";

  const startsWithPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return "";

  // Internacional explicito — respeita o que o usuario informou.
  if (startsWithPlus) return `+${digits}`;

  // Sem '+': se for BR mobile (11) ou fixo (10) sem o '55' na frente,
  // assume Brasil e adiciona o codigo do pais.
  const looksLikeBrLocal =
    (digits.length === 10 || digits.length === 11) && !digits.startsWith("55");
  if (looksLikeBrLocal) return `+55${digits}`;

  // Caso geral: mantem digitos como vieram (ex: Meta webhook envia
  // "5521997859793" sem +).
  return `+${digits}`;
}
