"use server";

/**
 * Vacation server actions — wrapper fino sobre src/lib/services/vacation.ts.
 *
 * Pattern espelha src/actions/calendar.ts:createSwapRequest:
 *   - Resolve auth (current user)
 *   - Verifica membership do grupo
 *   - Parseia FormData
 *   - Delega pro service (business logic + side effects)
 *   - Adapta retorno pra redirect / FormData-friendly response
 *
 * Bug Amanda 2026-05-14 — fluxo dedicado de férias no PWA. Antes a usuária
 * não tinha forma de criar férias no PWA (só no Native depois do fix).
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import {
  createVacationPeriod as createVacationPeriodService,
  updateVacationPeriod as updateVacationPeriodService,
  deleteVacationPeriod as deleteVacationPeriodService,
} from "@/lib/services/vacation";

const ERR_MESSAGES: Record<string, string> = {
  missing_required_fields: "Preencha todos os campos obrigatórios.",
  invalid_date_format: "Data inválida.",
  end_before_start: "A data final deve ser depois da inicial.",
  period_too_long: "Período muito longo (máx 90 dias). Quebre em vários registros.",
  responsible_not_member: "O responsável escolhido não é membro deste grupo.",
  responsible_required: "Escolha quem está com a criança nas férias.",
  vacation_overlap_existing: "Já existe um período de férias cadastrado que sobrepõe esse intervalo. Edite o existente ou ajuste as datas.",
  vacation_not_found: "Período de férias não encontrado.",
  no_changes: "Nenhuma alteração detectada.",
  db_error: "Erro ao salvar. Tente novamente.",
};

function userMessage(code: string): string {
  return ERR_MESSAGES[code] || code;
}

/**
 * Estado retornado pela action em caso de erro. Permite o form
 * cliente rehydratar os valores que o user digitou, em vez de
 * perder tudo na navegação (fix crítico Bug Amanda 2026-05-14).
 */
export interface CreateVacationState {
  error?: string;
}

export async function createVacation(
  _prev: CreateVacationState | undefined,
  formData: FormData,
): Promise<CreateVacationState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  if (!groupId) return { error: "Grupo não informado" };

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) return { error: "Sem permissão para este grupo." };

  const childIdRaw = (formData.get("childId") as string | null) ?? "";
  const childId = childIdRaw && childIdRaw !== "none" ? childIdRaw : null;
  const responsibleUserId = (formData.get("responsibleUserId") as string | null) ?? "";
  const startDate = (formData.get("startDate") as string | null) ?? "";
  const endDate = (formData.get("endDate") as string | null) ?? "";
  const notes = (formData.get("notes") as string | null) || null;

  const result = await createVacationPeriodService(supabase, {
    groupId,
    createdBy: user.id,
    childId,
    responsibleUserId,
    startDate,
    endDate,
    notes,
  });

  if (!result.ok) {
    // Retorna o erro pro form retentar SEM perder o que o user digitou.
    return { error: userMessage(result.error) };
  }

  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  redirect("/calendario?success=" + encodeURIComponent("Férias registradas — escala atualizada automaticamente."));
}

export async function updateVacation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vacationId = formData.get("vacationId") as string;
  const groupId = formData.get("groupId") as string;
  if (!vacationId || !groupId) {
    redirect("/calendario?error=" + encodeURIComponent("ID inválido"));
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissão"));
  }

  // Build patch — only include fields present in the form
  const patch: Parameters<typeof updateVacationPeriodService>[1]["patch"] = {};
  const childIdRaw = formData.get("childId");
  if (childIdRaw !== null) patch.childId = childIdRaw === "" || childIdRaw === "none" ? null : (childIdRaw as string);
  const resp = formData.get("responsibleUserId");
  if (resp !== null && resp !== "") patch.responsibleUserId = resp as string;
  const sd = formData.get("startDate");
  if (sd !== null && sd !== "") patch.startDate = sd as string;
  const ed = formData.get("endDate");
  if (ed !== null && ed !== "") patch.endDate = ed as string;
  const notes = formData.get("notes");
  if (notes !== null) patch.notes = (notes as string) || null;

  const result = await updateVacationPeriodService(supabase, {
    vacationId,
    actorId: user.id,
    groupId,
    patch,
  });

  if (!result.ok) {
    redirect(`/calendario/ferias/${vacationId}?error=` + encodeURIComponent(userMessage(result.error)));
  }

  revalidatePath("/calendario");
  redirect("/calendario?success=" + encodeURIComponent("Férias atualizadas."));
}

export async function deleteVacation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vacationId = formData.get("vacationId") as string;
  const groupId = formData.get("groupId") as string;
  if (!vacationId || !groupId) {
    redirect("/calendario?error=" + encodeURIComponent("ID inválido"));
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissão"));
  }

  const result = await deleteVacationPeriodService(supabase, {
    vacationId,
    actorId: user.id,
    groupId,
  });

  if (!result.ok) {
    redirect("/calendario?error=" + encodeURIComponent(userMessage(result.error)));
  }

  revalidatePath("/calendario");
  redirect("/calendario?success=" + encodeURIComponent("Férias removidas."));
}
