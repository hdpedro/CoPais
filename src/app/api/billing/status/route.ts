import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGroupSubscription,
  getPrimaryGroupId,
  trialDaysRemaining,
  canStartSubscription,
} from "@/lib/billing";
import { getEarlyBirdStatus } from "@/lib/billing/early-bird";

/**
 * Cross-platform billing source of truth.
 *
 * Clients (PWA server components, iOS nativo via fetch, Android nativo
 * via fetch) call this to learn what the user's group can access right
 * now. Response is intentionally flat and JSON-friendly so the native
 * apps can deserialize without importing TS types.
 *
 * Query params:
 *   ?groupId=uuid  optional — defaults to user's primary group
 *
 * Auth: requires a logged-in Supabase session (Authorization header
 * from the native app, cookie from the web).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedGroupId = req.nextUrl.searchParams.get("groupId");
  const groupId = requestedGroupId ?? (await getPrimaryGroupId(supabase, user.id));

  if (!groupId) {
    // User has no group yet — return a free placeholder so clients can
    // render the "create group first" state without erroring.
    return NextResponse.json({
      groupId: null,
      tier: "free",
      planId: "free",
      status: "none",
      isActive: false,
      isTrial: false,
      trialDaysRemaining: 0,
      trialEnd: null,
      canPay: false,
      earlyBird: await getEarlyBirdStatus(),
    });
  }

  const [subscription, payerCheck] = await Promise.all([
    getGroupSubscription(supabase, groupId),
    canStartSubscription(supabase, user.id, groupId),
  ]);

  // Pull auto-split fields directly from `subscriptions` — the
  // v_group_active_subscription view doesn't expose them. Best-effort: if
  // there's no active subscription this is a no-op.
  let autoSplit = false;
  let autoSplitCoUserId: string | null = null;
  let autoSplitCoShare: number | null = null;
  if (subscription.subscriptionId) {
    const { data: splitRow } = await supabase
      .from("subscriptions")
      .select("auto_split, auto_split_co_user_id, auto_split_co_share")
      .eq("id", subscription.subscriptionId)
      .maybeSingle();
    if (splitRow) {
      autoSplit = Boolean(splitRow.auto_split);
      autoSplitCoUserId = splitRow.auto_split_co_user_id ?? null;
      autoSplitCoShare = splitRow.auto_split_co_share ?? null;
    }
  }

  return NextResponse.json({
    groupId,
    tier: subscription.tier,
    planId: subscription.planId,
    status: subscription.status,
    isActive: subscription.isActive,
    isTrial: subscription.isTrial,
    trialDaysRemaining: trialDaysRemaining(subscription.trialEnd),
    trialEnd: subscription.trialEnd,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    paymentProvider: subscription.paymentProvider,
    payerUserId: subscription.payerUserId,
    // Can THIS user start/manage a sub for this group? Grandparents,
    // lawyers, mediators and caregivers will get canPay=false and see
    // a "managed by [payer]" UI instead of a checkout button.
    canPay: payerCheck.allowed,
    payerReason: payerCheck.reason,
    earlyBird: await getEarlyBirdStatus(),
    // Auto-split (PWA-only feature historically; native consumes via
    // /api/subscription/split). Only meaningful when isActive && !isTrial.
    autoSplit,
    autoSplitCoUserId,
    autoSplitCoShare,
  });
}
