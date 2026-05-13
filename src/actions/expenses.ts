"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  createExpense as createExpenseService,
  updateExpenseStatus as updateExpenseStatusService,
  deleteExpense as deleteExpenseService,
  editExpense as editExpenseService,
  requestCancelExpense as requestCancelExpenseService,
  respondToCancelRequest as respondToCancelRequestService,
  reopenApproval as reopenApprovalService,
} from "@/lib/services/expenses";
import type { CollabPriority } from "@/lib/services/collab";

/** Valida e converte a priority vinda de FormData. */
const VALID_PRIORITIES: CollabPriority[] = ["info", "important", "urgent"];
function parsePriority(raw: FormDataEntryValue | null): CollabPriority | undefined {
  if (typeof raw !== "string") return undefined;
  return (VALID_PRIORITIES as string[]).includes(raw) ? (raw as CollabPriority) : undefined;
}

/** Display name pro push title — usa primeiro nome do profile. */
async function resolveActorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export async function createExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = (formData.get("childId") as string) || null;
  const category = (formData.get("category") as string) || "other";
  const description = (formData.get("description") as string) || "";
  const amount = parseFloat(formData.get("amount") as string);
  const expenseDate = formData.get("expenseDate") as string;
  const splitRatioRaw = formData.get("splitRatio") as string;
  const receiptFile = formData.get("receipt") as File | null;

  // Upload receipt to Supabase Storage if provided. The service does NOT
  // handle binary uploads — that's HTTP-specific and stays in the wrapper.
  let receiptUrl: string | null = null;
  if (receiptFile && receiptFile.size > 0) {
    const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB
    if (receiptFile.size > MAX_RECEIPT_SIZE) {
      redirect(
        "/despesas/nova?error=" +
          encodeURIComponent("Comprovante muito grande. Maximo 5MB."),
      );
    }
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(receiptFile.type)) {
      redirect(
        "/despesas/nova?error=" +
          encodeURIComponent(
            "Tipo de arquivo nao permitido. Use JPG, PNG, WebP, HEIC ou PDF.",
          ),
      );
    }

    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const ext = receiptFile.name.split(".").pop() || "jpg";
    const fileName = `${groupId}/${Date.now()}-receipt.${ext}`;
    const { error: uploadError } = await adminClient.storage
      .from("receipts")
      .upload(fileName, receiptFile);

    if (uploadError) {
      redirect(
        "/despesas/nova?error=" +
          encodeURIComponent("Erro ao enviar comprovante: " + uploadError.message),
      );
    }

    // After migration 062: store the storage path only. Reads sign URLs at
    // render time via getSignedFileUrl().
    receiptUrl = fileName;
  }

  let splitRatio: Record<string, number> | null = null;
  if (splitRatioRaw) {
    try {
      splitRatio = JSON.parse(splitRatioRaw);
    } catch {
      // Invalid JSON: service falls back to default split.
    }
  }

  const result = await createExpenseService(supabase, {
    groupId,
    paidBy: user.id,
    description,
    amount,
    category,
    expenseDate,
    childId,
    splitRatio,
    receiptUrl,
    priority: parsePriority(formData.get("priority")),
    origin: "pwa",
    actorDisplayName: await resolveActorName(supabase, user.id),
  });

  if (!result.ok) {
    redirect("/despesas/nova?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/despesas");
  redirect(
    "/despesas?success=" + encodeURIComponent("Despesa registrada com sucesso!"),
  );
}

export async function updateExpenseStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenseId = formData.get("expenseId") as string;
  const status = formData.get("status") as "approved" | "rejected" | "pending";
  const rejectionReason =
    ((formData.get("rejectionReason") as string) || "").trim() || null;

  const result = await updateExpenseStatusService(supabase, {
    expenseId,
    reviewerId: user.id,
    status,
    rejectionReason,
  });

  if (!result.ok) {
    redirect("/despesas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/despesas");
  redirect("/despesas");
}

export async function deleteExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenseId = formData.get("expenseId") as string;

  const result = await deleteExpenseService(supabase, {
    expenseId,
    requesterId: user.id,
  });

  if (!result.ok) {
    redirect("/despesas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/despesas");
  redirect(
    "/despesas?success=" + encodeURIComponent("Despesa excluida com sucesso."),
  );
}

/* ------------------------------------------------------------------ */
/* Edit / Cancel / Reopen — wire pra services + revalidate paths       */
/* ------------------------------------------------------------------ */

/** Edita uma despesa. Aceita patch parcial — só campos enviados são alterados. */
export async function editExpense(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const expenseId = formData.get("expenseId") as string;
  if (!expenseId) return { success: false, error: "expenseId obrigatório." };

  // Patch parcial — só inclui campos que vieram. Boolean precision:
  // formData.has() distingue "campo não enviado" de "campo enviado vazio".
  const patch: Record<string, unknown> = {};
  if (formData.has("description")) patch.description = formData.get("description") as string;
  if (formData.has("amount")) {
    const n = parseFloat(formData.get("amount") as string);
    if (Number.isFinite(n)) patch.amount = n;
  }
  if (formData.has("category")) patch.category = formData.get("category") as string;
  if (formData.has("expenseDate")) patch.expenseDate = formData.get("expenseDate") as string;
  if (formData.has("childId")) {
    const v = formData.get("childId") as string;
    patch.childId = v || null;
  }
  if (formData.has("priority")) {
    const p = parsePriority(formData.get("priority"));
    if (p) patch.priority = p;
  }

  const result = await editExpenseService(supabase, {
    expenseId,
    actorId: user.id,
    patch: patch as Parameters<typeof editExpenseService>[1]["patch"],
    actorDisplayName: await resolveActorName(supabase, user.id),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Pede cancelamento. Pending/rejected → cancela direto; approved → cancel_pending. */
export async function requestCancelExpense(formData: FormData): Promise<{ success: boolean; error?: string; status?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const expenseId = formData.get("expenseId") as string;
  const reason = ((formData.get("reason") as string) || "").trim();

  const result = await requestCancelExpenseService(supabase, {
    expenseId,
    actorId: user.id,
    reason,
    actorDisplayName: await resolveActorName(supabase, user.id),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  return { success: true, status: result.data.status };
}

/** Reviewer responde ao pedido de cancel (approved=true confirma; false restaura). */
export async function respondToCancelRequest(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const expenseId = formData.get("expenseId") as string;
  const approved = formData.get("approved") === "true";
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  const result = await respondToCancelRequestService(supabase, {
    expenseId,
    reviewerId: user.id,
    approved,
    reason,
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Reabre uma despesa aprovada (janela 24h, só o approver original). */
export async function reopenApproval(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const expenseId = formData.get("expenseId") as string;
  const reason = ((formData.get("reason") as string) || "").trim();

  const result = await reopenApprovalService(supabase, {
    expenseId,
    actorId: user.id,
    reason,
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Mark expense as read — chamado APENAS quando user explicitamente abre
 * o detalhe da despesa (CLAUDE.md "Collaborative Records"). Idempotente
 * via PK em collab_reads.
 */
export async function markExpenseRead(expenseId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const { error } = await supabase.rpc("mark_collab_read", {
    p_record_type: "expense",
    p_record_id: expenseId,
  });
  if (error) return { success: false, error: error.message };

  captureServerEvent(user.id, "expense_read", { expense_id: expenseId });
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  return { success: true };
}
