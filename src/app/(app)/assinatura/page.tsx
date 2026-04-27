import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getGroupSubscription,
  getPrimaryGroupId,
  canStartSubscription,
  getEarlyBirdStatus,
  trialDaysRemaining,
  computeCoShareAmount,
  EARLY_BIRD_MONTHLY_PLAN,
} from "@/lib/billing";
import AssinaturaClient from "./AssinaturaClient";

export default async function AssinaturaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = await getPrimaryGroupId(supabase, user.id);
  if (!groupId) {
    redirect("/dashboard?error=" + encodeURIComponent("Crie um grupo antes de gerenciar a assinatura."));
  }

  const [subscription, payerCheck, earlyBird, profileRes] = await Promise.all([
    getGroupSubscription(supabase, groupId),
    canStartSubscription(supabase, user.id, groupId),
    getEarlyBirdStatus(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  // Look up payer's display name only if the viewer isn't the payer
  // themselves — used in "managed by X" copy.
  let payerName: string | null = null;
  if (subscription.isActive && subscription.payerUserId && subscription.payerUserId !== user.id) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", subscription.payerUserId)
      .maybeSingle();
    payerName = data?.full_name ?? null;
  }

  // Split — find eligible co-responsible (another parent in the group)
  // + current split state on the subscription row.
  let coCandidates: Array<{ userId: string; fullName: string }> = [];
  let splitState: { enabled: boolean; coUserId: string | null; coSharePercent: number; coShareAmount: number } = {
    enabled: false,
    coUserId: null,
    coSharePercent: 50,
    coShareAmount: 0,
  };

  if (payerCheck.allowed && subscription.isActive && !subscription.isTrial) {
    const { data: candidates } = await supabase
      .from("group_members")
      .select("user_id, profiles:profiles(full_name, role)")
      .eq("group_id", groupId)
      .neq("user_id", user.id);

    coCandidates = (candidates ?? [])
      .filter((m) => {
        const p = m.profiles as unknown as { full_name: string | null; role: string } | null;
        return p?.role === "parent";
      })
      .map((m) => {
        const p = m.profiles as unknown as { full_name: string | null } | null;
        return { userId: m.user_id, fullName: p?.full_name ?? "—" };
      });

    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("auto_split, auto_split_co_user_id, auto_split_co_share")
      .eq("id", subscription.subscriptionId)
      .maybeSingle();

    if (subRow?.auto_split && subRow.auto_split_co_share) {
      splitState = {
        enabled: true,
        coUserId: subRow.auto_split_co_user_id,
        coSharePercent: subRow.auto_split_co_share,
        coShareAmount: computeCoShareAmount(subscription.planId, subRow.auto_split_co_share) ?? 0,
      };
    } else {
      splitState.coShareAmount = computeCoShareAmount(subscription.planId, 50) ?? 0;
    }
  }

  const earlyBirdMonthly = earlyBird.find((e) => e.planId === EARLY_BIRD_MONTHLY_PLAN);

  return (
    <AssinaturaClient
      subscription={{
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        tier: subscription.tier,
        status: subscription.status,
        isActive: subscription.isActive,
        isTrial: subscription.isTrial,
        trialEnd: subscription.trialEnd,
        trialDaysRemaining: trialDaysRemaining(subscription.trialEnd),
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      }}
      groupId={groupId}
      canPay={payerCheck.allowed}
      payerReason={payerCheck.reason}
      payerName={payerName}
      viewerName={profileRes.data?.full_name ?? null}
      earlyBird={{
        slotsRemaining: earlyBirdMonthly?.slotsRemaining ?? 0,
        maxSubscribers: earlyBirdMonthly?.maxSubscribers ?? 1000,
        isSoldOut: earlyBirdMonthly?.isSoldOut ?? false,
      }}
      coCandidates={coCandidates}
      splitState={splitState}
    />
  );
}
