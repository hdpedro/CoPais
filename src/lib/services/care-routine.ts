/* ------------------------------------------------------------------ */
/* services/care-routine.ts                                            */
/* Single source of truth pra Rotina de Leva & Busca (care_routine_*). */
/* Callers (wrappers finos):                                           */
/*   - src/actions/care-routine.ts          (PWA server actions)       */
/*   - src/app/api/care-routine/route.ts     (Native POST grade/troca) */
/*   - src/app/api/care-routine/today/route.ts (Native GET do painel)  */
/*                                                                     */
/* Toda lógica de negócio (membership, diff da grade sem clobber,      */
/* ciência bilateral, mapeamento PG humano) vive aqui. Regra de        */
/* paridade PWA↔Native↔IA (CLAUDE.md): callers só fazem auth + parse + */
/* adaptação do retorno.                                               */
/*                                                                     */
/* Mapeamento PG (mesmo de balance-operations):                        */
/*   23503 fk_violation · 23514 check_violation · 23505 unique ·       */
/*   42501 permission_denied · PGRST116 not_found.                     */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { getDisplayName } from "@/lib/constants";
import {
  resolveRoutineOnDate,
  buildRoutineToday,
  type RoutineSlot,
  type RoutineOverride,
  type ResolvedRoutine,
  type RoutineToday,
} from "@/lib/care-routine-resolve";
import { resolveCustodyOnDate, type CustodyEvent } from "@/lib/custody-resolve";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export type CareRoutineLeg = "dropoff" | "pickup";
export type CareRoutinePatternType = "weekly" | "alternating_week" | "custody_based";

export type CareRoutineErrorCode =
  | "missing_fields"
  | "invalid_cell"
  | "invalid_leg"
  | "invalid_weekday"
  | "invalid_pattern"
  | "responsible_required"
  | "not_member"
  | "not_found"
  | "fk_violation"
  | "check_violation"
  | "unique_violation"
  | "permission_denied"
  | "db_error";

export interface CareRoutineFailure {
  ok: false;
  error: string;
  errorCode: CareRoutineErrorCode;
  status: number;
  pgCode?: string;
}
export interface CareRoutineSuccess<T> {
  ok: true;
  data: T;
}
export type CareRoutineResult<T> = CareRoutineSuccess<T> | CareRoutineFailure;

