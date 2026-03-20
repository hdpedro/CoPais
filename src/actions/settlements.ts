"use server";

import { redirect } from "next/navigation";
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
  const referenceNote = formData.get("referenceNote") as string;
  const settlementDate = formData.get("settlementDate") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0 || !isFinite(amount) || amount > 999999.99) {
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

    if (fullSettlement) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const confirmerName = profile?.full_name?.split(" ")[0] || "Alguem";

      await createNotificationWithPush(
        fullSettlement.paid_by,
        "settlement_confirmed",
        "Pagamento Confirmado ✅",
        `${confirmerName} confirmou o recebimento de R$ ${Number(fullSettlement.amount).toFixed(2)}.`,
        "/financeiro"
      );
    }
  } catch {
    // Push failure should never break the flow
  }

  redirect("/financeiro?success=" + encodeURIComponent("Pagamento confirmado com sucesso."));
}
