/* ------------------------------------------------------------------ */
/* services/vacation.ts                                                */
/* Single source of truth for vacation business logic.                 */
/* Called by:                                                          */
/*   - src/actions/vacation.ts (PWA server actions, RLS client)        */
/*   - (future) src/app/api/vacation/route.ts (Native REST)            */
/*   - (future) src/lib/ai/tools.ts:create_vacation_period             */
/*                                                                     */
/* Side effects (push, chat post, posthog) live HERE so all callers    */
/* stay aligned. Callers handle only:                                  */
/*   - Auth (resolve userId)                                           */
/*   - Input validation (FormData / HTTP parsing)                      */
/*   - Response shape (redirect vs NextResponse vs ToolResult)         */
/*                                                                     */
/* # Por que existe                                                    */
/* Bug Amanda 2026-05-14 — férias como cidadão de primeira classe.     */
/* Antes: usuárias criavam "férias" via Novo Evento (events table),    */
/* mas isso era anotação solta — escala regular continuava aparecendo. */
/*                                                                     */
/* Agora: vacation usa custody_events com custody_type='vacation', e   */
/* a view custody_resolved (migration 00082) aplica prioridade 2       */
/* (entre swap=1 e regular=3). Sobrepõe escala automaticamente em      */
/* calendário, dashboard, streak, próxima troca.                       */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";

export interface CreateVacationInput {
  groupId: string;
  createdBy: string;
  /** UUID da criança. null = férias família-toda (todas as crianças). */
  childId: string | null;
  /** UUID do coparente responsável. OBRIGATÓRIO. */
  responsibleUserId: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** Anotação livre — viagem pra X, recesso escolar etc. */
  notes?: string | null;
}

export interface DeleteVacationInput {
  vacationId: string;
  actorId: string;
  groupId: string;
}

export interface UpdateVacationInput {
  vacationId: string;
  actorId: string;
  groupId: string;
  patch: Partial<{
    childId: string | null;
    responsibleUserId: string;
    startDate: string;
    endDate: string;
    notes: string | null;
  }>;
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VACATION_DAYS = 90;

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T12:00:00").getTime();
  const end = new Date(endIso + "T12:00:00").getTime();
  return Math.round((end - start) / 86400000) + 1;
}

/* ------------------------------------------------------------------ */
/* Create vacation period                                              */
/* ------------------------------------------------------------------ */

