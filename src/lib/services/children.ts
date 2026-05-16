/* ------------------------------------------------------------------ */
/* services/children.ts                                                */
/* Single source of truth para mutations em `children`.                */
/* Callers (wrappers finos):                                           */
/*   - src/actions/group.ts (PWA legacy form actions)                  */
/*   - src/app/api/children/route.ts (Native POST)                     */
/*   - src/app/api/children/[childId]/route.ts (Native PATCH/DELETE)   */
/*   - src/app/api/create-group/route.ts (primeira criança no onboard) */
/*                                                                     */
/* Por que existe (2026-05-15):                                        */
/*   Bug "não foi possível adicionar a 2ª criança" (3 users — Luísa et */
/*   al.) e bug "erro ao remover criança Jucilande" (Android) tinham   */
/*   a mesma causa estrutural: cada caller fazia INSERT/UPDATE/DELETE  */
/*   direto no Supabase com try/catch divergente. Quando a operação    */
/*   falhava por FK/RLS/check, um caller surfaceava `error.message`,   */
/*   outro silenciava (HTML do Next → `{}` no Native fetch). Padrão de */
/*   serviços (vide swaps, expenses, decisions, vaccines, vacation)    */
/*   consolida: TODOS os erros de banco viram `ChildServiceResult` com */
/*   `errorCode` estável + mensagem humanizada PT-BR + status HTTP.    */
/*                                                                     */
/* Mapeamento de erros PG (estável, testado em                         */
/* tests/unit/children-service.test.ts):                               */
/*   23503  → fk_blocked         (FK violation — criança tem vínculos) */
/*   23514  → check_violation    (sex inválido, birth_date futura)     */
/*   23505  → unique_violation   (raro — UPDATE collision)             */
/*   42501  → permission_denied  (RLS bloqueou)                        */
/*   PGRST116 → not_found        (.single() não achou row)             */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type ChildErrorCode =
  | "missing_fields"
  | "invalid_date"
  | "future_birthdate"
  | "fk_blocked"
  | "check_violation"
  | "unique_violation"
  | "permission_denied"
  | "not_found"
  | "wrong_group"
  | "no_changes"
  | "db_error";

export interface ChildServiceFailure {
  ok: false;
  /** Mensagem PT-BR pronta pra UX. */
  error: string;
  /** Código estável (usado por client pra ramificar UX sem parsing). */
  errorCode: ChildErrorCode;
  /** HTTP status correspondente. */
  status: number;
  /** Código PG bruto quando disponível — útil pra debug. */
  pgCode?: string;
}

export interface ChildServiceSuccess<T> {
  ok: true;
  data: T;
}

export type ChildServiceResult<T> = ChildServiceSuccess<T> | ChildServiceFailure;

export interface ChildRow {
  id: string;
  full_name: string;
  birth_date: string;
  sex: "M" | "F" | null;
  photo_url: string | null;
  notes: string | null;
  allergies: string[] | null;
  cpf: string | null;
  rg: string | null;
}

export interface CreateChildInput {
  groupId: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  sex?: "M" | "F" | null;
  allergies?: string[] | null;
  notes?: string | null;
  /** UUID pré-gerado pelo caller (create-group precisa antes do insert). */
  childId?: string;
}

export interface UpdateChildInput {
  childId: string;
  groupId: string;
  patch: Partial<{
    fullName: string;
    birthDate: string;
    sex: "M" | "F" | null;
    allergies: string[] | null;
    notes: string | null;
    cpf: string | null;
    rg: string | null;
  }>;
}

export interface DeleteChildInput {
  childId: string;
  groupId: string;
}

