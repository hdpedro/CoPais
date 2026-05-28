import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Register a device token for native push notifications.
 *
 * Endpoint name kept as `register-apns` for back-compat. Routes by `platform`:
 *   - platform === 'ios'      → stored as title='apns_token', sent via APNs HTTP/2
 *   - platform === 'android'  → stored as title='fcm_token',  sent via FCM HTTP v1
 *   - missing platform        → defaults to 'apns_token' (legacy iOS clients)
 *
 * Stores under the same notifications table (no schema change needed) using
 * the marker rows pattern. See `src/lib/push.ts` for sender wiring.
 *
 * Auth: usa resolveAuthenticatedUser (Bearer-aware) porque o native SEMPRE
 * passa Authorization: Bearer <jwt>. O createClient() do PWA SSR só lê
 * cookies — sem cookies, retorna user=null → 401. Bug histórico
 * (Henrique 2026-05-26): tinha createClient aqui, native batia em loop com
 * 401 silencioso, zero tokens registravam em prod.
 */
export async function POST(req: NextRequest) {
  // Mede duration end-to-end. Anomalia 2026-05-28 10:56 UTC: 504 Vercel
  // Timeout (>10s default). Cause provável: connection pool exhaustion
  // ou peak latency Supabase. Logamos `durationMs` em TODA resposta pra
  // detectar trend de slowness antes que vire timeout sistêmico.
  // maxDuration: 20s configurado em vercel.json como safety net (era 10s
  // default hobby; 30s já é o limit pra outras funções premium do projeto).
  const startMs = Date.now();
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", durationMs: Date.now() - startMs },
        { status: 401 },
      );
    }

    const { token, platform } = (await req.json()) as {
      token?: string;
      platform?: string;
    };
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Missing token", durationMs: Date.now() - startMs },
        { status: 400 },
      );
    }

    const tokenTitle =
      platform === "android" ? "fcm_token"
      : platform === "ios" ? "apns_token"
      : "apns_token"; // legacy fallback

    const admin = createAdminClient();

    // Check if this exact token already exists under the target title
    const { data: existing } = await admin
      .from("notifications")
      .select("id, message")
      .eq("user_id", user.id)
      .eq("type", "system")
      .eq("title", tokenTitle);

    if (existing) {
      for (const row of existing) {
        if (row.message === token) {
          return NextResponse.json({
            success: true,
            existing: true,
            durationMs: Date.now() - startMs,
          });
        }
      }
    }

    // If the same token was previously stored under the WRONG title (e.g. an
    // Android FCM token misclassified as apns_token by the old client),
    // remove the bad row so we don't have a stale duplicate.
    const wrongTitle = tokenTitle === "fcm_token" ? "apns_token" : "fcm_token";
    await admin
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("type", "system")
      .eq("title", wrongTitle)
      .eq("message", token);

    // Insert new token under correct title
    await admin.from("notifications").insert({
      user_id: user.id,
      type: "system",
      title: tokenTitle,
      message: token,
      link: null,
      is_read: true, // Hidden from notification UI
    });

    const durationMs = Date.now() - startMs;
    // Heurística de slowness: se demorar mais que 5s, logar pra trend
    // tracking (Vercel default timeout era 10s, tivemos 504 hoje). Permite
    // detectar antes de virar problema sistêmico.
    if (durationMs > 5000) {
      console.warn(`[push/register] slow path durationMs=${durationMs}`);
    }
    return NextResponse.json({
      success: true,
      platform: tokenTitle,
      durationMs,
    });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error("[push/register] Register error:", {
      message: error instanceof Error ? error.message : String(error),
      durationMs,
    });
    return NextResponse.json(
      {
        error: "Registration failed",
        detail: error instanceof Error ? error.message : String(error),
        durationMs,
      },
      { status: 500 },
    );
  }
}
