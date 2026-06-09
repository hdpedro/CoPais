"use server";

/**
 * Server actions da Rotina de Leva & Busca (PWA only).
 *
 * Thin wrapper sobre `src/lib/services/care-routine.ts`. Cada action:
 *   - resolve auth via cookie client
 *   - faz parse de FormData
 *   - chama o service (RLS confiada, enforceMembership=false)
 *   - revalidatePath
 *
 * Native consome o MESMO service via `src/app/api/care-routine/*`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  saveRoutineGrid as saveRoutineGridService,
  createOverride as createOverrideService,
  recordRoutineLog as recordRoutineLogService,
  type RoutineCellInput,
  type CareRoutineLeg,
  type CareRoutineLogStatus,
} from "@/lib/services/care-routine";

export async function saveRoutineGrid(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const groupId = (formData.get("groupId") as string) || "";
  const childId = (formData.get("childId") as string) || "";
  let cells: RoutineCellInput[] = [];
  try {
    cells = JSON.parse((formData.get("cells") as string) || "[]") as RoutineCellInput[];
  } catch {
    return { error: "Grade inválida." };
  }

  const result = await saveRoutineGridService(
    supabase,
    { groupId, childId, actorId: user.id, cells },
    {
      actorId: user.id,
      callerPath: "src/actions/care-routine.ts:saveRoutineGrid",
      enforceMembership: false,
      via: "rotina_pwa",
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/calendario/rotina");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createRoutineOverride(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const result = await createOverrideService(
    supabase,
    {
      groupId: (formData.get("groupId") as string) || "",
      childId: (formData.get("childId") as string) || "",
      actorId: user.id,
      occurrenceDate: (formData.get("occurrenceDate") as string) || "",
      leg: ((formData.get("leg") as string) || "pickup") as CareRoutineLeg,
      responsibleId: (formData.get("responsibleId") as string) || "",
      note: (formData.get("note") as string) || null,
    },
    {
      actorId: user.id,
      callerPath: "src/actions/care-routine.ts:createRoutineOverride",
      enforceMembership: false,
      via: "rotina_pwa",
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard");
  revalidatePath("/calendario/rotina");
  return { success: true };
}

/**
 * Registra "Buscou? Sim/Não" de uma perna do dia (accountability).
 */
export async function recordRoutineLog(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const result = await recordRoutineLogService(
    supabase,
    {
      groupId: (formData.get("groupId") as string) || "",
      childId: (formData.get("childId") as string) || "",
      actorId: user.id,
      occurrenceDate: (formData.get("occurrenceDate") as string) || "",
      leg: ((formData.get("leg") as string) || "pickup") as CareRoutineLeg,
      status: ((formData.get("status") as string) || "done") as CareRoutineLogStatus,
    },
    {
      actorId: user.id,
      callerPath: "src/actions/care-routine.ts:recordRoutineLog",
      enforceMembership: false,
      via: "dashboard_pwa",
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Dá CIÊNCIA numa troca de leva/busca (Foundation collab) — o coparente que
 * recebeu a troca confirma que viu. Limpa o badge "Aguardando ciência" do
 * outro lado. NÃO é aprovação (a troca já vale); é só awareness.
 */
export async function markRoutineOverrideRead(overrideId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Não autenticado." };

  const { error } = await supabase.rpc("mark_collab_read", {
    p_record_type: "care_routine_override",
    p_record_id: overrideId,
  });
  if (error) return { success: false, error: error.message };

  try {
    captureServerEvent(user.id, "care_routine_ack", { override_id: overrideId });
  } catch {
    /* analytics não-crítico */
  }

  revalidatePath("/dashboard");
  revalidatePath("/calendario/rotina");
  return { success: true };
}