export async function createVacationPeriod(
  supabase: SupabaseClient,
  input: CreateVacationInput,
): Promise<ServiceResult<{ id: string }>> {
  const {
    groupId,
    createdBy,
    childId,
    responsibleUserId,
    startDate,
    endDate,
    notes,
  } = input;

  // ── Validações ────────────────────────────────────────────────
  if (!groupId || !createdBy || !responsibleUserId) {
    return { ok: false, error: "missing_required_fields", status: 400 };
  }
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    return { ok: false, error: "invalid_date_format", status: 400 };
  }
  if (endDate < startDate) {
    return { ok: false, error: "end_before_start", status: 400 };
  }
  const days = daysBetween(startDate, endDate);
  if (days > MAX_VACATION_DAYS) {
    return { ok: false, error: "period_too_long", status: 400 };
  }

  // ── Confirma membership do responsável ────────────────────────
  // RLS impede inserir custody_events pra responsible_user_id que não
  // é membro do grupo, mas dar erro claro vale a chamada extra.
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", responsibleUserId)
    .maybeSingle();
  if (!membership) {
    return { ok: false, error: "responsible_not_member", status: 400 };
  }

  // ── Insert ─────────────────────────────────────────────────────
  // Trigger 00079 (custody_events_prevent_overlap) rejeita vacation
  // sobreposta a outra vacation do mesmo (group, child).
  // "Família" (childId null) = férias de TODAS as crianças. A resolução de
  // custódia (view custody_resolved + custody-resolve.ts) é POR child_id; uma
  // linha com child_id NULL não sobrepõe a escala de nenhuma criança (no-op
  // silencioso) e viola o NOT NULL da coluna. Expandimos em 1 linha por criança
  // (paridade com o Native). Bug Henrique 2026-06-06.
  let targetChildIds: string[];
  if (childId == null) {
    const { data: kids } = await supabase
      .from("children")
      .select("id")
      .eq("group_id", groupId);
    targetChildIds = (kids ?? []).map((k) => k.id as string);
    if (targetChildIds.length === 0) {
      return { ok: false, error: "no_children", status: 400 };
    }
  } else {
    targetChildIds = [childId];
  }

  const { data, error } = await supabase
    .from("custody_events")
    .insert(
      targetChildIds.map((cid) => ({
        group_id: groupId,
        child_id: cid,
        custody_type: "vacation",
        responsible_user_id: responsibleUserId,
        start_date: startDate,
        end_date: endDate,
        notes: notes?.trim() || null,
      })),
    )
    .select("id");

  if (error) {
    // Postgres unique_violation = trigger overlap ou EXCLUDE constraint
    if (error.code === "23505" || /overlap/i.test(error.message)) {
      return { ok: false, error: "vacation_overlap_existing", status: 409 };
    }
    return { ok: false, error: error.message || "db_error", status: 500 };
  }

  // ── Side effects: notify + analytics ───────────────────────────
  // Notifica TODOS os coparentes (exceto quem criou). Push priority
  // "important" porque férias afetam planejamento do outro.
  const { data: otherMembers } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name)")
    .eq("group_id", groupId)
    .neq("user_id", createdBy);

  const { data: creatorProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", createdBy)
    .maybeSingle();

  const { data: childRow } = childId
    ? await supabase
        .from("children")
        .select("full_name")
        .eq("id", childId)
        .maybeSingle()
    : { data: null };

  const creatorName = creatorProfile?.full_name?.split(" ")[0] || "Coparente";
  const childName = childRow?.full_name?.split(" ")[0] || "a família";

  const startLabel = new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const endLabel = new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  for (const m of otherMembers || []) {
    try {
      await createNotificationWithPush(
        m.user_id,
        "vacation_created",
        "✈️ Novo período de férias",
        `${creatorName} marcou férias de ${childName}: ${startLabel} – ${endLabel} (${days} ${days === 1 ? "dia" : "dias"})`,
        "/calendario",
      );
    } catch {
      /* push falha = silent, in-app notification cobre */
    }
  }

  // Analytics — bom pra entender adoção do feature
  try {
    captureServerEvent(createdBy, "vacation_created", {
      group_id: groupId,
      child_id: childId,
      responsible_user_id: responsibleUserId,
      days,
      has_notes: !!notes?.trim(),
    });
  } catch {
    /* analytics não-crítico */
  }

  return { ok: true, data: { id: (data?.[0]?.id ?? "") as string } };
}

/* ------------------------------------------------------------------ */
/* Update vacation period                                              */
/* ------------------------------------------------------------------ */

