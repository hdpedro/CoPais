/* ------------------------------------------------------------------ */
/* services/balance-operations.ts                                      */
/* Single source of truth pra mutations em custody_balance_operations. */
/* Callers (wrappers finos):                                           */
/*   - src/actions/balance-operations.ts (PWA server actions)          */
/*   - src/app/api/balance-operations/route.ts (Native POST/GET)       */
/*   - src/app/api/balance-operations/[id]/route.ts (Native PATCH)     */
/*                                                                     */
/* Por que existe (2026-05-29):                                        */
/*   Bug do user Angelino: clicar "Propor ajuste" no Native disparava  */
/*   `custody_balance_operations_direction_check` violation porque a   */
/*   função `directionForType` no Native retornava                     */
/*   'to_proposer'/'to_target' (valores inventados, jamais aceitos     */
/*   pelo CHECK constraint que exige                                   */
/*   'proposer_gains' | 'target_gains' | 'neutral' | 'both_zero').     */
/*                                                                     */
/*   PWA tinha o mapeamento correto desde sempre. Native nunca foi     */
/*   alinhado — mesmo padrão do bug `stance` das Decisões (2026-05-18) */
/*   e `swap proposed_date direction` (2026-05-01).                    */
/*                                                                     */
/*   Solução em 2 camadas:                                             */
/*   (a) Banco: trigger BEFORE INSERT computa direction a partir de    */
/*       operation_type (migrations 00102 + 00103). Cliente nunca mais */
/*       erra esse campo.                                              */
/*   (b) Arquitetura: este service centraliza create/respond/list +    */
/*       side effects (push, chat) + mapeamento PG humano. PWA action  */
/*       e API REST viram thin wrappers.                               */
/*                                                                     */
/* Mapeamento de erros PG (testado em                                  */
/* tests/unit/balance-operations-service.test.ts):                     */
/*   23503  → fk_violation        (FK violation — group ou user some)  */
/*   23514  → check_violation     (operation_type inválido)            */
/*   23505  → unique_violation                                         */
/*   42501  → permission_denied   (RLS bloqueou)                       */
/*   PGRST116 → not_found         (.single() não achou)                */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export type BalanceOperationType =
  | "debit"
  | "credit"
  | "waive"
  | "gift_day"
  | "forgive_balance"
  | "reset_balance"
  | "manual_adjustment";

export type BalanceOperationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type BalanceErrorCode =
  | "missing_fields"
  | "invalid_operation_type"
  | "invalid_days"
  | "self_operation"
  | "not_member"
  | "target_not_member"
  | "not_found"
  | "wrong_recipient"
  | "already_processed"
  | "fk_violation"
  | "check_violation"
  | "unique_violation"
  | "permission_denied"
  | "db_error";

export interface BalanceServiceFailure {
  ok: false;
  error: string;
  errorCode: BalanceErrorCode;
  status: number;
  pgCode?: string;
}

export interface BalanceServiceSuccess<T> {
  ok: true;
  data: T;
}

export type BalanceServiceResult<T> =
  | BalanceServiceSuccess<T>
  | BalanceServiceFailure;