export interface RoutineSlotRow {
  id: string;
  group_id: string;
  child_id: string;
  weekday: number;
  leg: CareRoutineLeg;
  pattern_type: CareRoutinePatternType;
  week_parity: number | null;
  responsible_id: string | null;
  time_of_day: string | null;
  label: string | null;
  reminder_lead_minutes: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutineOverrideRow {
  id: string;
  group_id: string;
  child_id: string;
  occurrence_date: string;
  leg: CareRoutineLeg;
  responsible_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Uma célula da grade enviada pelo editor. */
export interface RoutineCellInput {
  weekday: number;
  leg: CareRoutineLeg;
  responsibleId: string | null;
  patternType?: CareRoutinePatternType;
  /** Paridade A/B (0/1) p/ alternating_week. */
  weekParity?: number | null;
  timeOfDay?: string | null;
  label?: string | null;
  reminderLeadMinutes?: number | null;
}

export interface SaveRoutineGridInput {
  groupId: string;
  childId: string;
  actorId: string;
  /** Conjunto COMPLETO de células preenchidas da grade desta criança.
   *  O service faz upsert das informadas e apaga as que sumiram. */
  cells: RoutineCellInput[];
}

export interface CreateOverrideInput {
  groupId: string;
  childId: string;
  actorId: string;
  occurrenceDate: string; // YYYY-MM-DD
  leg: CareRoutineLeg;
  responsibleId: string;
  note?: string | null;
}

export interface GetRoutineTodayInput {
  groupId: string;
  /** YYYY-MM-DD (calculado em BRT pelo caller). */
  dateKey: string;
  currentUserId: string;
}

export interface RoutineTodayPayload {
  arrangement: "rotating" | "together" | "single" | "custom";
  today: RoutineToday;
}

export interface ServiceContext {
  actorId?: string;
  callerPath: string;
  /** true quando `supabase` é admin client (bypassa RLS) → gate manual. */
  enforceMembership: boolean;
  via?: string;
}

const SLOT_COLUMNS =
  "id, group_id, child_id, weekday, leg, pattern_type, week_parity, responsible_id, " +
  "time_of_day, label, reminder_lead_minutes, is_active, created_by, created_at, updated_at";

const VALID_LEGS: ReadonlySet<string> = new Set(["dropoff", "pickup"]);
const VALID_PATTERNS: ReadonlySet<string> = new Set([
  "weekly",
  "alternating_week",
  "custody_based",
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Normaliza erro do Supabase em CareRoutineFailure com mensagem humana. */
export function mapPgError(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  fallback: CareRoutineErrorCode = "db_error",
): CareRoutineFailure {
  const pgCode = error.code;
  if (pgCode === "23503") {
    return {
      ok: false,
      errorCode: "fk_violation",
      error: "Não consegui salvar: grupo, criança ou responsável não existe mais.",
      status: 409,
      pgCode,
    };
  }
  if (pgCode === "23514") {
    return {
      ok: false,
      errorCode: "check_violation",
      error: "Algum campo está com valor inválido (dia, perna ou responsável).",
      status: 400,
      pgCode,
    };
  }
  if (pgCode === "23505") {
    return {
      ok: false,
      errorCode: "unique_violation",
      error: "Já existe uma definição para esse dia. Atualize a página e tente de novo.",
      status: 409,
      pgCode,
    };
  }
  if (pgCode === "42501") {
    return {
      ok: false,
      errorCode: "permission_denied",
      error: "Sem permissão para editar a rotina deste grupo.",
      status: 403,
      pgCode,
    };
  }
  if (pgCode === "PGRST116") {
    return { ok: false, errorCode: "not_found", error: "Não encontrado.", status: 404, pgCode };
  }
  return {
    ok: false,
    errorCode: fallback,
    error: error.message?.trim() || "Erro inesperado ao salvar a rotina.",
    status: 500,
    pgCode,
  };
}

/** Gate de membership do actor (admin client bypassa RLS → checagem manual). */
async function gateMember(
  supabase: SupabaseClient,
  groupId: string,
  actorId: string,
): Promise<CareRoutineFailure | null> {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", actorId)
    .maybeSingle();
  if (!data) {
    return { ok: false, errorCode: "not_member", error: "Sem permissão para este grupo.", status: 403 };
  }
  return null;
}

function validateCell(cell: RoutineCellInput): CareRoutineFailure | null {
  if (!Number.isInteger(cell.weekday) || cell.weekday < 0 || cell.weekday > 6) {
    return { ok: false, errorCode: "invalid_weekday", error: "Dia da semana inválido.", status: 400 };
  }
  if (!VALID_LEGS.has(cell.leg)) {
    return { ok: false, errorCode: "invalid_leg", error: "Perna inválida (use leva ou busca).", status: 400 };
  }
  const pattern = cell.patternType ?? "weekly";
  if (!VALID_PATTERNS.has(pattern)) {
    return { ok: false, errorCode: "invalid_pattern", error: "Tipo de recorrência inválido.", status: 400 };
  }
  if (pattern !== "custody_based" && !cell.responsibleId) {
    return {
      ok: false,
      errorCode: "responsible_required",
      error: "Escolha um responsável para cada célula da grade.",
      status: 400,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* saveRoutineGrid — substitui a grade de UMA criança (sem clobber das */
/* outras crianças). Upsert por célula + delete das que sumiram.       */
/* ------------------------------------------------------------------ */

export async function saveRoutineGrid(
  supabase: SupabaseClient,
  input: SaveRoutineGridInput,
  ctx: ServiceContext,
): Promise<CareRoutineResult<RoutineSlotRow[]>> {
  const { groupId, childId, actorId, cells } = input;

  if (!groupId || !childId || !actorId) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId, childId e actorId são obrigatórios.",
      status: 400,
    };
  }
  for (const cell of cells) {
    const bad = validateCell(cell);
    if (bad) return bad;
  }

  if (ctx.enforceMembership) {
    const gate = await gateMember(supabase, groupId, actorId);
    if (gate) return gate;
  }

  // 1) Upsert das células informadas (cria/atualiza por chave natural).
  //    Feito ANTES do delete pra a grade nunca ficar vazia no meio.
  if (cells.length > 0) {
    const rows = cells.map((c) => ({
      group_id: groupId,
      child_id: childId,
      weekday: c.weekday,
      leg: c.leg,
      pattern_type: c.patternType ?? "weekly",
      week_parity: c.weekParity ?? null,
      responsible_id: c.responsibleId,
      time_of_day: c.timeOfDay ?? null,
      label: c.label?.trim() || null,
      reminder_lead_minutes: c.reminderLeadMinutes ?? null,
      is_active: true,
      created_by: actorId,
    }));
    const { error } = await supabase
      .from("care_routine_slots")
      .upsert(rows, { onConflict: "group_id,child_id,weekday,leg" });
    if (error) {
      const failure = mapPgError(error);
      void reportServerError(new Error(error.message), {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: { op: "save_upsert", groupId, childId, pgCode: error.code, mappedCode: failure.errorCode },
      });
      return failure;
    }
  }

  // 2) Apaga as células que sumiram da grade (por chave natural weekday+leg).
  const keep = new Set(cells.map((c) => `${c.weekday}:${c.leg}`));
  const { data: current, error: fetchErr } = await supabase
    .from("care_routine_slots")
    .select("id, weekday, leg")
    .eq("group_id", groupId)
    .eq("child_id", childId);
  if (fetchErr) {
    const failure = mapPgError(fetchErr);
    void reportServerError(new Error(fetchErr.message), {
      filePath: ctx.callerPath,
      severity: "error",
      userId: ctx.actorId,
      metadata: { op: "save_fetch_current", groupId, childId, pgCode: fetchErr.code },
    });
    return failure;
  }
  const toDelete = (current ?? [])
    .filter((r) => !keep.has(`${r.weekday}:${r.leg}`))
    .map((r) => r.id as string);
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("care_routine_slots")
      .delete()
      .in("id", toDelete);
    if (delErr) {
      const failure = mapPgError(delErr);
      void reportServerError(new Error(delErr.message), {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: { op: "save_delete", groupId, childId, pgCode: delErr.code },
      });
      return failure;
    }
  }

  // 3) Lê a grade resultante pra devolver ao caller.
  const { data: finalRows, error: readErr } = await supabase
    .from("care_routine_slots")
    .select(SLOT_COLUMNS)
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .order("weekday", { ascending: true });
  if (readErr) {
    return mapPgError(readErr);
  }

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "care_routine_slot_set", {
        child_id: childId,
        cells: cells.length,
        via: ctx.via,
      });
    } catch {
      /* analytics não-crítico */
    }
  }

  return { ok: true, data: (finalRows ?? []) as unknown as RoutineSlotRow[] };
}

/* ------------------------------------------------------------------ */
/* listRoutineSlots                                                    */
/* ------------------------------------------------------------------ */

export async function listRoutineSlots(
  supabase: SupabaseClient,
  input: { groupId: string; childId?: string },
  ctx: ServiceContext,
): Promise<CareRoutineResult<RoutineSlotRow[]>> {
  const { groupId, childId } = input;
  if (!groupId) {
    return { ok: false, errorCode: "missing_fields", error: "groupId é obrigatório.", status: 400 };
  }
  if (ctx.enforceMembership && ctx.actorId) {
    const gate = await gateMember(supabase, groupId, ctx.actorId);
    if (gate) return gate;
  }
  let query = supabase
    .from("care_routine_slots")
    .select(SLOT_COLUMNS)
    .eq("group_id", groupId)
    .eq("is_active", true);
  if (childId) query = query.eq("child_id", childId);
  const { data, error } = await query.order("weekday", { ascending: true });
  if (error) {
    const failure = mapPgError(error);
    void reportServerError(new Error(error.message), {
      filePath: ctx.callerPath,
      severity: "error",
      userId: ctx.actorId,
      metadata: { op: "list", groupId, pgCode: error.code },
    });
    return failure;
  }
  return { ok: true, data: (data ?? []) as unknown as RoutineSlotRow[] };
}

/* ------------------------------------------------------------------ */
/* getRoutineToday — resolve a rotina de HOJE server-side e devolve o  */
/* RoutineToday pronto pro painel (PWA SSR + Native via API).          */
/* ------------------------------------------------------------------ */

export async function getRoutineToday(
  supabase: SupabaseClient,
  input: GetRoutineTodayInput,
  ctx: ServiceContext,
): Promise<CareRoutineResult<RoutineTodayPayload>> {
  const { groupId, dateKey, currentUserId } = input;
  if (!groupId || !dateKey) {
    return { ok: false, errorCode: "missing_fields", error: "groupId e dateKey são obrigatórios.", status: 400 };
  }
  if (ctx.enforceMembership && ctx.actorId) {
    const gate = await gateMember(supabase, groupId, ctx.actorId);
    if (gate) return gate;
  }

  const weekday = new Date(dateKey + "T12:00:00").getDay();

  // Tudo em paralelo — leituras pequenas e indexadas.
  const [groupRes, childrenRes, slotsRes, overridesRes, membersRes, custodyRes] = await Promise.all([
    supabase.from("coparenting_groups").select("arrangement").eq("id", groupId).maybeSingle(),
    supabase.from("children").select("id, full_name").eq("group_id", groupId),
    supabase
      .from("care_routine_slots")
      .select("id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, label, week_parity")
      .eq("group_id", groupId)
      .eq("weekday", weekday)
      .eq("is_active", true),
    supabase
      .from("care_routine_overrides")
      .select("id, child_id, occurrence_date, leg, responsible_id")
      .eq("group_id", groupId)
      .eq("occurrence_date", dateKey),
    supabase
      .from("group_members")
      .select("user_id, profiles(display_name, full_name)")
      .eq("group_id", groupId),
    supabase
      .from("custody_events")
      .select("id, child_id, start_date, end_date, responsible_user_id, custody_type, created_at")
      .eq("group_id", groupId)
      .lte("start_date", dateKey)
      .gte("end_date", dateKey),
  ]);

  const arrangement =
    ((groupRes.data?.arrangement as RoutineTodayPayload["arrangement"]) ?? "rotating");

  const children = (childrenRes.data ?? []).map((c) => ({
    id: c.id as string,
    firstName: getDisplayName(c.full_name as string, true),
  }));
  const slots = (slotsRes.data ?? []) as unknown as RoutineSlot[];
  const overrides = (overridesRes.data ?? []) as unknown as RoutineOverride[];

  // Mapa id → nome de exibição (primeiro nome) pra resolver responsáveis.
  const nameById = new Map<string, string>();
  for (const m of membersRes.data ?? []) {
    const prof = (m as { profiles?: { display_name?: string | null; full_name?: string | null } | { display_name?: string | null; full_name?: string | null }[] }).profiles;
    const p = Array.isArray(prof) ? prof[0] : prof;
    nameById.set(m.user_id as string, getDisplayName(p?.display_name || p?.full_name || null, true));
  }
  const resolveName = (id: string) => nameById.get(id) ?? "Responsável";

  const custodyEvents = (custodyRes.data ?? []) as unknown as CustodyEvent[];
  const custodyResolver = (cid: string, dk: string) =>
    resolveCustodyOnDate(custodyEvents, cid, dk)?.responsible_user_id ?? null;
  const resolvedByChild: Record<string, ResolvedRoutine> = {};
  for (const child of children) {
    resolvedByChild[child.id] = resolveRoutineOnDate(slots, overrides, child.id, dateKey, custodyResolver);
  }

  const today = buildRoutineToday(children, resolvedByChild, resolveName, currentUserId);
  return { ok: true, data: { arrangement, today } };
}

/* ------------------------------------------------------------------ */
/* createOverride — troca pontual do dia ("hoje eu busco") + ciência   */
/* bilateral via Foundation collab (push + "aguardando ciência").      */
/* ------------------------------------------------------------------ */

export async function createOverride(
  supabase: SupabaseClient,
  input: CreateOverrideInput,
  ctx: ServiceContext,
): Promise<CareRoutineResult<RoutineOverrideRow>> {
  const { groupId, childId, actorId, occurrenceDate, leg, responsibleId, note = null } = input;

  if (!groupId || !childId || !actorId || !occurrenceDate || !responsibleId) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId, childId, occurrenceDate, leg e responsibleId são obrigatórios.",
      status: 400,
    };
  }
  if (!VALID_LEGS.has(leg)) {
    return { ok: false, errorCode: "invalid_leg", error: "Perna inválida (use leva ou busca).", status: 400 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
    return { ok: false, errorCode: "missing_fields", error: "Data inválida (use AAAA-MM-DD).", status: 400 };
  }
  if (ctx.enforceMembership) {
    const gate = await gateMember(supabase, groupId, actorId);
    if (gate) return gate;
  }

  // Upsert: mudar de ideia no mesmo dia/perna sobrescreve o override anterior.
  const { data, error } = await supabase
    .from("care_routine_overrides")
    .upsert(
      {
        group_id: groupId,
        child_id: childId,
        occurrence_date: occurrenceDate,
        leg,
        responsible_id: responsibleId,
        note: note?.trim() || null,
        created_by: actorId,
      },
      { onConflict: "group_id,child_id,occurrence_date,leg" },
    )
    .select("id, group_id, child_id, occurrence_date, leg, responsible_id, note, created_by, created_at")
    .single();

  if (error || !data) {
    const failure = mapPgError(error || { message: "no_data_returned" });
    void reportServerError(new Error(error?.message || "override_insert_failed"), {
      filePath: ctx.callerPath,
      severity: "error",
      userId: ctx.actorId,
      metadata: { op: "create_override", groupId, childId, leg, pgCode: error?.code, mappedCode: failure.errorCode },
    });
    return failure;
  }

  const row = data as unknown as RoutineOverrideRow;

  // ── Ciência bilateral (não-fatal: nunca derruba o override) ──────
  void fireOverrideSideEffects(supabase, row, actorId, leg, ctx);

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "care_routine_override_created", { leg, via: ctx.via });
    } catch {
      /* analytics não-crítico */
    }
  }

  return { ok: true, data: row };
}

