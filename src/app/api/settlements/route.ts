/**
 * POST   /api/settlements          → create a new settlement
 * PATCH  /api/settlements          → confirm an existing settlement (paid_to only)
 *
 * Native-callable wrappers around the PWA server actions in
 * `src/actions/settlements.ts`. The full balance check, role gates and
 * push notifications live here so native clients stop reimplementing
 * money math (financial-correctness P0). Returns JSON; never redirects.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const paidTo = body.paidTo as string | undefined;
  const amount = Number(body.amount);
  const paymentMethod = (body.paymentMethod as string | undefined) || "pix";
  const referenceNote = ((body.referenceNote as string | undefined) || "").trim();
  const settlementDate = body.settlementDate as string | undefined;

  if (!groupId || !paidTo) {
    return NextResponse.json({ error: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  if (paidTo === user.id) {
    return NextResponse.json(
      { error: "Você não pode registrar pagamento para si mesmo." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify both parties belong to the group
  const { data: memberships } = await admin
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", groupId)
    .in("user_id", [user.id, paidTo]);

  const userMembership = memberships?.find((m) => m.user_id === user.id);
  const paidToMembership = memberships?.find((m) => m.user_id === paidTo);

  if (!userMembership) {
    return NextResponse.json({ error: "Sem permissão para este grupo." }, { status: 403 });
  }
  if (!paidToMembership) {
    return NextResponse.json(
      { error: "Destinatário não pertence a este grupo." },
      { status: 400 },
    );
  }

  // Server-side balance check — same algorithm as src/actions/settlements.ts
  const [{ data: approvedExpenses }, { data: confirmedSettlements }] = await Promise.all([
    admin
      .from("expenses")
      .select("amount, paid_by, split_ratio")
      .eq("group_id", groupId)
      .eq("status", "approved"),
    admin
      .from("settlements")
      .select("amount, paid_by, paid_to, status")
      .eq("group_id", groupId)
      .eq("status", "confirmed"),
  ]);

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

  let settlementAdjustment = 0;
  (confirmedSettlements || []).forEach((s) => {
    if (s.paid_by === user.id && s.paid_to === paidTo) {
      settlementAdjustment += Number(s.amount);
    } else if (s.paid_by === paidTo && s.paid_to === user.id) {
      settlementAdjustment -= Number(s.amount);
    }
  });

  const balanceOwed =
    Math.round((userShouldPay - userActuallyPaid + settlementAdjustment) * 100) / 100;
  const TOLERANCE = 0.01;
  if (amount > balanceOwed + TOLERANCE) {
    return NextResponse.json(
      {
        error: `Valor excede o saldo devedor. Saldo atual: R$ ${Math.max(0, balanceOwed).toFixed(2)}.`,
      },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await admin
    .from("settlements")
    .insert({
      group_id: groupId,
      paid_by: user.id,
      paid_to: paidTo,
      amount,
      payment_method: paymentMethod,
      reference_note: referenceNote || null,
      settlement_date: settlementDate || new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "settlement_created", {
    amount,
    payment_method: paymentMethod,
    group_id: groupId,
  });

  // Push (non-blocking)
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguém";
    await createNotificationWithPush(
      paidTo,
      "settlement_created",
      "Pagamento Registrado 💸",
      `${senderName} registrou um pagamento de R$ ${amount.toFixed(2)} para você. Confirme o recebimento.`,
      "/financeiro",
    );
  } catch {
    // ignore
  }

  revalidateTag(`finance-${groupId}`, "max");
  return NextResponse.json({ success: true, id: inserted?.id });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const settlementId = body.settlementId as string | undefined;
  if (!settlementId) {
    return NextResponse.json({ error: "settlementId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: settlement } = await admin
    .from("settlements")
    .select("id, group_id, paid_by, paid_to, amount, status")
    .eq("id", settlementId)
    .single();

  if (!settlement) {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }

  // Recipient-only confirmation
  if (settlement.paid_to !== user.id) {
    return NextResponse.json(
      { error: "Apenas o destinatário pode confirmar o recebimento." },
      { status: 403 },
    );
  }

  if (settlement.status !== "pending") {
    return NextResponse.json(
      { error: "Este pagamento já foi processado." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("settlements")
    .update({
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "settlement_confirmed", {
    settlement_id: settlementId,
    group_id: settlement.group_id,
  });

  // Push to payer (non-blocking)
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const confirmerName = profile?.full_name?.split(" ")[0] || "Alguém";
    const amountValue = Number(settlement.amount);
    await createNotificationWithPush(
      settlement.paid_by,
      "settlement_confirmed",
      "Pagamento Confirmado ✅",
      `${confirmerName} confirmou o recebimento de R$ ${
        Number.isFinite(amountValue) ? amountValue.toFixed(2) : "0.00"
      }.`,
      "/financeiro",
    );
  } catch {
    // ignore
  }

  revalidateTag(`finance-${settlement.group_id}`, "max");
  return NextResponse.json({ success: true });
}
