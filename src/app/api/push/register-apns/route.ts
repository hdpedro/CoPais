import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, platform } = (await req.json()) as {
      token?: string;
      platform?: string;
    };
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400 }
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
          return NextResponse.json({ success: true, existing: true });
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

    return NextResponse.json({ success: true, platform: tokenTitle });
  } catch (error) {
    console.error("[push/register] Register error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