async function fireOverrideSideEffects(
  supabase: SupabaseClient,
  row: RoutineOverrideRow,
  actorId: string,
  leg: CareRoutineLeg,
  ctx: ServiceContext,
): Promise<void> {
  try {
    let actorName = "Alguém";
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, full_name")
        .eq("id", actorId)
        .single();
      actorName = getDisplayName(prof?.display_name || prof?.full_name || null, true);
    } catch {
      /* fallback */
    }
    let childName = "as crianças";
    try {
      const { data: child } = await supabase
        .from("children")
        .select("full_name")
        .eq("id", row.child_id)
        .single();
      if (child?.full_name) childName = getDisplayName(child.full_name as string, true);
    } catch {
      /* fallback */
    }

    const verb = leg === "dropoff" ? "leva" : "busca";
    // Foundation: push + inbox pros outros responsáveis. Ciência (não aprovação)
    // via collab_reads — a UI mostra "aguardando ciência" até o outro abrir.
    const { notifyCollabCreate } = await import("@/lib/services/collab");
    await notifyCollabCreate({
      recordType: "care_routine_override",
      recordId: row.id,
      groupId: row.group_id,
      actorUserId: actorId,
      priority: "important",
      title: "Troca de leva/busca",
      message: `${actorName} alterou quem ${verb} ${childName} hoje.`,
      // /dashboard existe em PWA E Native e é onde o destinatário vê o banner
      // "[X] trocou · Confirmar" (ciência). /calendario/rotina não tem rota nativa.
      link: "/dashboard",
    });
  } catch (caught) {
    void reportServerError(caught, {
      filePath: ctx.callerPath,
      severity: "warning",
      userId: ctx.actorId,
      metadata: { phase: "override_ciencia", overrideId: row.id },
    });
  }
}

