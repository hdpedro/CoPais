/**
 * POST /api/auth/google-native
 *
 * Native iOS posts the Google `id_token` (from expo-auth-session) here. We:
 *   1. Verify the JWT against Google's JWKS, audience must match an
 *      accepted client ID (iOS or Web)
 *   2. Find or create the Supabase user (by email)
 *   3. Mint a Supabase session via magiclink → verifyOtp
 *   4. Return { access_token, refresh_token, expires_in, user }
 *
 * Mirrors GripFlow's `/api/auth/google-native`. Independent of the
 * Supabase Dashboard's Google provider config (works either way).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  verifyGoogleIdToken,
  upsertSupabaseUser,
  mintSupabaseSession,
} from "@/lib/social-auth-helpers";

// Accepted audiences: iOS + Web client IDs configured in Google Cloud
// Console for the Kindar project. Add more here if we add Android with
// its own client id.
const ACCEPTED_AUDIENCES = [
  process.env.GOOGLE_OAUTH_IOS_CLIENT_ID || "855915326367-eiinspdtmmf3u63sfj4kj8ghn2d6p7ie.apps.googleusercontent.com",
  process.env.GOOGLE_OAUTH_WEB_CLIENT_ID || "",
].filter(Boolean);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) {
    return NextResponse.json({ error: "missing_id_token" }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken, ACCEPTED_AUDIENCES);
  } catch (err) {
    const msg = (err as Error).message || "verification_failed";
    return NextResponse.json(
      { error: "google_token_invalid", reason: msg },
      { status: 401 },
    );
  }

  let userResult;
  try {
    userResult = await upsertSupabaseUser(identity);
  } catch (err) {
    return NextResponse.json(
      { error: "supabase_upsert_failed", reason: (err as Error).message },
      { status: 500 },
    );
  }

  let session;
  try {
    session = await mintSupabaseSession(identity.email);
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
