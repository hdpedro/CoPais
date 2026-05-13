/**
 * Native-callable wrapper para `src/lib/services/expenses.ts`.
 *
 * Paridade obrigatória PWA ↔ Nativo (CLAUDE.md "Regra crítica: paridade"):
 *   - POST   /api/expenses                → createExpense
 *   - PATCH  /api/expenses                → editExpense (passa { expenseId, patch })
 *   - PATCH  /api/expenses?action=status  → updateExpenseStatus (approve/reject)
 *   - PATCH  /api/expenses?action=cancel-request → requestCancelExpense
 *   - PATCH  /api/expenses?action=cancel-respond → respondToCancelRequest
 *   - PATCH  /api/expenses?action=reopen  → reopenApproval
 *   - PATCH  /api/expenses?action=read    → markExpenseRead (mark_collab_read RPC)
 *   - DELETE /api/expenses?id=…           → deleteExpense
 *
 * O service faz toda validação de segurança (criador-only pra edit, janela
 * de 24h pra reopen, etc) — esta route é só auth + parsing + delegate.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import {
  createExpense,
  updateExpenseStatus,
  deleteExpense,
  editExpense,
  requestCancelExpense,
  respondToCancelRequest,
  reopenApproval,
} from "@/lib/services/expenses";
import type { CollabPriority } from "@/lib/services/collab";

const VALID_PRIORITIES: CollabPriority[] = ["info", "important", "urgent"];
function parsePriority(raw: unknown): CollabPriority | undefined {
  if (typeof raw !== "string") return undefined;
  return (VALID_PRIORITIES as string[]).includes(raw) ? (raw as CollabPriority) : undefined;
}

async function lookupActorName(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return null;
    if (data.display_name?.trim()) return data.display_name.trim();
    if (data.full_name?.trim()) return data.full_name.trim().split(" ")[0];
    return null;
  } catch {
    return null;
  }
}

function unauthorized() {
  return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
}

/* ------------------------------------------------------------------ */
/* POST — create                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const result = await createExpense(supabase, {
    groupId: body.groupId as string,
    paidBy: user.id,
    description: (body.description as string) || "",
    amount: Number(body.amount),
    category: (body.category as string) || "other",
    expenseDate: (body.expenseDate as string) || new Date().toISOString().split("T")[0],
    childId: (body.childId as string | null) ?? null,
    splitRatio: (body.splitRatio as Record<string, number> | null) ?? null,
    receiptUrl: (body.receiptUrl as string | null) ?? null,
    priority: parsePriority(body.priority),
    origin: "native",
    actorDisplayName: await lookupActorName(supabase, user.id),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidatePath("/despesas");
  return NextResponse.json({ success: true, ...result.data });
}

/* ------------------------------------------------------------------ */
/* PATCH — multiplex via ?action=                                     */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "edit";
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  // Mark as read — endpoint super-leve, sem revalidate (UI atualiza local).
  if (action === "read") {
    const expenseId = body.expenseId as string;
    if (!expenseId) return NextResponse.json({ error: "expenseId obrigatório." }, { status: 400 });
    // Usa o admin client + auth.uid() não está no contexto — chamamos via supabase
    // user-scoped pra que mark_collab_read use a uid certa. Workaround: insert direto
    // na collab_reads via admin client com user.id explícito (RPC depende de auth.uid).
    const { error } = await supabase
      .from("collab_reads")
      .upsert(
        { record_type: "expense", record_id: expenseId, user_id: user.id },
        { onConflict: "record_type,record_id,user_id", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "status") {
    const result = await updateExpenseStatus(supabase, {
      expenseId: body.expenseId as string,
      reviewerId: user.id,
      status: body.status as "approved" | "rejected" | "pending",
      rejectionReason: (body.rejectionReason as string | null) ?? null,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    revalidatePath("/despesas");
    return NextResponse.json({ success: true, ...result.data });
  }

  if (action === "cancel-request") {
    const result = await requestCancelExpense(supabase, {
      expenseId: body.expenseId as string,
      actorId: user.id,
      reason: (body.reason as string) || "",
      actorDisplayName: await lookupActorName(supabase, user.id),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    revalidatePath("/despesas");
    return NextResponse.json({ success: true, ...result.data });
  }

  if (action === "cancel-respond") {
    const result = await respondToCancelRequest(supabase, {
      expenseId: body.expenseId as string,
      reviewerId: user.id,
      approved: body.approved === true,
      reason: (body.reason as string | null) ?? null,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    revalidatePath("/despesas");
    return NextResponse.json({ success: true, ...result.data });
  }

  if (action === "reopen") {
    const result = await reopenApproval(supabase, {
      expenseId: body.expenseId as string,
      actorId: user.id,
      reason: (body.reason as string) || "",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    revalidatePath("/despesas");
    return NextResponse.json({ success: true, ...result.data });
  }

  // Default: edit (campos parciais)
  const result = await editExpense(supabase, {
    expenseId: body.expenseId as string,
    actorId: user.id,
    patch: {
      description: body.description as string | undefined,
      amount: body.amount === undefined ? undefined : Number(body.amount),
      category: body.category as string | undefined,
      expenseDate: body.expenseDate as string | undefined,
      childId: body.childId === undefined ? undefined : ((body.childId as string | null) ?? null),
      priority: parsePriority(body.priority),
    },
    actorDisplayName: await lookupActorName(supabase, user.id),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePath("/despesas");
  return NextResponse.json({ success: true, ...result.data });
}

/* ------------------------------------------------------------------ */
/* DELETE                                                             */
/* ------------------------------------------------------------------ */

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const expenseId = url.searchParams.get("id");
  if (!expenseId) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const supabase = createAdminClient();
  const result = await deleteExpense(supabase, {
    expenseId,
    requesterId: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePath("/despesas");
  return NextResponse.json({ success: true });
}