export interface ServiceContext {
  /** Quem está executando. Usado pra telemetria + reportServerError. */
  actorId?: string;
  /** Onde o caller está (rota/action). Vai pro error_logs. */
  callerPath: string;
  /**
   * Quando true, faz checagem manual de membership ANTES da escrita.
   * Necessário quando `supabase` é admin client (bypassa RLS).
   * Quando false (cookie client), confia na RLS.
   */
  enforceMembership: boolean;
  /** Origem (analytics). Ex: "onboarding_wizard", "criancas_screen", "ai_tool". */
  via?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                    */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

function isFutureDate(iso: string): boolean {
  // Comparamos contra fim do dia local pra não brigar com timezone:
  // birthdate "hoje" deve ser válido em qualquer fuso.
  return new Date(`${iso}T12:00:00`).getTime() > Date.now();
}

/**
 * Normaliza erro do Supabase em ChildServiceFailure com mensagem humana.
 * Exportado pra testes e pra reuso em outros services no futuro.
 */
export function mapPgError(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  fallback: ChildErrorCode = "db_error",
): ChildServiceFailure {
  const pgCode = error.code;

  if (pgCode === "23503") {
    return {
      ok: false,
      errorCode: "fk_blocked",
      error:
        "Não consegui remover: a criança tem registros (despesas, documentos, eventos ou notas) vinculados. Apague-os antes.",
      status: 409,
      pgCode,
    };
  }
  if (pgCode === "23514") {
    return {
      ok: false,
      errorCode: "check_violation",
      error: "Algum campo está com valor inválido. Confira sexo e data de nascimento.",
      status: 400,
      pgCode,
    };
  }
  if (pgCode === "23505") {
    return {
      ok: false,
      errorCode: "unique_violation",
      error: "Já existe um registro igual. Atualize a página e tente novamente.",
      status: 409,
      pgCode,
    };
  }
  if (pgCode === "42501") {
    return {
      ok: false,
      errorCode: "permission_denied",
      error: "Sem permissão pra esta operação no grupo.",
      status: 403,
      pgCode,
    };
  }
  if (pgCode === "PGRST116") {
    return {
      ok: false,
      errorCode: "not_found",
      error: "Criança não encontrada.",
      status: 404,
      pgCode,
    };
  }

  return {
    ok: false,
    errorCode: fallback,
    error: error.message?.trim() || "Erro inesperado ao operar criança.",
    status: 500,
    pgCode,
  };
}

/**
 * Verifica que (a) user é membro do grupo e (b) criança pertence ao grupo.
 * Roda quando `enforceMembership=true` (admin client). Custa 2 SELECTs
 * paralelos antes da escrita — vale a clareza de erros.
 */
async function gateChildInGroup(
  supabase: SupabaseClient,
  childId: string,
  groupId: string,
  userId: string,
): Promise<ChildServiceFailure | null> {
  const [membership, child] = await Promise.all([
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("children")
      .select("id, group_id")
      .eq("id", childId)
      .maybeSingle(),
  ]);

  if (!membership.data) {
    return {
      ok: false,
      errorCode: "permission_denied",
      error: "Sem permissão para este grupo.",
      status: 403,
    };
  }
  if (!child.data) {
    return {
      ok: false,
      errorCode: "not_found",
      error: "Criança não encontrada.",
      status: 404,
    };
  }
  if (child.data.group_id !== groupId) {
    return {
      ok: false,
      errorCode: "wrong_group",
      error: "Criança não pertence ao grupo informado.",
      status: 403,
    };
  }
  return null;
}

async function gateMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<ChildServiceFailure | null> {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      errorCode: "permission_denied",
      error: "Sem permissão para este grupo.",
      status: 403,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* createChild                                                         */
/* ------------------------------------------------------------------ */

export async function createChild(
  supabase: SupabaseClient,
  input: CreateChildInput,
  ctx: ServiceContext,
): Promise<ChildServiceResult<ChildRow>> {
  const { groupId, fullName, birthDate, sex, allergies, notes, childId } = input;

  // ── Validações de entrada ────────────────────────────────────────
  if (!groupId || !fullName?.trim() || !birthDate) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId, fullName e birthDate são obrigatórios.",
      status: 400,
    };
  }
  if (!isIsoDate(birthDate)) {
    return {
      ok: false,
      errorCode: "invalid_date",
      error: "birthDate deve estar em formato YYYY-MM-DD.",
      status: 400,
    };
  }
  if (isFutureDate(birthDate)) {
    return {
      ok: false,
      errorCode: "future_birthdate",
      error: "Data de nascimento não pode ser futura.",
      status: 400,
    };
  }

  // ── Membership gate (admin client only) ──────────────────────────
  if (ctx.enforceMembership && ctx.actorId) {
    const gate = await gateMembership(supabase, groupId, ctx.actorId);
    if (gate) return gate;
  }

  // ── Normalização de campos opcionais ────────────────────────────
  const normSex: "M" | "F" | null = sex === "M" || sex === "F" ? sex : null;
  const normAllergies = Array.isArray(allergies)
    ? allergies.map((a) => String(a).trim()).filter(Boolean)
    : null;
  const normNotes = notes?.trim() || null;

  // ── Insert ──────────────────────────────────────────────────────
  const insertPayload: Record<string, unknown> = {
    group_id: groupId,
    full_name: fullName.trim(),
    birth_date: birthDate,
    sex: normSex,
    allergies: normAllergies && normAllergies.length > 0 ? normAllergies : null,
    notes: normNotes,
  };
  if (childId) insertPayload.id = childId;

  const { data, error } = await supabase
    .from("children")
    .insert(insertPayload)
    .select("id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg")
    .single();

  if (error || !data) {
    const failure = mapPgError(error || { message: "no_data_returned" });
    void reportServerError(
      new Error(error?.message || "children_insert_failed"),
      {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: {
          op: "create",
          groupId,
          fullName,
          birthDate,
          pgCode: error?.code,
          pgDetails: error?.details,
          pgHint: error?.hint,
          mappedCode: failure.errorCode,
        },
      },
    );
    return failure;
  }