export interface BalanceOperationRow {
  id: string;
  group_id: string;
  operation_type: BalanceOperationType;
  status: BalanceOperationStatus;
  days: number;
  direction: string | null;
  proposed_by: string;
  target_user_id: string;
  swap_request_id: string | null;
  related_date: string | null;
  notes: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface CreateBalanceOperationInput {
  groupId: string;
  proposerId: string;
  targetUserId: string;
  operationType: BalanceOperationType;
  days?: number;
  notes?: string | null;
  swapRequestId?: string | null;
  relatedDate?: string | null;
}

export interface RespondBalanceOperationInput {
  operationId: string;
  responderId: string;
  decision: "approved" | "rejected";
}

export interface ListBalanceOperationsInput {
  groupId: string;
  limit?: number;
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
  /** Origem (analytics). Ex: "calendario_screen_pwa", "native_app". */
  via?: string;
}

/* ------------------------------------------------------------------ */
/* Catálogos (compartilhados com UI via re-export)                     */
/* ------------------------------------------------------------------ */

export const OPERATION_LABELS: Record<BalanceOperationType, string> = {
  debit: "Débito",
  credit: "Crédito",
  waive: "Isenção",
  gift_day: "Doação de dia",
  forgive_balance: "Perdão de saldo",
  reset_balance: "Zeramento consensual",
  manual_adjustment: "Ajuste manual",
};

export const OPERATION_ICONS: Record<BalanceOperationType, string> = {
  debit: "📅",
  credit: "📅",
  waive: "🤝",
  gift_day: "🎁",
  forgive_balance: "⚖️",
  reset_balance: "🧹",
  manual_adjustment: "🔧",
};

const VALID_OPERATION_TYPES: ReadonlySet<BalanceOperationType> = new Set([
  "debit",
  "credit",
  "waive",
  "gift_day",
  "forgive_balance",
  "reset_balance",
  "manual_adjustment",
]);

const ROW_COLUMNS =
  "id, group_id, operation_type, status, days, direction, proposed_by, " +
  "target_user_id, swap_request_id, related_date, notes, responded_by, " +
  "responded_at, created_at";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Normaliza erro do Supabase em BalanceServiceFailure com mensagem humana.
 * Exportado pra testes e reuso.
 */
export function mapPgError(
  error: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  },
  fallback: BalanceErrorCode = "db_error",
): BalanceServiceFailure {
  const pgCode = error.code;

  if (pgCode === "23503") {
    return {
      ok: false,
      errorCode: "fk_violation",
      error:
        "Não consegui criar a proposta: grupo ou usuário referenciado não existe mais.",
      status: 409,
      pgCode,
    };
  }
  if (pgCode === "23514") {
    return {
      ok: false,
      errorCode: "check_violation",
      error:
        "Algum campo está com valor inválido (tipo de operação ou direção).",
      status: 400,
      pgCode,
    };
  }
  if (pgCode === "23505") {
    return {
      ok: false,
      errorCode: "unique_violation",
      error: "Já existe uma proposta igual. Atualize a página e tente de novo.",
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
      error: "Proposta não encontrada.",
      status: 404,
      pgCode,
    };
  }

  return {
    ok: false,
    errorCode: fallback,
    error: error.message?.trim() || "Erro inesperado ao operar saldo.",
    status: 500,
    pgCode,
  };
}

/**
 * Verifica que (a) actor é membro do grupo e (b) target também.
 * Roda quando `enforceMembership=true` (admin client bypassa RLS).
 */
async function gateBothMembers(
  supabase: SupabaseClient,
  groupId: string,
  actorId: string,
  targetUserId: string,
): Promise<BalanceServiceFailure | null> {
  const [actor, target] = await Promise.all([
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", actorId)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", targetUserId)
      .maybeSingle(),
  ]);

  if (!actor.data) {
    return {
      ok: false,
      errorCode: "not_member",
      error: "Sem permissão para este grupo.",
      status: 403,
    };
  }
  if (!target.data) {
    return {
      ok: false,
      errorCode: "target_not_member",
      error: "Destinatário não pertence ao grupo.",
      status: 403,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* createBalanceOperation                                              */
/* ------------------------------------------------------------------ */

export async function createBalanceOperation(
  supabase: SupabaseClient,
  input: CreateBalanceOperationInput,
  ctx: ServiceContext,
): Promise<BalanceServiceResult<BalanceOperationRow>> {
  const {
    groupId,
    proposerId,
    targetUserId,
    operationType,
    days = 1,
    notes = null,
    swapRequestId = null,
    relatedDate = null,
  } = input;

  // ── Validações de entrada ────────────────────────────────────────
  if (!groupId || !proposerId || !targetUserId || !operationType) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId, proposerId, targetUserId e operationType são obrigatórios.",
      status: 400,
    };
  }
  if (!VALID_OPERATION_TYPES.has(operationType)) {
    return {
      ok: false,
      errorCode: "invalid_operation_type",
      error: `operationType inválido: ${operationType}.`,
      status: 400,
    };
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return {
      ok: false,
      errorCode: "invalid_days",
      error: "days deve ser inteiro entre 1 e 365.",
      status: 400,
    };
  }
  if (targetUserId === proposerId) {
    return {
      ok: false,
      errorCode: "self_operation",
      error: "Não é possível criar operação consigo mesmo.",
      status: 400,
    };
  }

  // ── Membership gate (admin client only) ──────────────────────────
  if (ctx.enforceMembership) {
    const gate = await gateBothMembers(supabase, groupId, proposerId, targetUserId);
    if (gate) return gate;
  }

  // ── Insert (direction omitido — trigger 00103 preenche) ──────────
  const { data, error } = await supabase
    .from("custody_balance_operations")
    .insert({
      group_id: groupId,
      operation_type: operationType,
      proposed_by: proposerId,
      target_user_id: targetUserId,
      status: "pending",
      days,
      notes: notes?.trim() || null,
      swap_request_id: swapRequestId || null,
      related_date: relatedDate || null,
    })
    .select(ROW_COLUMNS)
    .single();

  if (error || !data) {
    const failure = mapPgError(error || { message: "no_data_returned" });
    void reportServerError(
      new Error(error?.message || "balance_op_insert_failed"),
      {
        filePath: ctx.callerPath,
        severity: "error",
        userId: ctx.actorId,
        metadata: {
          op: "create",
          groupId,
          operationType,
          days,
          pgCode: error?.code,
          pgDetails: error?.details,
          pgHint: error?.hint,
          mappedCode: failure.errorCode,
        },
      },
    );
    return failure;
  }

  const row = data as unknown as BalanceOperationRow;

  // ── Side effects (push + chat) — falhas não bloqueiam ────────────
  void fireCreateSideEffects(supabase, row, ctx);

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "balance_operation_created", {
        operation_type: operationType,
        days,
        via: ctx.via,
      });
    } catch {
      /* analytics não-crítico */
    }
  }

  return { ok: true, data: row };
}

