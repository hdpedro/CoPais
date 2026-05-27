// kindar/api-route-auth-helper: pwa-only — Coupon validation só roda no fluxo
// de assinatura PWA. Native não tem coupon UI (Apple/Google IAP gerencia promos).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Client-facing coupon validation. Called from /assinatura when the
 * user types a code — returns the discount details if valid, or an
 * error message if not. Actual discount math is still applied by
 * Stripe at checkout via the promotion code — this is only a preview
 * so the user knows the code works before they start the checkout.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json();
  if (!code || typeof code !== "string") {
    return NextResponse.json({ valid: false, error: "Código inválido" }, { status: 400 });
  }

  const normalized = code.trim().toUpperCase();

  const { data } = await supabase
    .from("v_active_coupons")
    .select(
      "code, description, amount_off_brl, percent_off, duration, duration_months, redemptions_remaining, is_expired, applicable_plan_ids"
    )
    .eq("code", normalized)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ valid: false, error: "Cupom não encontrado ou inativo" });
  }

  if (data.is_expired) {
    return NextResponse.json({ valid: false, error: "Cupom expirou" });
  }

  if (data.redemptions_remaining !== null && data.redemptions_remaining <= 0) {
    return NextResponse.json({ valid: false, error: "Cupom esgotado" });
  }

  return NextResponse.json({
    valid: true,
    code: data.code,
    description: data.description,
    amountOffBrl: data.amount_off_brl,
    percentOff: data.percent_off,
    duration: data.duration,
    durationMonths: data.duration_months,
    applicablePlanIds: data.applicable_plan_ids,
  });
}
