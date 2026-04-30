/**
 * Server-side Apple "Sign In with Apple" token revocation.
 *
 * Required by Apple Guideline 5.1.1(v): apps that allow account deletion
 * MUST also revoke any active Apple Sign-In refresh token associated
 * with the deleted account. Without this, App Review can flag the build
 * even after a successful binary review.
 *
 * Flow:
 *   1. Build a client_secret JWT signed by APPLE_SIWA_PRIVATE_KEY (.p8),
 *      with kid=APPLE_SIWA_KEY_ID and iss=APPLE_SIWA_TEAM_ID.
 *   2. POST x-www-form-urlencoded to https://appleid.apple.com/auth/revoke:
 *        client_id     = bundle id (com.kindar.app for native)
 *        client_secret = JWT from step 1
 *        token         = the user's Apple refresh_token (or access_token
 *                         as a fallback — Apple accepts both with hint)
 *        token_type_hint = refresh_token | access_token
 *
 * Apple returns 200 with empty body on success, 400 with details on
 * failure. We never block the account deletion on a revoke failure —
 * if the user's refresh_token is missing or already invalid, we still
 * delete locally (the goal is hygiene, not blocking the user).
 *
 * The .p8 contents are stored in APPLE_SIWA_PRIVATE_KEY as the literal
 * PEM string (with \n escapes if pasted into Vercel via REST API).
 */

import * as jose from "jose";

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_AUD = "https://appleid.apple.com";

/**
 * Builds the client_secret JWT Apple expects on /auth/revoke and
 * /auth/token. Spec: ES256, valid up to 6 months, but we use 5 minutes.
 */
async function buildClientSecret(): Promise<string> {
  const keyId = process.env.APPLE_SIWA_KEY_ID;
  const teamId = process.env.APPLE_SIWA_TEAM_ID;
  const bundleId = process.env.APPLE_SIWA_BUNDLE_ID;
  const pem = process.env.APPLE_SIWA_PRIVATE_KEY;

  if (!keyId || !teamId || !bundleId || !pem) {
    throw new Error("apple_siwa_env_missing");
  }

  // jose.importPKCS8 accepts the raw PEM. Vercel env serialization stores
  // \n literally for multiline values; convert back to actual newlines.
  const pemReal = pem.replace(/\\n/g, "\n");
  const privateKey = await jose.importPKCS8(pemReal, "ES256");

  const now = Math.floor(Date.now() / 1000);
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 300) // 5 minutes
    .setAudience(APPLE_AUD)
    .setSubject(bundleId)
    .sign(privateKey);
}

export interface RevokeResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

/**
 * Revoke the user's Apple refresh (or access) token. Caller must pass
 * the token they have on hand — typically the refresh_token saved at
 * sign-in time. If you only have an idToken (not the refresh_token),
 * Apple's revoke endpoint won't accept it; in that case skip the call
 * (it's a no-op for compliance — the user lost the refresh_token anyway).
 *
 * Returns ok=true on Apple-200, ok=false otherwise. Never throws — the
 * caller continues with deletion regardless.
 */
export async function revokeAppleToken(
  token: string,
  tokenTypeHint: "refresh_token" | "access_token" = "refresh_token"
): Promise<RevokeResult> {
  if (!token) return { ok: false, reason: "no_token" };

  const bundleId = process.env.APPLE_SIWA_BUNDLE_ID;
  if (!bundleId) return { ok: false, reason: "siwa_env_missing" };

  let clientSecret: string;
  try {
    clientSecret = await buildClientSecret();
  } catch (e) {
    return { ok: false, reason: `jwt_sign_failed:${(e as Error).message}` };
  }

  const params = new URLSearchParams();
  params.append("client_id", bundleId);
  params.append("client_secret", clientSecret);
  params.append("token", token);
  params.append("token_type_hint", tokenTypeHint);

  let res: Response;
  try {
    res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (e) {
    return { ok: false, reason: `fetch_failed:${(e as Error).message}` };
  }

  if (res.ok) return { ok: true, status: res.status };

  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, reason: text.slice(0, 200) };
}

export interface ExchangeResult {
  ok: boolean;
  refreshToken?: string;
  reason?: string;
  status?: number;
}

/**
 * Exchange the one-time `authorization_code` returned by Apple's native
 * Sign-In sheet for a long-lived refresh_token. We persist the
 * refresh_token in user_metadata so /api/auth/delete-account can revoke
 * it later (Apple Guideline 5.1.1(v)).
 *
 * The native flow currently sends only the idToken; once the iOS app is
 * updated to also forward the authorizationCode, this function turns it
 * into a stored refresh_token.
 */
export async function exchangeAppleAuthCode(code: string): Promise<ExchangeResult> {
  if (!code) return { ok: false, reason: "no_code" };

  const bundleId = process.env.APPLE_SIWA_BUNDLE_ID;
  if (!bundleId) return { ok: false, reason: "siwa_env_missing" };

  let clientSecret: string;
  try {
    clientSecret = await buildClientSecret();
  } catch (e) {
    return { ok: false, reason: `jwt_sign_failed:${(e as Error).message}` };
  }

  const params = new URLSearchParams();
  params.append("client_id", bundleId);
  params.append("client_secret", clientSecret);
  params.append("code", code);
  params.append("grant_type", "authorization_code");

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (e) {
    return { ok: false, reason: `fetch_failed:${(e as Error).message}` };
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && typeof json.refresh_token === "string") {
    return { ok: true, refreshToken: json.refresh_token, status: res.status };
  }
  return { ok: false, status: res.status, reason: JSON.stringify(json).slice(0, 200) };
}
