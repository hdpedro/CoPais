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

// Accepted audiences: iOS + Android + Web client IDs configurados em
// Google Cloud Console no projeto Kindar (lares-490817). Vem APENAS de
// env vars — sem fallback hardcoded pra evitar divergencia silenciosa
// quando rotaciona credenciais. Falta de qualquer audience derruba o
// endpoint com erro 503 explicito (vs aceitar tokens de aud errado).
const ACCEPTED_AUDIENCES = [
  process.env.GOOGLE_OAUTH_IOS_CLIENT_ID,
  process.env.GOOGLE_OAUTH_ANDROID_CLIENT_ID,
  process.env.GOOGLE_OAUTH_WEB_CLIENT_ID,
].filter((s): s is string => typeof s === "string" && s.length > 0);

export async function POST(req: NextRequest) {
  // Defense in depth: se as audiences nao foram configuradas, devolve 503
  // em vez de processar com lista vazia (`verifyGoogleIdToken` aceitaria
  // qualquer aud). Erro fica visivel pro time imediatamente em vez de
  // virar problema silencioso de seguranca.
  if (ACCEPTED_AUDIENCES.length === 0) {
    console.error("[google-native] No accepted audiences configured. Missing env vars: GOOGLE_OAUTH_{IOS,ANDROID,WEB}_CLIENT_ID");
    return NextResponse.json({ error: "service_misconfigured" }, { status: 503 });
  }

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
