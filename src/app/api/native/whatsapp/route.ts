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
import { hashPhone, normalizePhone } from "@/lib/whatsapp/signature";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { reportServerError } from "@/lib/error-tracking/report-server";

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
      .maybeSingle();
    if (!link) return NextResponse.json({ status: "unlinked" });
    if (!link.verified_at) return NextResponse.json({ status: "pending", phone: link.phone_number });
    return NextResponse.json({ status: "linked", phone: link.phone_number });
  }

  // ── request OTP ───────────────────────────────────────────────────────
  if (body.action === "request") {
    const rawPhone = body.phone?.trim();
    if (!rawPhone) return NextResponse.json({ error: "Numero obrigatorio" }, { status: 400 });
    const phone = normalizePhone(rawPhone);
    const hash = hashPhone(phone);
    if (!/^\+\d{10,15}$/.test(phone)) {
      return NextResponse.json({ error: "Formato invalido. Use +55DDNNNNNNNNN" }, { status: 400 });
    }

    // Reject if linked to another user
    const { data: existing } = await admin
      .from("whatsapp_phone_links")
      .select("id, user_id, verified_at")
      .eq("phone_hash", hash)
      .eq("is_active", true)
      .maybeSingle();
    if (existing && existing.user_id !== userId && existing.verified_at) {
      return NextResponse.json({ error: "Este numero ja esta vinculado a outra conta" }, { status: 409 });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (existing && existing.user_id === userId) {
      await admin
        .from("whatsapp_phone_links")
        .update({ verification_code: otp, verification_expires_at: expiresAt, verified_at: null })
        .eq("id", existing.id);
    } else {
      await admin.from("whatsapp_phone_links").delete().eq("user_id", userId).is("verified_at", null);
      await admin.from("whatsapp_phone_links").insert({
        user_id: userId,
        phone_number: phone,
        phone_hash: hash,
        verification_code: otp,
        verification_expires_at: expiresAt,
        is_active: true,
        lgpd_consent_at: new Date().toISOString(),
      });
    }

    const phoneWithout = phone.replace("+", "");
    try {
      await sendTextMessage(
        phoneWithout,
        `Kindar - Codigo de verificacao: *${otp}*\n\nDigite este codigo no app para vincular seu WhatsApp.\n\nExpira em 10 minutos.`
      );
    } catch (err) {
      reportServerError(err, { filePath: "src/app/api/native/whatsapp/route.ts" });
      try {
        await sendTemplateMessage(phoneWithout, "hello_world", "en_US");
      } catch {
        // Both channels failed
      }
      return NextResponse.json(
        { error: "Nao foi possivel enviar o codigo. Verifique o numero." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, phone });
  }

  // ── verify OTP ────────────────────────────────────────────────────────
  if (body.action === "verify") {
    const otp = body.otp?.trim();
    if (!otp || otp.length !== 6) return NextResponse.json({ error: "Codigo deve ter 6 digitos" }, { status: 400 });

    const { data: link } = await admin
      .from("whatsapp_phone_links")
      .select("id, verification_code, verification_expires_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("verified_at", null)
      .maybeSingle();
    if (!link) return NextResponse.json({ error: "Nenhuma vinculacao pendente encontrada" }, { status: 404 });
    if (link.verification_code !== otp) return NextResponse.json({ error: "Codigo incorreto" }, { status: 400 });
    if (new Date(link.verification_expires_at) < new Date()) {
      return NextResponse.json({ error: "Codigo expirado. Solicite um novo." }, { status: 400 });
    }

    await admin
      .from("whatsapp_phone_links")
      .update({ verified_at: new Date().toISOString(), verification_code: null, verification_expires_at: null })
      .eq("id", link.id);

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