  // ── Side effects ────────────────────────────────────────────────
  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "child_added", { via: ctx.via });
    } catch {
      /* analytics não-crítico */
    }
  }

  return { ok: true, data: data as ChildRow };
}

/* ------------------------------------------------------------------ */
/* updateChild                                                         */
/* ------------------------------------------------------------------ */

export async function updateChild(
  supabase: SupabaseClient,
  input: UpdateChildInput,
  ctx: ServiceContext,
): Promise<ChildServiceResult<ChildRow>> {
  const { childId, groupId, patch } = input;

  if (!childId || !groupId) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId e childId obrigatórios.",
      status: 400,
    };
  }

  // ── Gate (admin client) ──────────────────────────────────────────
  if (ctx.enforceMembership && ctx.actorId) {
    const gate = await gateChildInGroup(supabase, childId, groupId, ctx.actorId);
    if (gate) return gate;
  }

  // ── Monta patch (só campos passados) ─────────────────────────────
  const updates: Record<string, unknown> = {};
  if (patch.fullName !== undefined) {
    const v = patch.fullName.trim();
    if (!v) {
      return {
        ok: false,
        errorCode: "missing_fields",
        error: "fullName não pode ser vazio.",
        status: 400,
      };
    }
    updates.full_name = v;
  }
  if (patch.birthDate !== undefined) {
    if (!isIsoDate(patch.birthDate)) {
      return {
        ok: false,
        errorCode: "invalid_date",
        error: "birthDate deve estar em YYYY-MM-DD.",
        status: 400,
      };
    }
    if (isFutureDate(patch.birthDate)) {
      return {
        ok: false,
        errorCode: "future_birthdate",
        error: "Data de nascimento não pode ser futura.",
        status: 400,
      };
    }
    updates.birth_date = patch.birthDate;
  }
  if (patch.sex !== undefined) {
    updates.sex = patch.sex === "M" || patch.sex === "F" ? patch.sex : null;
  }
  if (patch.allergies !== undefined) {
    const arr = Array.isArray(patch.allergies)
      ? patch.allergies.map((a) => String(a).trim()).filter(Boolean)
      : null;
    updates.allergies = arr && arr.length > 0 ? arr : null;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes?.trim() || null;
  }
  if (patch.cpf !== undefined) {
    updates.cpf = patch.cpf?.trim() || null;
  }
  if (patch.rg !== undefined) {
    updates.rg = patch.rg?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      errorCode: "no_changes",
      error: "Nada para atualizar.",
      status: 400,
    };
  }

  // ── Update ──────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("children")
    .update(updates)
    .eq("id", childId)
    .select("id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg")
    .single();

  if (error || !data) {
    const failure = mapPgError(error || { message: "no_data_returned" });
    void reportServerError(
      new Error(error?.message || "children_update_failed"),
      {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: {
          op: "update",
          childId,
          groupId,
          patchKeys: Object.keys(updates),
          pgCode: error?.code,
          pgDetails: error?.details,
          pgHint: error?.hint,
          mappedCode: failure.errorCode,
        },
      },
    );
    return failure;
  }

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "child_updated", { via: ctx.via });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, data: data as ChildRow };
}

/* ------------------------------------------------------------------ */
/* deleteChild                                                         */
/* ------------------------------------------------------------------ */

export async function deleteChild(
  supabase: SupabaseClient,
  input: DeleteChildInput,
  ctx: ServiceContext,
): Promise<ChildServiceResult<{ id: string }>> {
  const { childId, groupId } = input;

  if (!childId || !groupId) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId e childId obrigatórios.",
      status: 400,
    };
  }

  // ── Gate (admin client) ──────────────────────────────────────────
  if (ctx.enforceMembership && ctx.actorId) {
    const gate = await gateChildInGroup(supabase, childId, groupId, ctx.actorId);
    if (gate) return gate;
  }

  // ── Delete ──────────────────────────────────────────────────────
  // FK constraints (ON DELETE NO ACTION) em documents, events, expenses,
  // sensitive_notes — bloqueiam delete quando há vínculos. mapPgError()
  // traduz 23503 → mensagem humana.
  const { error } = await supabase
    .from("children")
    .delete()
    .eq("id", childId);

  if (error) {
    const failure = mapPgError(error);
    void reportServerError(
      new Error(error.message || "children_delete_failed"),
      {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: {
          op: "delete",
          childId,
          groupId,
          pgCode: error.code,
          pgDetails: error.details,
          pgHint: error.hint,
          mappedCode: failure.errorCode,
        },
      },
    );
    return failure;
  }

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "child_deleted", { via: ctx.via });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, data: { id: childId } };
}
