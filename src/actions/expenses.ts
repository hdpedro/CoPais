"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createExpense as createExpenseService,
  updateExpenseStatus as updateExpenseStatusService,
  deleteExpense as deleteExpenseService,
} from "@/lib/services/expenses";

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
    origin: "pwa",
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
