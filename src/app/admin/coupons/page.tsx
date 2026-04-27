import { createAdminClient } from "@/lib/supabase/admin";
import CouponsClient from "./CouponsClient";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("coupons")
    .select(
      "id, code, description, amount_off_brl, percent_off, duration, duration_months, max_redemptions, current_redemptions, expires_at, applicable_plan_ids, stripe_coupon_id, stripe_promotion_code_id, is_active, created_at, notes"
    )
    .order("created_at", { ascending: false });

  return <CouponsClient initialCoupons={data ?? []} />;
}
