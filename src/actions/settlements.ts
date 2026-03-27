"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";

export async function createSettlement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const paidTo = formData.get("paidTo") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const paymentMethod = formData.get("paymentMethod") as string || "pix";
  const referenceNote = (formData.get("referenceNote") as string)?.trim();
  const settlementDate = formData.get("settlementDate") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Validate amount
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
    redirect("/financeiro?error=" + encodeURIComponent("Valor invalido."));
  }

  // Validate that paidTo is also a group member
  const paidToMembership = await verifyGroupMembership(supabase, groupId, paidTo);
  if (!paidToMembership) {
    redirect("/financeiro?error=" + encodeURIComponent("Destinatario nao pertence a este grupo."));
  }

  // Cannot pay yourself
  if (paidTo === user.id) {
    redirect("/financeiro?error=" + encodeURIComponent("Voce nao pode registrar pagamento para si mesmo."));
  }

  // Server-side balance check: prevent settlement exceeding actual balance owed
  const [{ data: approvedExpenses }, { data: confirmedSettlements }] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount, paid_by, split_ratio")
      .eq("group_id", groupId)
      .eq("status", "approved"),
    supabase
      .from("settlements")
      .select("amount, paid_by, paid_to, status")
      .eq("group_id", groupId)
      .eq("status", "confirmed"),
  ]);

  // Compute net balance: how much does user.id owe paidTo?
  let userShouldPay = 0;
  let userActuallyPaid = 0;
  (approvedExpenses || []).forEach((e) => {
    const splitRatio = e.split_ratio as Record<string, number> | null;
    const userShare = splitRatio && splitRatio[user.id] !== undefined
      ? (splitRatio[user.id] / 100) * Number(e.amount)
      : Number(e.amount) / 2;
    userShouldPay += userShare;
    if (e.paid_by === user.id) {
      userActuallyPaid += Number(e.amount);
    }
  });

  // Account for existing confirmed settlements
  let settlementAdjustment = 0;
  (confirmedSettlements || []).forEach((s) => {
    if (s.paid_by === user.id && s.paid_to === paidTo) {
      settlementAdjustment += Number(s.amount);
    } else if (s.paid_by === paidTo && s.paid_to === user.id) {
      settlementAdjustment -= Number(s.amount);
    }
  });

  // Balance owed by user to paidTo = userShouldPay - userActuallyPaid + settlementAdjustment
  // If positive, user owes money to paidTo
  const balanceOwed = Math.round((userShouldPay - userActuallyPaid + settlementAdjustment) * 100) / 100;
  const TOLERANCE = 0.01;
  if (amount > balanceOwed + TOLERANCE) {
    redirect("/financeiro?error=" + encodeURIComponent(
      `Valor excede o saldo devedor. Saldo atual: R$ ${Math.max(0, balanceOwed).toFixed(2)}.`
    ));
  }

  const { error } = await supabase.from("settlements").insert({
    group_id: groupId,
    paid_by: user.id,
    paid_to: paidTo,
    amount,
    payment_method: paymentMethod,
    reference_note: referenceNote || null,
    settlement_date: settlementDate || new Date().toISOString().split("T")[0],
  });

  if (error) {
    redirect("/financeiro?error=" + encodeURIComponent(error.message));
  }

  captureServerEvent(user.id, "settlement_created", {
    amount,
    payment_method: paymentMethod,
    group_id: groupId,
  });

  // Send push notification to recipient
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguem";

    await createNotificationWithPush(
      paidTo,
      "settlement_created",
      "Pagamento Registrado 💸",
      `${senderName} registrou um pagamento de R$ ${amount.toFixed(2)} para voce. Confirme o recebimento.`,
      "/financeiro"
    );
  } catch {
    // Push failure should never break the flow
  }

  revalidatePath("/financeiro");
  redirect("/financeiro?success=" + encodeURIComponent("Pagamento registrado com sucesso."));
}

export async function confirmSettlement(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settlementId = formData.get("settlementId") as string;

  // Fetch the settlement
  const { data: settlement } = await supabase
    .from("settlements")
    .select("group_id, paid_to, status")
    .eq("id", settlementId)
    .single();

  if (!settlement) {
    redirect("/financeiro?error=" + encodeURIComponent("Pagamento nao encontrado."));
  }

  // Verify user belongs to the settlement's group
  const membership = await verifyGroupMembership(supabase, settlement.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Only the recipient can confirm
  if (settlement.paid_to !== user.id) {
    redirect("/financeiro?error=" + encodeURIComponent("Apenas o destinatario pode confirmar o recebimento."));
  }

  // Only pending settlements can be confirmed
  if (settlement.status !== "pending") {
    redirect("/financeiro?error=" + encodeURIComponent("Este pagamento ja foi processado."));
  }

  const { error } = await supabase
    .from("settlements")
    .update({
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId);

  if (error) {
    redirect("/financeiro?error=" + encodeURIComponent(error.message));
  }

  captureServerEvent(user.id, "settlement_confirmed", {
    settlement_id: settlementId,
    group_id: settlement.group_id,
  });

  // Send push notification to the payer that their payment was confirmed
  try {
    // Fetch full settlement for paid_by
    const { data: fullSettlement } = await supabase
      .from("settlements")
      .select("paid_by, amount")
      .eq("id", settlementId)
      .single();

    if (fullSettlement?.paid_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const confirmerName = profile?.full_name?.split(" ")[0] || "Alguem";
      const amountValue = Number(fullSettlement.amount);

      await createNotificationWithPush(
        fullSettlement.paid_by,
        "settlement_confirmed",
        "Pagamento Confirmado ✅",
        `${confirmerName} confirmou o recebimento de R$ ${Number.isFinite(amountValue) ? amountValue.toFixed(2) : "0.00"}.`,
        "/financeiro"
      );
    }
  } catch {
    // Push failure should never break the flow
  }

  revalidatePath("/financeiro");
  redirect("/financeiro?success=" + encodeURIComponent("Pagamento confirmado com sucesso."));
}
