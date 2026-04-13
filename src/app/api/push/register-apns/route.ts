import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Register an APNs device token for native iOS push notifications.
 * Called by native-init.ts when the Capacitor app starts and gets an APNs token.
 *
 * Stores the token in the notifications table following the same pattern
 * as web-push subscriptions (title='apns_token', message=token).
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

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Check if this token already exists for this user
    const { data: existing } = await admin
      .from("notifications")
      .select("id, message")
      .eq("user_id", user.id)
      .eq("type", "system")
      .eq("title", "apns_token");

    if (existing) {
      for (const row of existing) {
        if (row.message === token) {
          // Token already registered
          return NextResponse.json({ success: true, existing: true });
        }
      }
    }

    // Insert new APNs token
    await admin.from("notifications").insert({
      user_id: user.id,
      type: "system",
      title: "apns_token",
      message: token,
      link: null,
      is_read: true, // Hidden from notification UI
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[APNs] Register error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