/* ------------------------------------------------------------------ */
/* recordRoutineLog — "Buscou? Sim/Não" (accountability, Fase 2)       */
/* ------------------------------------------------------------------ */

export type CareRoutineLogStatus = "done" | "missed";

export interface RecordRoutineLogInput {
  groupId: string;
  childId: string;
  actorId: string;
  occurrenceDate: string;
  leg: CareRoutineLeg;
  status: CareRoutineLogStatus;
  note?: string | null;
}

export interface RoutineLogRow {
  id: string;
  group_id: string;
  child_id: string;
  occurrence_date: string;
  leg: CareRoutineLeg;
  status: CareRoutineLogStatus;
  reported_by: string | null;
  created_at: string;
}

export async function recordRoutineLog(
  supabase: SupabaseClient,
  input: RecordRoutineLogInput,
  ctx: ServiceContext,
): Promise<CareRoutineResult<RoutineLogRow>> {
  const { groupId, childId, actorId, occurrenceDate, leg, status, note = null } = input;

  if (!groupId || !childId || !actorId || !occurrenceDate || !leg || !status) {
    return { ok: false, errorCode: "missing_fields", error: "Campos obrigatórios faltando.", status: 400 };
  }
  if (!VALID_LEGS.has(leg)) {
    return { ok: false, errorCode: "invalid_leg", error: "Perna inválida (use leva ou busca).", status: 400 };
  }
  if (status !== "done" && status !== "missed") {
    return { ok: false, errorCode: "missing_fields", error: "Status inválido (done/missed).", status: 400 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
    return { ok: false, errorCode: "missing_fields", error: "Data inválida (use AAAA-MM-DD).", status: 400 };
  }
  if (ctx.enforceMembership) {
    const gate = await gateMember(supabase, groupId, actorId);
    if (gate) return gate;
  }

  // Upsert: corrigir done↔missed sobrescreve o registro do dia/perna.
  const { data, error } = await supabase
    .from("care_routine_logs")
    .upsert(
      {
        group_id: groupId,
        child_id: childId,
        occurrence_date: occurrenceDate,
        leg,
        status,
        reported_by: actorId,
        note: note?.trim() || null,
      },
      { onConflict: "child_id,occurrence_date,leg" },
    )
    .select("id, group_id, child_id, occurrence_date, leg, status, reported_by, created_at")
    .single();

  if (error || !data) {
    const failure = mapPgError(error || { message: "no_data_returned" });
    void reportServerError(new Error(error?.message || "routine_log_failed"), {
      filePath: ctx.callerPath,
      severity: "error",
      userId: ctx.actorId,
      metadata: { op: "record_log", groupId, childId, leg, status, pgCode: error?.code, mappedCode: failure.errorCode },
    });
    return failure;
  }

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "care_routine_logged", { leg, status, via: ctx.via });
    } catch {
      /* analytics não-crítico */
    }
  }

  return { ok: true, data: data as unknown as RoutineLogRow };
}
