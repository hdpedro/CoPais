"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import {
  canStartSubscription,
  getGroupSubscription,
  createSplitExpenseForPeriod,
  computeCoShareAmount,
} from "@/lib/billing";

/**
 * Turns on auto-split for an active subscription and creates the first
 * split expense immediately so the co-responsible sees it in Despesas
 * right away. Subsequent renewals will be handled by the Stripe /
 * RevenueCat webhooks.
 *
 * Permissions: only the CURRENT payer of the subscription can enable
 * split. We don't let "any parent in the group" toggle it because the
 * payer is the one being billed — they decide if they want reimbursement.
 */
export async function enableSubscriptionSplit(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const groupId = formData.get("groupId") as string;
  const coUserId = formData.get("coUserId") as string;
  const coShareRaw = formData.get("coSharePercent") as string | null;
  const coSharePercent = coShareRaw ? parseInt(coShareRaw, 10) : 50;

  if (!groupId || !coUserId) return { error: "Dados incompletos." };
  if (coSharePercent <= 0 || coSharePercent >= 100) {
    return { error: "Percentual inválido (deve estar entre 1 e 99)." };
  }
  if (coUserId === user.id) {
    return { error: "Você não pode dividir com você mesmo." };
  }

  // Only the active payer can toggle split on their own sub.
  const payerCheck = await canStartSubscription(supabase, user.id, groupId);
  if (!payerCheck.allowed) {
    return { error: "Apenas o responsável que paga pode dividir a assinatura." };
  }

  const subscription = await getGroupSubscription(supabase, groupId);
  if (!subscription.isActive || !subscription.subscriptionId) {
    return { error: "Nenhuma assinatura ativa para dividir." };
  }
  if (subscription.payerUserId !== user.id) {
    return { error: "Só quem assina pode ativar a divisão." };
  }
  // Trial subs can't be split (no money has changed hands yet).
  if (subscription.isTrial) {
    return { error: "Assine um plano primeiro — durante a degustação não há cobrança para dividir." };
  }

  // Verify the co-user is actually a member of the group with parent role.
  const [{ data: coMembership }, { data: coProfile }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", coUserId)
      .maybeSingle(),
    supabase.from("profiles").select("role, full_name").eq("id", coUserId).maybeSingle(),
  ]);

  if (!coMembership) return { error: "Co-responsável não encontrado neste grupo." };
  if (coProfile?.role !== "parent") {
    return { error: "Só é possível dividir com outro responsável legal (não com avós, advogados, etc)." };
  }

  // Flip the flag + record the counterparty. Use admin client so the
  // trigger/RLS doesn't block field updates from a 'parent' member.
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      auto_split: true,
      auto_split_co_user_id: coUserId,
      auto_split_co_share: coSharePercent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.subscriptionId);

  if (updateError) return { error: "Falha ao ativar divisão: " + updateError.message };

  // Create the first split expense for the current period so the co
  // sees it immediately. Renewals are handled by the Stripe webhook.
  const periodStart = subscription.currentPeriodEnd
    ? computePeriodStart(subscription.currentPeriodEnd, subscription.planId)
    : new Date().toISOString().slice(0, 10);

  const split = await createSplitExpenseForPeriod(admin, {
    subscriptionId: subscription.subscriptionId,
    groupId,
    payerUserId: user.id,
    coUserId,
    coSharePercent,
    planId: subscription.planId,
    periodStart,
  });

  // Non-fatal: the flag is on and future renewals will create expenses
  // even if this first one failed for some reason.
  if (split.created) {
    const coShare = computeCoShareAmount(subscription.planId, coSharePercent) ?? 0;
    const { data: payerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const payerName = payerProfile?.full_name?.split(" ")[0] || "o responsável";

    // Fire notification + chat ping in parallel. Both helpers have
    // internal try/catch so a transient failure (push disabled, chat
    // channel missing) doesn't roll back the DB writes above.
    const coShareStr = coShare.toFixed(2).replace(".", ",");
    await Promise.allSettled([
      createNotificationWithPush(
        coUserId,
        "subscription_split_enabled",
        "Assinatura Kindar dividida",
        `${payerName} está dividindo o Kindar com você — R$ ${coShareStr}/mês`,
        "/despesas"
      ),
      postChatNotification(
        admin,
        groupId,
        user.id,
        `💛 Assinatura Kindar dividida — ${payerName} convidou para rachar R$${coShareStr}/mês`
      ),
    ]);
  }

  captureServerEvent(user.id, "subscription_split_enabled", {
    group_id: groupId,
    co_share: coSharePercent,
  });

  revalidatePath("/assinatura");
  revalidatePath("/despesas");
  return { success: true };
}

export async function disableSubscriptionSplit(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const groupId = formData.get("groupId") as string;
  if (!groupId) return { error: "Grupo não informado." };

  const subscription = await getGroupSubscription(supabase, groupId);
  if (!subscription.isActive || subscription.payerUserId !== user.id) {
    return { error: "Apenas quem paga pode desativar a divisão." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      auto_split: false,
      auto_split_co_user_id: null,
      auto_split_co_share: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.subscriptionId);

  if (error) return { error: "Falha ao desativar divisão: " + error.message };

  captureServerEvent(user.id, "subscription_split_disabled", { group_id: groupId });
  revalidatePath("/assinatura");
  return { success: true };
}

/**
 * Best-effort computation of the period start from period_end. Monthly
 * plans = period_end minus ~30 days; annual = minus ~365 days. Exact
 * math would require knowing the checkout anchor, but for the expense
 * description/period tagging this approximation is fine.
 */
function computePeriodStart(periodEndIso: string, planId: string): string {
  const end = new Date(periodEndIso);
  const days = planId.includes("annual") ? 365 : 30;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}
