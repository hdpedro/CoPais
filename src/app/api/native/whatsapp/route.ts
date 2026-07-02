/**
 * Native WhatsApp Link API
 *
 * Wraps the PWA server actions (requestWhatsAppLink / verifyWhatsAppOTP /
 * unlinkWhatsApp / getWhatsAppLinkStatus) so the Kindar Native app can drive
 * the same OTP-based WhatsApp linking flow.
 *
 * Auth: Bearer token (Supabase access_token) — same pattern as /api/native/notify.
 *
 * POST body:
 *   { action: 'status' | 'request' | 'verify' | 'unlink',
 *     phone?: string,   // required for action='request'
 *     otp?: string }    // required for action='verify'
 *
 * Response: matches the shape each action returns (see inline docs).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requestWhatsAppLinkService,
  verifyWhatsAppLinkService,
  type WaLinkErrorCode,
  type WaVerifyErrorCode,
} from "@/lib/services/whatsapp-link";

// Mapeia o `code` do service compartilhado para o HTTP status que o Native
// já esperava (paridade de contrato com o comportamento anterior).
const REQUEST_STATUS: Record<WaLinkErrorCode, number> = {
  invalid_phone: 400,
  phone_taken: 409,
  persist_failed: 500,
  send_failed: 502,
};
const VERIFY_STATUS: Record<WaVerifyErrorCode, number> = {
  invalid_otp_format: 400,
  no_pending: 404,
  wrong_code: 400,
  expired: 400,
  persist_failed: 500,
};

type Body =
  | { action: "status" }
  | { action: "request"; phone: string }
  | { action: "verify"; otp: string }
  | { action: "unlink" };

async function authenticate(req: NextRequest): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Missing auth", status: 401 };
  const token = authHeader.slice(7);

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: "Invalid token", status: 401 };
  return { userId: data.user.id };
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = auth.userId;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── status ────────────────────────────────────────────────────────────
  if (body.action === "status") {
    const { data: link } = await admin
      .from("whatsapp_phone_links")
      .select("id, phone_number, verified_at, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("verified_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!link) return NextResponse.json({ status: "unlinked" });
    if (!link.verified_at) return NextResponse.json({ status: "pending", phone: link.phone_number });
    return NextResponse.json({ status: "linked", phone: link.phone_number });
  }

  // ── request OTP ───────────────────────────────────────────────────────
  if (body.action === "request") {
    const result = await requestWhatsAppLinkService(admin, userId, body.phone ?? "");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: REQUEST_STATUS[result.code] });
    }
    return NextResponse.json({ success: true, phone: result.phone });
  }

  // ── verify OTP ────────────────────────────────────────────────────────
  if (body.action === "verify") {
    const result = await verifyWhatsAppLinkService(admin, userId, body.otp ?? "");
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: VERIFY_STATUS[result.code] });
    }
    return NextResponse.json({ success: true });
  }

  // ── unlink ────────────────────────────────────────────────────────────
  if (body.action === "unlink") {
    await admin.from("whatsapp_phone_links").update({ is_active: false })
      .eq("user_id", userId).eq("is_active", true);
    await admin.from("whatsapp_sessions").delete().eq("user_id", userId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
