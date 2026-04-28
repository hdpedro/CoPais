/**
 * Firebase Cloud Messaging (FCM) sender — HTTP v1 API.
 *
 * Mirrors the contract of `sendApnsPush` in `src/lib/push.ts` so the
 * caller can route by platform without caring about the protocol.
 *
 * Required env (graceful no-op when missing):
 *   FCM_PROJECT_ID         — Firebase project id (e.g. "kindar-prod")
 *   FCM_CLIENT_EMAIL       — service account email
 *   FCM_PRIVATE_KEY        — service account RSA private key (PEM, with \n
 *                            escaped or as multiline). Same format as the
 *                            JSON downloaded from GCP IAM > Service Accounts.
 *
 * The OAuth2 access token is cached in-process for ~50 minutes (Google issues
 * 60-min tokens). One Vercel function instance reuses the token across calls.
 */

interface FcmPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Same shape as APNs's PushSendResult so callers can drop both into the
 * "removeToken-only-on-permanent-invalid" branch. Don't import the type
 * across files to keep this module self-contained.
 */
export type FcmSendResult =
  | { delivered: true }
  | { delivered: false; removeToken: boolean; reason: string };

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  // Use cached token if it still has >5 min of life
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - now > 300) {
    return cachedAccessToken.token;
  }

  try {
    const crypto = await import("crypto");

    // Sign a JWT with the service-account private key (RS256)
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })
    ).toString("base64url");
    const signingInput = `${header}.${claims}`;

    const key = crypto.createPrivateKey(privateKey.replace(/\\n/g, "\n"));
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(key).toString("base64url");
    const jwt = `${signingInput}.${signature}`;

    // Exchange JWT for OAuth access token
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    if (!res.ok) {
      console.warn("[FCM] OAuth token request failed:", res.status, await res.text());
      return null;
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedAccessToken = {
      token: json.access_token,
      expiresAt: now + (json.expires_in || 3600),
    };
    return json.access_token;
  } catch (err) {
    console.warn("[FCM] Failed to mint access token:", err);
    return null;
  }
}

/**
 * Send a push notification to a single FCM registration token.
 * Returns a discriminated result. Caller deletes the stored token ONLY
 * when `removeToken: true`. Env-missing and transient failures preserve
 * the token so a working state isn't wiped by a temporary outage.
 *
 * Permanent FCM failures we delete on (per Google's docs):
 *   404 with errorCode=UNREGISTERED  → app uninstalled / token rotated
 *   400 with errorCode=INVALID_ARGUMENT — only when the message is malformed
 *     specifically because of the token (cannot reliably distinguish; we
 *     err on the side of NOT deleting and let the caller observe).
 */
export async function sendFcmPush(
  token: string,
  payload: FcmPayload
): Promise<FcmSendResult> {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) {
    return { delivered: false, removeToken: false, reason: "env_missing" };
  }

  const accessToken = await getFcmAccessToken();
  if (!accessToken) {
    return { delivered: false, removeToken: false, reason: "oauth_failed" };
  }

  try {
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        // FCM data fields must be strings — mirror APNs payload shape so the
        // native handler reads `data.url` consistently across platforms.
        url: payload.url || "/dashboard",
        ...(payload.tag ? { tag: payload.tag } : {}),
      },
      android: {
        priority: "high" as const,
        notification: {
          // Match Android channel registered in kindar-native push-setup.ts
          channel_id: "default",
          ...(payload.tag ? { tag: payload.tag } : {}),
        },
      },
    };

    const res = await fetch(fcmUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (res.ok) return { delivered: true };

    // Try to parse the error payload to distinguish permanent vs transient.
    if (res.status === 404) {
      try {
        const body = (await res.json()) as {
          error?: { details?: Array<{ errorCode?: string }> };
        };
        const code = body?.error?.details?.[0]?.errorCode;
        if (code === "UNREGISTERED") {
          return { delivered: false, removeToken: true, reason: "unregistered" };
        }
      } catch {
        // fall through
      }
    }
    return { delivered: false, removeToken: false, reason: `http_${res.status}` };
  } catch (err) {
    console.warn("[FCM] Send failed:", err);
    return { delivered: false, removeToken: false, reason: "network_error" };
  }
}
