/**
 * Tests do `services/balance-operations.ts` — single source of truth pra
 * mutations em custody_balance_operations (PWA action + Native API).
 *
 * Foco:
 *   - Validações de entrada (campos, tipo de operação, days, self-op)
 *   - Mapeamento PG → BalanceServiceFailure
 *     - 23503 → fk_violation (409)
 *     - 23514 → check_violation (400)
 *     - 23505 → unique_violation (409)
 *     - 42501 → permission_denied (403)
 *     - PGRST116 → not_found (404)
 *   - Membership gate (admin client) bloqueia non-members e quando target sai
 *   - Race condition em respondToBalanceOperation (UPDATE com WHERE status='pending')
 *   - createBalanceOperation NÃO inclui `direction` no payload — banco computa
 *     via trigger derive_custody_balance_direction (00103)
 *
 * Cobre regressões do bug Angelino (2026-05-29: Native mandava direction
 * inválido). A defesa em duas camadas (DB trigger + service compartilhado)
 * garante que esse bug não pode mais nascer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockChain,
  mockSupabase,
  mockCaptureServerEvent,
  mockReportServerError,
  mockCreateNotificationWithPush,
  mockPostChatNotification,
} = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  for (const k of Object.keys(chain)) {
    chain[k].mockReturnValue(chain);
  }

  return {
    mockChain: chain,
    mockSupabase: { from: vi.fn().mockReturnValue(chain) },
    mockCaptureServerEvent: vi.fn(),
    mockReportServerError: vi.fn().mockResolvedValue(undefined),
    mockCreateNotificationWithPush: vi.fn().mockResolvedValue(undefined),
    mockPostChatNotification: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: mockCaptureServerEvent,
}));
vi.mock("@/lib/error-tracking/report-server", () => ({
  reportServerError: mockReportServerError,
}));
vi.mock("@/lib/push", () => ({
  createNotificationWithPush: mockCreateNotificationWithPush,
}));
vi.mock("@/lib/chat-notify", () => ({
  postChatNotification: mockPostChatNotification,
}));

import {
  createBalanceOperation,
  listBalanceOperations,
  mapPgError,
  respondToBalanceOperation,
  type BalanceOperationType,
} from "@/lib/services/balance-operations";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = mockSupabase as unknown as SupabaseClient;

const CTX = {
  actorId: "user-1",
  callerPath: "tests/unit/balance-operations-service.test.ts",
  enforceMembership: false,
  via: "test",
};
const CTX_ENFORCE = { ...CTX, enforceMembership: true };

function resetChain() {
  for (const k of Object.keys(mockChain)) {
    mockChain[k].mockReset();
    mockChain[k].mockReturnValue(mockChain);
  }
  mockSupabase.from.mockReset();
  mockSupabase.from.mockReturnValue(mockChain);
}

function stubSingle(result: {
  data: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  } | null;
}) {
  mockChain.single.mockResolvedValueOnce(result);
}

function stubMaybeSingles(...results: Array<{ data: unknown; error?: unknown }>) {
  for (const r of results) {
    mockChain.maybeSingle.mockResolvedValueOnce(r);
  }
}

function stubListResult(result: {
  data: unknown;
  error?: { code?: string; message?: string } | null;
}) {
  // .limit() é o ponto terminal da chain de list — retorna Promise direto
  mockChain.limit.mockResolvedValueOnce(result);
}

beforeEach(() => {
  resetChain();
  mockCaptureServerEvent.mockClear();
  mockReportServerError.mockClear();
  mockCreateNotificationWithPush.mockClear();
  mockPostChatNotification.mockClear();
});

// ---------------------------------------------------------------------------
// mapPgError
// ---------------------------------------------------------------------------

describe("mapPgError", () => {
  it("23503 (FK) → fk_violation com 409", () => {
    const f = mapPgError({ code: "23503", message: "violates fk" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("fk_violation");
      expect(f.status).toBe(409);
      expect(f.pgCode).toBe("23503");
    }
  });

  it("23514 (check) → check_violation com 400", () => {
    const f = mapPgError({ code: "23514", message: "violates check" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("check_violation");
      expect(f.status).toBe(400);
    }
  });

  it("23505 (unique) → unique_violation com 409", () => {
    const f = mapPgError({ code: "23505", message: "duplicate" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("unique_violation");
      expect(f.status).toBe(409);
    }
  });

  it("42501 (RLS) → permission_denied com 403", () => {
    const f = mapPgError({ code: "42501", message: "denied" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("permission_denied");
      expect(f.status).toBe(403);
    }
  });

  it("PGRST116 (.single() no row) → not_found com 404", () => {
    const f = mapPgError({ code: "PGRST116", message: "no rows" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("not_found");
      expect(f.status).toBe(404);
    }
  });

  it("código desconhecido → db_error 500 com message original", () => {
    const f = mapPgError({ code: "99999", message: "weird" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.errorCode).toBe("db_error");
      expect(f.status).toBe(500);
      expect(f.error).toBe("weird");
    }
  });

  it("sem code nem message → fallback genérico", () => {
    const f = mapPgError({});
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain("Erro inesperado");
  });
});

// ---------------------------------------------------------------------------
// createBalanceOperation
// ---------------------------------------------------------------------------

describe("createBalanceOperation", () => {
  const baseInput = {
    groupId: "g1",
    proposerId: "user-1",
    targetUserId: "user-2",
    operationType: "debit" as BalanceOperationType,
    days: 1,
  };

  it("rejeita quando faltam campos obrigatórios", async () => {
    const r = await createBalanceOperation(
      sb,
      { ...baseInput, groupId: "" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("missing_fields");
      expect(r.status).toBe(400);
    }
  });

  it("rejeita operationType inválido (vetor original do bug Angelino)", async () => {
    const r = await createBalanceOperation(
      sb,
      { ...baseInput, operationType: "to_target" as BalanceOperationType },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("invalid_operation_type");
  });

  it("rejeita days < 1", async () => {
    const r = await createBalanceOperation(sb, { ...baseInput, days: 0 }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("invalid_days");
  });

  it("rejeita days > 365", async () => {
    const r = await createBalanceOperation(sb, { ...baseInput, days: 9999 }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("invalid_days");
  });

  it("rejeita self-operation", async () => {
    const r = await createBalanceOperation(
      sb,
      { ...baseInput, targetUserId: "user-1" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("self_operation");
  });

  it("payload do INSERT NÃO inclui direction (banco computa via trigger)", async () => {
    stubSingle({
      data: {
        id: "op1",
        group_id: "g1",
        operation_type: "debit",
        status: "pending",
        days: 1,
        direction: "proposer_gains",
        proposed_by: "user-1",
        target_user_id: "user-2",
        swap_request_id: null,
        related_date: null,
        notes: null,
        responded_by: null,
        responded_at: null,
        created_at: "2026-05-29T00:00:00Z",
      },
      error: null,
    });
    // profiles fetch pro side effect
    stubSingle({ data: { full_name: "Henrique" }, error: null });
    // chat_channels fetch
    stubSingle({ data: { id: "ch1" }, error: null });

    await createBalanceOperation(sb, baseInput, CTX);

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const payload = mockChain.insert.mock.calls[0][0];
    expect(payload).not.toHaveProperty("direction");
    expect(payload.operation_type).toBe("debit");
    expect(payload.status).toBe("pending");
  });

  it("mapeia PG 23514 (check_violation) — protege se trigger DB falhar", async () => {
    stubSingle({
      data: null,
      error: { code: "23514", message: "violates check constraint" },
    });
    const r = await createBalanceOperation(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("check_violation");
    expect(mockReportServerError).toHaveBeenCalledTimes(1);
  });

  it("membership gate (admin client) bloqueia non-member proposer", async () => {
    stubMaybeSingles({ data: null }, { data: { role: "member" } });
    const r = await createBalanceOperation(sb, baseInput, CTX_ENFORCE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("not_member");
      expect(r.status).toBe(403);
    }
  });

  it("membership gate bloqueia quando target saiu do grupo", async () => {
    stubMaybeSingles({ data: { role: "admin" } }, { data: null });
    const r = await createBalanceOperation(sb, baseInput, CTX_ENFORCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("target_not_member");
  });

  it("sucesso dispara captureServerEvent com operation_type + days", async () => {
    stubSingle({
      data: {
        id: "op1",
        group_id: "g1",
        operation_type: "gift_day",
        status: "pending",
        days: 2,
        direction: "neutral",
        proposed_by: "user-1",
        target_user_id: "user-2",
        swap_request_id: null,
        related_date: null,
        notes: null,
        responded_by: null,
        responded_at: null,
        created_at: "2026-05-29T00:00:00Z",
      },
      error: null,
    });
    stubSingle({ data: { full_name: "Henrique" }, error: null });
    stubSingle({ data: { id: "ch1" }, error: null });

    const r = await createBalanceOperation(
      sb,
      { ...baseInput, operationType: "gift_day", days: 2 },
      CTX,
    );
    expect(r.ok).toBe(true);
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "user-1",
      "balance_operation_created",
      { operation_type: "gift_day", days: 2, via: "test" },
    );
  });
});

// ---------------------------------------------------------------------------
// respondToBalanceOperation
// ---------------------------------------------------------------------------

describe("respondToBalanceOperation", () => {
  const baseInput = {
    operationId: "op1",
    responderId: "user-2",
    decision: "approved" as const,
  };

  const pendingRow = {
    id: "op1",
    group_id: "g1",
    operation_type: "debit",
    status: "pending",
    days: 1,
    direction: "proposer_gains",
    proposed_by: "user-1",
    target_user_id: "user-2",
    swap_request_id: null,
    related_date: null,
    notes: null,
    responded_by: null,
    responded_at: null,
    created_at: "2026-05-29T00:00:00Z",
  };

  it("rejeita decision inválida", async () => {
    const r = await respondToBalanceOperation(
      sb,
      { ...baseInput, decision: "maybe" as unknown as "approved" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("missing_fields");
  });

  it("not_found quando operation não existe", async () => {
    stubMaybeSingles({ data: null });
    const r = await respondToBalanceOperation(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("not_found");
  });

  it("wrong_recipient quando responder não é o target", async () => {
    stubMaybeSingles({ data: pendingRow });
    const r = await respondToBalanceOperation(
      sb,
      { ...baseInput, responderId: "user-3" },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("wrong_recipient");
  });

  it("already_processed quando status já não é pending", async () => {
    stubMaybeSingles({ data: { ...pendingRow, status: "approved" } });
    const r = await respondToBalanceOperation(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("already_processed");
  });

  it("race condition — UPDATE retorna 0 rows (outro caller pegou primeiro)", async () => {
    stubMaybeSingles({ data: pendingRow });
    // UPDATE com .eq('status', 'pending') retorna null em maybeSingle
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null });
    const r = await respondToBalanceOperation(sb, baseInput, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("already_processed");
      expect(r.status).toBe(409);
    }
  });

  it("sucesso dispara captureServerEvent com decision", async () => {
    stubMaybeSingles({ data: pendingRow });
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        ...pendingRow,
        status: "approved",
        responded_by: "user-2",
        responded_at: "2026-05-29T00:00:00Z",
      },
    });
    // side effects: profiles + chat_channels
    stubSingle({ data: { full_name: "Amanda" }, error: null });
    stubSingle({ data: { id: "ch1" }, error: null });

    const r = await respondToBalanceOperation(sb, baseInput, CTX);
    expect(r.ok).toBe(true);
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "user-1",
      "balance_operation_responded",
      { operation_type: "debit", decision: "approved", via: "test" },
    );
  });
});

// ---------------------------------------------------------------------------
// listBalanceOperations
// ---------------------------------------------------------------------------

describe("listBalanceOperations", () => {
  it("rejeita quando groupId vazio", async () => {
    const r = await listBalanceOperations(sb, { groupId: "" }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("missing_fields");
  });

  it("normaliza proposerName e targetName (primeiro nome)", async () => {
    stubListResult({
      data: [
        {
          id: "op1",
          group_id: "g1",
          operation_type: "debit",
          status: "pending",
          days: 1,
          direction: "proposer_gains",
          proposed_by: "u1",
          target_user_id: "u2",
          swap_request_id: null,
          related_date: null,
          notes: null,
          responded_by: null,
          responded_at: null,
          created_at: "2026-05-29T00:00:00Z",
          proposer: { full_name: "Henrique de Pedro" },
          target: { full_name: "Amanda Teixeira" },
        },
      ],
      error: null,
    });
    const r = await listBalanceOperations(sb, { groupId: "g1" }, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0].proposerName).toBe("Henrique");
      expect(r.data[0].targetName).toBe("Amanda");
    }
  });

  it("fallback 'Alguém' quando profile não tem full_name", async () => {
    stubListResult({
      data: [
        {
          id: "op1",
          group_id: "g1",
          operation_type: "debit",
          status: "pending",
          days: 1,
          direction: "proposer_gains",
          proposed_by: "u1",
          target_user_id: "u2",
          swap_request_id: null,
          related_date: null,
          notes: null,
          responded_by: null,
          responded_at: null,
          created_at: "2026-05-29T00:00:00Z",
          proposer: null,
          target: { full_name: null },
        },
      ],
      error: null,
    });
    const r = await listBalanceOperations(sb, { groupId: "g1" }, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0].proposerName).toBe("Alguém");
      expect(r.data[0].targetName).toBe("Alguém");
    }
  });

  it("membership gate bloqueia non-member com admin client", async () => {
    stubMaybeSingles({ data: null });
    const r = await listBalanceOperations(sb, { groupId: "g1" }, CTX_ENFORCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("not_member");
  });
});
