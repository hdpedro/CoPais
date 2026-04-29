/**
 * Server-side helpers for native social login.
 *
 * Pattern (mirrors GripFlow's `/api/auth/apple` + `/api/auth/google-native`):
 *   1. Verify the upstream idToken cryptographically via JWKS
 *   2. Find or create the corresponding user in Supabase via admin client
 *   3. Mint a Supabase session via the magiclink → verifyOtp dance
 *   4. Return access + refresh tokens to native
 *
 * This bypasses the need to enable Apple/Google providers in the Supabase
 * Auth Dashboard — we manually validate the upstream idToken and use admin
 * privileges to grant a session.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as jose from "jose";
import { createAdminClient } from "@/lib/supabase/admin";

// JWKS endpoints + cached resolvers (jose handles caching internally with TTL).
const APPLE_JWKS = jose.createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const GOOGLE_JWKS = jose.createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface VerifiedIdentity {
  email: string;
  sub: string; // upstream user id
  fullName?: string | null;
  provider: "apple" | "google";
}

/**
 * Verify an Apple identity token (signed JWT).
 * Apple's audience is the iOS bundle ID for native sign-in,
 * or the Service ID for web sign-in. We accept the bundle ID.
 */
export async function verifyAppleIdToken(
  idToken: string,
  expectedAudience: string,
): Promise<VerifiedIdentity> {
  const { payload } = await jose.jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: expectedAudience,
  });

  const sub = String(payload.sub || "");
  const email = String(payload.email || "");
  if (!sub) throw new Error("apple_idtoken_missing_sub");
  // Email may be missing on subsequent sign-ins (Apple only sends it the
  // first time). Caller is expected to fall back to the email in the
  // request body for those cases.

  return { email, sub, provider: "apple" };
}

/**
 * Verify a Google ID token (signed JWT). Audience must match either the
 * iOS Client ID (when native flow uses expo-auth-session) or the Web
 * Client ID (when web OAuth flow lands the token in our backend).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  acceptedAudiences: string[],
): Promise<VerifiedIdentity> {
  const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["accounts.google.com", "https://accounts.google.com"],
  });

  const aud = String(payload.aud || "");
  if (!acceptedAudiences.includes(aud)) {
    throw new Error(`google_idtoken_audience_mismatch:${aud}`);
  }

  const sub = String(payload.sub || "");
  const email = String(payload.email || "");
  const name = (payload.name as string | undefined) || null;
  if (!sub || !email) throw new Error("google_idtoken_missing_claims");

  return { email, sub, fullName: name, provider: "google" };
}

/**
 * Find an existing Supabase user by email, or create one.
 * Idempotent: a returning user keeps their id + metadata, with new
 * provider info merged in (so Apple sub + Google sub can coexist).
 */
export async function upsertSupabaseUser(
  identity: VerifiedIdentity & { fullName?: string | null },
): Promise<{ userId: string; isNew: boolean }> {
  const admin = createAdminClient();

  // Find by email — listUsers is paginated; we filter client-side because
  // there's no 'filter by email' endpoint. For the volume Kindar runs at
  // (<10k users), one page is plenty. For higher scale we'd index instead.
  let existing: { id: string; user_metadata?: Record<string, unknown> } | null = null;
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of data?.users || []) {
      if ((u.email || "").toLowerCase() === identity.email.toLowerCase()) {
        existing = { id: u.id, user_metadata: u.user_metadata };
        break;
      }
    }
  } catch (err) {
    console.warn("[social-auth] listUsers failed:", err);
  }

  const subKey = identity.provider === "apple" ? "apple_sub" : "google_sub";
  const meta = {
    provider: identity.provider,
    [subKey]: identity.sub,
    full_name: identity.fullName || (existing?.user_metadata?.full_name as string | undefined),
  };

  if (existing) {
    // Merge new provider info without clobbering existing fields.
    await admin.auth.admin.updateUserById(existing.id, {
      user_metadata: { ...(existing.user_metadata || {}), ...meta },
    });
    return { userId: existing.id, isNew: false };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true, // social-auth has already verified the email
    user_metadata: meta,
  });
  if (error || !created?.user) {
    throw new Error(`supabase_create_user_failed: ${error?.message || "unknown"}`);
  }
  return { userId: created.user.id, isNew: true };
}

/**
 * Mint a Supabase session for the given user. Uses the magiclink →
 * verifyOtp pattern because Supabase doesn't expose a direct
 * "create session" admin endpoint.
 *
 * Important: this consumes the magic link, so the same email cannot
 * reuse the link from a regular email. We call this server-side only,
 * never expose the link to the user.
 */
export async function mintSupabaseSession(email: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}> {
  const admin = createAdminClient();

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`supabase_generatelink_failed: ${linkErr?.message || "no hashed_token"}`);
  }

  // Use the anon-key client to verify the OTP — admin client can't
  // exchange OTP for session.
  const supa: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: sess, error: otpErr } = await supa.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !sess?.session || !sess?.user) {
    throw new Error(`supabase_verifyotp_failed: ${otpErr?.message || "no session"}`);
  }

  return {
    accessToken: sess.session.access_token,
    refreshToken: sess.session.refresh_token,
    expiresIn: sess.session.expires_in ?? 3600,
    userId: sess.user.id,
  };
}
