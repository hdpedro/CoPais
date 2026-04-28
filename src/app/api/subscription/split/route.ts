/**
 * POST /api/subscription/split    → enable auto-split with coUser
 * DELETE /api/subscription/split  → disable auto-split
 *
 * Native-callable wrappers around `src/actions/subscription-split.ts`.
 * The PWA action is a server action (FormData); native needs JSON Bearer.
 *
 * POST body:
 *   { groupId: string, coUserId: string, coSharePercent?: number  }
 *
 * DELETE body:
 *   { groupId: string }
 *
 * Same gates as the PWA action:
 *   - only the active payer of the group's subscription can toggle
 *   - co-user must be a 'parent' role member
 *   - cannot split with self
 *   - cannot split during trial
 *
 * Side effects on enable: rows in `expenses` (first split for period),
 * one notification + push to coUser, one chat post to the group channel.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import {
  canStartSubscription,
  getGroupSubscription,
  createSplitExpenseForPeriod,
  computeCoShareAmount,
} from "@/lib/billing";

function computePeriodStart(periodEndIso: string, planId: string): string {
  const end = new Date(periodEndIso);
  const days = planId.includes("annual") ? 365 : 30;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const coUserId = body.coUserId as string | undefined;
  const coSharePercent =
    typeof body.coSharePercent === "number" ? body.coSharePercent : 50;

  if (!groupId || !coUserId) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (coSharePercent <= 0 || coSharePercent >= 100) {
    return NextResponse.json(
      { error: "Percentual inválido (deve estar entre 1 e 99)." },
      { status: 400 },
    );
  }
  if (coUserId === user.id) {
    return NextResponse.json(
      { error: "Você não pode dividir com você mesmo." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const payerCheck = await canStartSubscription(supabase, user.id, groupId);
  if (!payerCheck.allowed) {
    return NextResponse.json(
      { error: "Apenas o responsável que paga pode dividir a assinatura." },
      { status: 403 },
    );
  }

  const subscription = await getGroupSubscription(supabase, groupId);
  if (!subscription.isActive || !subscription.subscriptionId) {
    return NextResponse.json(
      { error: "Nenhuma assinatura ativa para dividir." },
      { status: 400 },
    );
  }
  if (subscription.payerUserId !== user.id) {
    return NextResponse.json(
      { error: "Só quem assina pode ativar a divisão." },
      { status: 403 },
    );
  }
  if (subscription.isTrial) {
    return NextResponse.json(
      {
        error:
          "Assine um plano primeiro — durante a degustação não há cobrança para dividir.",
      },
      { status: 400 },
    );
  }

  const [{ data: coMembership }, { data: coProfile }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", coUserId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", coUserId)
      .maybeSingle(),
  ]);

  if (!coMembership) {
    return NextResponse.json(
      { error: "Co-responsável não encontrado neste grupo." },
      { status: 400 },
    );
  }
  if (coProfile?.role !== "parent") {
    return NextResponse.json(
      {
        error:
          "Só é possível dividir com outro responsável legal (não com avós, advogados, etc).",
      },
      { status: 400 },
    );
  }

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

  if (updateError) {
    return NextResponse.json(
      { error: "Falha ao ativar divisão: " + updateError.message },
      { status: 500 },
    );
  }

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

  if (split.created) {
    const coShare = computeCoShareAmount(subscription.planId, coSharePercent) ?? 0;
    const { data: payerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const payerName =
      payerProfile?.full_name?.split(" ")[0] || "o responsável";

    const coShareStr = coShare.toFixed(2).replace(".", ",");
    await Promise.allSettled([
      createNotificationWithPush(
        coUserId,
        "subscription_split_enabled",
        "Assinatura Kindar dividida",
        `${payerName} está dividindo o Kindar com você — R$ ${coShareStr}/mês`,
        "/despesas",
      ),
      postChatNotification(
        admin,
        groupId,
        user.id,
        `💛 Assinatura Kindar dividida — ${payerName} convidou para rachar R$${coShareStr}/mês`,
      ),
    ]);
  }

  captureServerEvent(user.id, "subscription_split_enabled", {
    group_id: groupId,
    co_share: coSharePercent,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  if (!groupId) {
    return NextResponse.json({ error: "Grupo não informado." }, { status: 400 });
  }

  const supabase = await createClient();
  const subscription = await getGroupSubscription(supabase, groupId);
  if (!subscription.isActive || subscription.payerUserId !== user.id) {
    return NextResponse.json(
      { error: "Apenas quem paga pode desativar a divisão." },
      { status: 403 },
    );
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

  if (error) {
    return NextResponse.json(
      { error: "Falha ao desativar divisão: " + error.message },
      { status: 500 },
    );
  }

  captureServerEvent(user.id, "subscription_split_disabled", {
    group_id: groupId,
  });

  return NextResponse.json({ success: true });
}
