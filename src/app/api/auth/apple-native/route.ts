/**
 * POST /api/auth/apple-native
 *
 * Native iOS posts the Apple `identityToken` here. We:
 *   1. Verify the JWT against Apple's JWKS (audience = our bundle ID)
 *   2. Find or create the matching Supabase user
 *   3. Mint a Supabase session via magiclink → verifyOtp
 *   4. Return { access_token, refresh_token, expires_in, user }
 *
 * Mirror of GripFlow's `/api/auth/apple` — same shape so future native
 * code paths can stay aligned.
 *
 * Apple's idToken does NOT include the email on subsequent sign-ins (only
 * the first). Native should pass `email` from the AppleAuthentication
 * credential in the body as a fallback.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  verifyAppleIdToken,
  upsertSupabaseUser,
  mintSupabaseSession,
} from "@/lib/social-auth-helpers";

const APPLE_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.kindar.app";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const fallbackEmail = typeof body.email === "string" ? body.email : "";
  const fullName = typeof body.name === "string" ? body.name : null;

  if (!idToken) {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  // 1. Verify Apple JWT
  let identity;
  try {
    identity = await verifyAppleIdToken(idToken, APPLE_BUNDLE_ID);
  } catch (err) {
    const msg = (err as Error).message || "verification_failed";
    return NextResponse.json(
      { error: "apple_token_invalid", reason: msg },
      { status: 401 },
    );
  }

  const email = identity.email || fallbackEmail;
  if (!email) {
    return NextResponse.json(
      { error: "missing_email", hint: "Apple só envia email no PRIMEIRO login. Native deve mandar email do credential." },
      { status: 400 },
    );
  }

  // 2. Upsert Supabase user
  let userResult;
  try {
    userResult = await upsertSupabaseUser({ ...identity, email, fullName });
  } catch (err) {
    return NextResponse.json(
      { error: "supabase_upsert_failed", reason: (err as Error).message },
      { status: 500 },
    );
  }

  // 3. Mint session
  let session;
  try {
    session = await mintSupabaseSession(email);
  } catch (err) {
    return NextResponse.json(
      { error: "supabase_session_failed", reason: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: session.expiresIn,
    user_id: userResult.userId,
    is_new: userResult.isNew,
  });
}
