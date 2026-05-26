/**
 * /api/push/debug-self — Diagnostic endpoint for push token + APNs delivery.
 *
 * Why this exists:
 *   On 2026-05-26 we hit a silent regression where iOS APNs tokens stopped
 *   registering and there was no way to determine WHICH layer of the pipeline
 *   was broken (capability? client expo-notifications? backend env vars?
 *   Apple endpoint?). Every debug attempt required full OTA + cold start +
 *   pray for telemetry. This endpoint short-circuits the loop: a Bearer-auth
 *   call returns deterministic JSON about the entire push pipeline for the
 *   authenticated user.
 *
 * Routes:
 *   GET   /api/push/debug-self  →  Inventory: how many tokens, of which kind,
 *                                  what permission state we can infer.
 *   POST  /api/push/debug-self  →  Try to send a real APNs push to every
 *                                  apns_token the user has. Return raw Apple
 *                                  response per token. Server env_missing is
 *                                  explicit. ZERO ambiguity.
 *
 * Safety:
 *   - Bearer auth only — never accepts cookies, can't be triggered by CSRF.
 *   - Only operates on the authenticated user's own tokens (no admin scope).
 *   - Returns truncated tokens (last 8 chars) — never the full token.
 *   - No-op effect if no token registered (no DB writes, no Apple calls).
 *   - Idempotent — calling repeatedly doesn't change state.
 *
 * Whitelist:
 *   Already covered by middleware `/api/push` prefix entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface ApnsAttempt {
  tokenSuffix: string;
  delivered: boolean;
  status: number | null;
  reason: string | null;
  errorMessage: string | null;
}

async function getUserTokens(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notifications")
    .select("id, title, message, created_at")
    .eq("user_id", userId)
    .eq("type", "system")
    .in("title", ["apns_token", "fcm_token", "push_sub"])
    .order("created_at", { ascending: false });
  return data ?? [];
}

function tokenSuffix(token: string) {
  return token.length > 8 ? "…" + token.slice(-8) : token;
}

export async function GET(req: NextRequest) {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const tokens = await getUserTokens(user.id);
  const apns = tokens.filter((t) => t.title === "apns_token");
  const fcm = tokens.filter((t) => t.title === "fcm_token");
  const web = tokens.filter((t) => t.title === "push_sub");

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    serverConfig: {
      apns_key_id_set: !!process.env.APNS_KEY_ID,
      apns_team_id_set: !!process.env.APNS_TEAM_ID,
      apns_key_p8_set: !!process.env.APNS_KEY_P8,
      apns_bundle_id: process.env.APNS_BUNDLE_ID ?? "com.kindar.app (default)",
    },
    counts: {
      apns_tokens: apns.length,
      fcm_tokens: fcm.length,
      web_subscriptions: web.length,
    },
    apnsTokens: apns.map((t) => ({
      suffix: tokenSuffix(t.message),
      length: t.message.length,
      created_at: t.created_at,
    })),
    fcmTokens: fcm.map((t) => ({
      suffix: tokenSuffix(t.message),
      length: t.message.length,
      created_at: t.created_at,
    })),
  });
}

/**
 * Mirrors `sendApnsPush` in src/lib/push.ts but returns the raw Apple response.
 * Inlined here (instead of importing) to avoid coupling: this endpoint MUST
 * keep working even if push.ts refactors change the signature.
 */
async function sendApnsDebug(token: string): Promise<ApnsAttempt> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyP8 = process.env.APNS_KEY_P8;
  const bundleId = process.env.APNS_BUNDLE_ID ?? "com.kindar.app";

  if (!keyId || !teamId || !keyP8) {
    return {
      tokenSuffix: tokenSuffix(token),
      delivered: false,
      status: null,
      reason: "env_missing",
      errorMessage: `Missing env vars: ${[
        !keyId && "APNS_KEY_ID",
        !teamId && "APNS_TEAM_ID",
        !keyP8 && "APNS_KEY_P8",
      ].filter(Boolean).join(", ")}`,
    };
  }

  try {
    const crypto = await import("crypto");
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
    const signingInput = `${header}.${claims}`;
    const key = crypto.createPrivateKey(keyP8.replace(/\\n/g, "\n"));
    const sign = crypto.createSign("SHA256");
    sign.update(signingInput);
    const signature = sign.sign(key);
    const r = signature.subarray(4, 4 + signature[3]);
    const sOffset = 4 + signature[3] + 2;
    const s = signature.subarray(sOffset, sOffset + signature[sOffset - 1]);
    const rawSig = Buffer.concat([
      Buffer.alloc(32 - r.length), r,
      Buffer.alloc(32 - s.length), s,
    ]).toString("base64url");
    const jwt = `${signingInput}.${rawSig}`;

    const apnsUrl = `https://api.push.apple.com/3/device/${token}`;
    const payload = {
      aps: {
        alert: { title: "Kindar — Teste de notificação", body: "Se você vê isto, o push iOS funciona." },
        sound: "default",
        badge: 1,
      },
      url: "/dashboard",
      _debug: true,
    };

    const res = await fetch(apnsUrl, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let parsedReason: string | null = null;
    if (!res.ok) {
      try {
        const body = (await res.json()) as { reason?: string };
        parsedReason = body?.reason ?? null;
      } catch {
        // body wasn't JSON
      }
    }

    return {
      tokenSuffix: tokenSuffix(token),
      delivered: res.ok,
      status: res.status,
      reason: parsedReason ?? (res.ok ? "delivered" : `http_${res.status}`),
      errorMessage: null,
    };
  } catch (err) {
    return {
      tokenSuffix: tokenSuffix(token),
      delivered: false,
      status: null,
      reason: "exception",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(req: NextRequest) {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const tokens = await getUserTokens(user.id);
  const apns = tokens.filter((t) => t.title === "apns_token");

  if (apns.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: "no_apns_token_registered",
      hint: "Token APNs nunca foi registrado pra este user. Tente force-register via UI debug ou abra app no iOS com permission granted.",
    }, { status: 404 });
  }

  const attempts: ApnsAttempt[] = [];
  for (const t of apns) {
    attempts.push(await sendApnsDebug(t.message));
  }

  const anyDelivered = attempts.some((a) => a.delivered);
  return NextResponse.json({
    ok: anyDelivered,
    totalTokens: apns.length,
    delivered: attempts.filter((a) => a.delivered).length,
    attempts,
  });
}