export async function updateVacationPeriod(
  supabase: SupabaseClient,
  input: UpdateVacationInput,
): Promise<ServiceResult<{ id: string }>> {
  const { vacationId, actorId, groupId, patch } = input;

  if (!vacationId || !actorId || !groupId) {
    return { ok: false, error: "missing_required_fields", status: 400 };
  }

  // Validações do patch (só campos passados)
  const updates: Record<string, unknown> = {};
  if (patch.childId !== undefined) updates.child_id = patch.childId;
  if (patch.responsibleUserId !== undefined) {
    if (!patch.responsibleUserId) {
      return { ok: false, error: "responsible_required", status: 400 };
    }
    updates.responsible_user_id = patch.responsibleUserId;
  }
  if (patch.startDate !== undefined) {
    if (!ISO_DATE.test(patch.startDate)) {
      return { ok: false, error: "invalid_date_format", status: 400 };
    }
    updates.start_date = patch.startDate;
  }
  if (patch.endDate !== undefined) {
    if (!ISO_DATE.test(patch.endDate)) {
      return { ok: false, error: "invalid_date_format", status: 400 };
    }
    updates.end_date = patch.endDate;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes?.trim() || null;
  }

  // Cross-field validação se ambos os dates foram passados
  if (typeof updates.start_date === "string" && typeof updates.end_date === "string") {
    if (updates.end_date < updates.start_date) {
      return { ok: false, error: "end_before_start", status: 400 };
    }
    const days = daysBetween(updates.start_date as string, updates.end_date as string);
    if (days > MAX_VACATION_DAYS) {
      return { ok: false, error: "period_too_long", status: 400 };
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "no_changes", status: 400 };
  }

  const { data, error } = await supabase
    .from("custody_events")
    .update(updates)
    .eq("id", vacationId)
    .eq("group_id", groupId)
    .eq("custody_type", "vacation")
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || /overlap/i.test(error.message)) {
      return { ok: false, error: "vacation_overlap_existing", status: 409 };
    }
    return { ok: false, error: error.message || "db_error", status: 500 };
  }
  if (!data) {
    return { ok: false, error: "vacation_not_found", status: 404 };
  }

  try {
    captureServerEvent(actorId, "vacation_updated", {
      group_id: groupId,
      vacation_id: vacationId,
    });
  } catch {
    /* ignore */
  }

  return { ok: true, data: { id: data.id as string } };
}

/* ------------------------------------------------------------------ */
/* Delete vacation period                                              */
/* ------------------------------------------------------------------ */

export async function deleteVacationPeriod(
  supabase: SupabaseClient,
  input: DeleteVacationInput,
): Promise<ServiceResult<{ id: string }>> {
  const { vacationId, actorId, groupId } = input;

  if (!vacationId || !actorId || !groupId) {
    return { ok: false, error: "missing_required_fields", status: 400 };
  }

  // Guardrail: só deleta se for vacation neste grupo (RLS reforça).
  const { data, error } = await supabase
    .from("custody_events")
    .delete()
    .eq("id", vacationId)
    .eq("group_id", groupId)
    .eq("custody_type", "vacation")
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message || "db_error", status: 500 };
  }
  if (!data) {
    return { ok: false, error: "vacation_not_found", status: 404 };
  }

  try {
    captureServerEvent(actorId, "vacation_deleted", {
      group_id: groupId,
      vacation_id: vacationId,
    });
  } catch {
    /* ignore */
  }

  return { ok: true, data: { id: data.id as string } };
}

/* ------------------------------------------------------------------ */
/* List upcoming vacations                                             */
/* ------------------------------------------------------------------ */

export interface VacationListItem {
  id: string;
  childId: string | null;
  childName: string | null;
  responsibleUserId: string;
  responsibleName: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
}

export async function listVacations(
  supabase: SupabaseClient,
  groupId: string,
  opts: { includesPast?: boolean; limit?: number } = {},
): Promise<ServiceResult<VacationListItem[]>> {
  const { includesPast = false, limit = 20 } = opts;
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase
    .from("custody_events")
    .select(
      "id, child_id, responsible_user_id, start_date, end_date, notes, created_at, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)",
    )
    .eq("group_id", groupId)
    .eq("custody_type", "vacation")
    .order("start_date", { ascending: !includesPast });

  if (!includesPast) {
    q = q.gte("end_date", today);
  }
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    return { ok: false, error: error.message || "db_error", status: 500 };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const items: VacationListItem[] = (data || []).map((row: any) => ({
    id: row.id as string,
    childId: (row.child_id as string | null) ?? null,
    childName: row.children?.full_name?.split(" ").slice(0, 2).join(" ") ?? null,
    responsibleUserId: row.responsible_user_id as string,
    responsibleName: row.profiles?.full_name?.split(" ")[0] ?? "",
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
  /* eslint-enable */

  return { ok: true, data: items };
}