async function fireCreateSideEffects(
  supabase: SupabaseClient,
  row: BalanceOperationRow,
  ctx: ServiceContext,
): Promise<void> {
  let proposerName = "Alguém";
  try {
    const { data: proposerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", row.proposed_by)
      .single();
    proposerName = proposerProfile?.full_name?.split(" ")[0] || "Alguém";
  } catch {
    /* fallback */
  }

  const label =
    OPERATION_LABELS[row.operation_type] || String(row.operation_type);
  const icon = OPERATION_ICONS[row.operation_type] || "⚖️";
  const daysSuffix = row.days > 1 ? ` (${row.days} dias)` : "";

  // Push pro target
  try {
    await createNotificationWithPush(
      row.target_user_id,
      "balance_proposal",
      "Proposta de Saldo",
      `${proposerName} propôs: ${label}${daysSuffix}`,
      "/calendario",
    );
  } catch (caught) {
    void reportServerError(caught, {
      filePath: ctx.callerPath,
      severity: "warning",
      userId: ctx.actorId,
      metadata: { phase: "push_create", balanceOpId: row.id },
    });
  }

  // Chat notification
  try {
    const notesSuffix = row.notes ? ` — ${row.notes}` : "";
    await postChatNotification(
      supabase,
      row.group_id,
      row.proposed_by,
      `${icon} Proposta: ${label}${daysSuffix}${notesSuffix}`,
    );
  } catch (caught) {
    void reportServerError(caught, {
      filePath: ctx.callerPath,
      severity: "warning",
      userId: ctx.actorId,
      metadata: { phase: "chat_create", balanceOpId: row.id },
    });
  }
}

/* ------------------------------------------------------------------ */
/* respondToBalanceOperation                                           */
/* ------------------------------------------------------------------ */

export async function respondToBalanceOperation(
  supabase: SupabaseClient,
  input: RespondBalanceOperationInput,
  ctx: ServiceContext,
): Promise<BalanceServiceResult<BalanceOperationRow>> {
  const { operationId, responderId, decision } = input;

  if (!operationId || !responderId || !decision) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "operationId, responderId e decision são obrigatórios.",
      status: 400,
    };
  }
  if (decision !== "approved" && decision !== "rejected") {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "decision deve ser 'approved' ou 'rejected'.",
      status: 400,
    };
  }

  // ── Fetch + gate (atomicidade via WHERE status='pending' no UPDATE) ─
  const { data: op } = await supabase
    .from("custody_balance_operations")
    .select(ROW_COLUMNS)
    .eq("id", operationId)
    .maybeSingle();

  if (!op) {
    return {
      ok: false,
      errorCode: "not_found",
      error: "Proposta não encontrada.",
      status: 404,
    };
  }
  const opRow = op as unknown as BalanceOperationRow;
  if (opRow.target_user_id !== responderId) {
    return {
      ok: false,
      errorCode: "wrong_recipient",
      error: "Apenas o destinatário pode responder.",
      status: 403,
    };
  }
  if (opRow.status !== "pending") {
    return {
      ok: false,
      errorCode: "already_processed",
      error: "Esta operação já foi processada.",
      status: 409,
    };
  }

  // ── Update com guard de race condition ──────────────────────────
  const { data: updated, error: updateError } = await supabase
    .from("custody_balance_operations")
    .update({
      status: decision,
      responded_by: responderId,
      responded_at: new Date().toISOString(),
    })
    .eq("id", operationId)
    .eq("status", "pending")
    .select(ROW_COLUMNS)
    .maybeSingle();

  if (updateError) {
    const failure = mapPgError(updateError);
    void reportServerError(new Error(updateError.message), {
      filePath: ctx.callerPath,
      severity: "error",
      userId: ctx.actorId,
      metadata: {
        op: "respond",
        operationId,
        decision,
        pgCode: updateError.code,
        mappedCode: failure.errorCode,
      },
    });
    return failure;
  }
  if (!updated) {
    // Race: outro caller pegou primeiro
    return {
      ok: false,
      errorCode: "already_processed",
      error: "Esta operação já foi processada.",
      status: 409,
    };
  }

  const updatedRow = updated as unknown as BalanceOperationRow;

  void fireRespondSideEffects(supabase, updatedRow, decision, ctx);

  if (ctx.actorId) {
    try {
      captureServerEvent(ctx.actorId, "balance_operation_responded", {
        operation_type: updatedRow.operation_type,
        decision,
        via: ctx.via,
      });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, data: updatedRow };
}

