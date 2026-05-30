"use server";

/**
 * Server actions pra custody_balance_operations (PWA only).
 *
 * Thin wrapper sobre `src/lib/services/balance-operations.ts`. Cada action:
 *   - resolve auth via cookie client
 *   - faz parse de FormData
 *   - chama o service (RLS confiada, enforceMembership=false)
 *   - faz revalidatePath
 *
 * Toda lógica de negócio (membership, push, chat, mapeamento PG) vive no
 * service. Native consome o mesmo service via `src/app/api/balance-operations`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createBalanceOperation as createBalanceOpService,
  respondToBalanceOperation as respondToBalanceOpService,
  type BalanceOperationType,
} from "@/lib/services/balance-operations";

export async function createBalanceOperation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const groupId = (formData.get("groupId") as string) || "";
  const operationType =
    (formData.get("operationType") as BalanceOperationType) || ("" as BalanceOperationType);
  const targetUserId = (formData.get("targetUserId") as string) || "";
  const days = parseInt((formData.get("days") as string) || "1", 10) || 1;
  const notes = (formData.get("notes") as string) || null;
  const relatedDate = (formData.get("relatedDate") as string) || null;
  const swapRequestId = (formData.get("swapRequestId") as string) || null;

  const result = await createBalanceOpService(
    supabase,
    {
      groupId,
      proposerId: user.id,
      targetUserId,
      operationType,
      days,
      notes,
      relatedDate,
      swapRequestId,
    },
    {
      actorId: user.id,
      callerPath: "src/actions/balance-operations.ts:createBalanceOperation",
      enforceMembership: false, // cookie client → RLS confiada
      via: "calendario_pwa",
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return { success: true };
}

export async function respondToBalanceOperation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const operationId = (formData.get("operationId") as string) || "";
  const response = (formData.get("response") as "approved" | "rejected") || "approved";

  const result = await respondToBalanceOpService(
    supabase,
    {
      operationId,
      responderId: user.id,
      decision: response,
    },
    {
      actorId: user.id,
      callerPath: "src/actions/balance-operations.ts:respondToBalanceOperation",
      enforceMembership: false,
      via: "calendario_pwa",
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return { success: true };
}
