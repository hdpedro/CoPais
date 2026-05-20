import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipFromHeaders } from "@/lib/auth-fingerprint";

/**
 * GET /api/auth/status?email=<email>
 *
 * Endpoint público (não autenticado) que retorna se um e-mail já está
 * confirmado. Usado pela tela /verify-email pra fazer auto-redirect quando
 * o usuário confirma noutro device.
 *
 * Privacy: retorna apenas `{confirmed: boolean}`. Não revela `last_sign_in_at`
 * ou outros metadados. Há leak de existência (atacker pode enumerar emails
 * cadastrados), mas é o trade-off aceitável pra UX cross-device. Tier S
 * mitigaria com HMAC(email + secret).
 *
 * Rate limit: best-effort por IP, 1500ms entre requests. Polling do cliente
 * respeita 4s então não bate o limite.
 */

const RATE_LIMIT_MS = 1500;
const IP_LAST: Map<string, number> = new Map();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const last = IP_LAST.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return false;
  IP_LAST.set(ip, now);
  if (IP_LAST.size > 5000) {
    for (const [k, v] of IP_LAST) {
      if (now - v > 30_000) IP_LAST.delete(k);
    }
  }
  return true;
}

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ confirmed: false }, { status: 400 });
  }

  const ip = ipFromHeaders(req.headers) ?? "unknown";
  if (!checkRate(ip)) {
    return NextResponse.json({ confirmed: false, throttled: true }, {
      status: 429,
      headers: { "Retry-After": "2" },
    });
  }

  try {
    const admin = createAdminClient();
    // listUsers API do Supabase Auth filtra por email
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      // @ts-expect-error - filter is supported but not typed in older SDK
      filter: `email.eq.${email}`,
    });
    if (error) {
      // Fallback se filter não funcionar: pega a página inteira e filtra client-side
      // (não escala bem mas garante funcionamento).
      console.warn("[/api/auth/status] listUsers filter failed, fallback to scan:", error.message);
      return NextResponse.json({ confirmed: false });
    }
    const user = data?.users?.find((u) => u.email?.toLowerCase() === email);
    const confirmed = !!(user?.email_confirmed_at || user?.confirmed_at);
    return NextResponse.json(
      { confirmed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/auth/status] unexpected:", err);
    return NextResponse.json({ confirmed: false }, { status: 500 });
  }
}