async function fireRespondSideEffects(
  supabase: SupabaseClient,
  row: BalanceOperationRow,
  decision: "approved" | "rejected",
  ctx: ServiceContext,
): Promise<void> {
  let responderName = "Alguém";
  try {
    const { data: responderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", row.responded_by || "")
      .single();
    responderName = responderProfile?.full_name?.split(" ")[0] || "Alguém";
  } catch {
    /* fallback */
  }

  const label =
    OPERATION_LABELS[row.operation_type] || String(row.operation_type);
  const statusText = decision === "approved" ? "aprovada" : "recusada";
  const icon = decision === "approved" ? "✅" : "❌";

  try {
    await createNotificationWithPush(
      row.proposed_by,
      "balance_response",
      decision === "approved" ? "Proposta Aceita" : "Proposta Recusada",
      `${responderName} ${statusText}: ${label}`,
      "/calendario",
    );
  } catch (caught) {
    void reportServerError(caught, {
      filePath: ctx.callerPath,
      severity: "warning",
      userId: ctx.actorId,
      metadata: { phase: "push_respond", balanceOpId: row.id },
    });
  }

  try {
    await postChatNotification(
      supabase,
      row.group_id,
      row.responded_by || row.target_user_id,
      `${icon} ${label} ${statusText}`,
    );
  } catch (caught) {
    void reportServerError(caught, {
      filePath: ctx.callerPath,
      severity: "warning",
      userId: ctx.actorId,
      metadata: { phase: "chat_respond", balanceOpId: row.id },
    });
  }
}

/* ------------------------------------------------------------------ */
/* listBalanceOperations                                               */
/* ------------------------------------------------------------------ */

export interface BalanceOperationWithNames extends BalanceOperationRow {
  proposerName: string;
  targetName: string;
}

export async function listBalanceOperations(
  supabase: SupabaseClient,
  input: ListBalanceOperationsInput,
  ctx: ServiceContext,
): Promise<BalanceServiceResult<BalanceOperationWithNames[]>> {
  const { groupId, limit = 100 } = input;

  if (!groupId) {
    return {
      ok: false,
      errorCode: "missing_fields",
      error: "groupId é obrigatório.",
      status: 400,
    };
  }

  // ── Membership gate (admin client only) ──────────────────────────
  if (ctx.enforceMembership && ctx.actorId) {
    const { data: actor } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", ctx.actorId)
      .maybeSingle();
    if (!actor) {
      return {
        ok: false,
        errorCode: "not_member",
        error: "Sem permissão para este grupo.",
        status: 403,
      };
    }
  }

  const { data, error } = await supabase
    .from("custody_balance_operations")
    .select(
      `${ROW_COLUMNS},
       proposer:profiles!custody_balance_operations_proposed_by_fkey(full_name),
       target:profiles!custody_balance_operations_target_user_id_fkey(full_name)`,
    )
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);

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

  // Supabase tipa joins como array ([{...}]) mesmo com FK 1:1. Normalizamos
  // pegando o primeiro item (ou objeto direto, dependendo de versão do SDK).
  type ProfileJoin = { full_name: string | null } | { full_name: string | null }[] | null;
  function firstName(p: ProfileJoin): string {
    if (!p) return "Alguém";
    const obj = Array.isArray(p) ? p[0] : p;
    return obj?.full_name?.split(" ")[0] || "Alguém";
  }
  const rows = (data || []).map((raw) => {
    const r = raw as unknown as BalanceOperationRow & {
      proposer?: ProfileJoin;
      target?: ProfileJoin;
    };
    return {
      ...r,
      proposerName: firstName(r.proposer ?? null),
      targetName: firstName(r.target ?? null),
    } as BalanceOperationWithNames;
  });

  return { ok: true, data: rows };
}
