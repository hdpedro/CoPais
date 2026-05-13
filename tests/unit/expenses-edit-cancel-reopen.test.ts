import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests pros 4 novos endpoints de Despesas — Fase 1B:
 *   - editExpense
 *   - requestCancelExpense
 *   - respondToCancelRequest
 *   - reopenApproval
 *
 * Foco: regras de segurança (criador-only edit, reviewer-only reopen,
 * janela 24h) + state transitions (pending→cancelled vs approved→
 * cancel_pending) + audit log + collab notify fired.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockChain,
  mockSupabase,
  mockNotifyCollabCreate,
  mockCaptureServerEvent,
  mockLogExpenseHistory,
} = vi.hoisted(() => {
  const mockChain: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };
  for (const k of Object.keys(mockChain)) mockChain[k].mockReturnValue(mockChain);

  const mockSupabase = {
    from: vi.fn().mockReturnValue(mockChain),
  };

  return {
    mockChain,
    mockSupabase,
    mockNotifyCollabCreate: vi.fn().mockResolvedValue(undefined),
    mockCaptureServerEvent: vi.fn(),
    mockLogExpenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mockCaptureServerEvent }));
vi.mock("@/lib/services/collab", () => ({
  notifyCollabCreate: mockNotifyCollabCreate,
  // CollabPriority é só type — não precisa mockar
}));
vi.mock("@/lib/services/expense-history", () => ({
  logExpenseHistory: mockLogExpenseHistory,
}));
// Demais deps do service que não devem rodar
vi.mock("@/lib/push", () => ({ createNotificationWithPush: vi.fn() }));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn() }));
vi.mock("@/lib/whatsapp/notify", () => ({ notifyGroupViaWhatsApp: vi.fn() }));

import {
  editExpense,
  requestCancelExpense,
  respondToCancelRequest,
  reopenApproval,
} from "@/lib/services/expenses";

// Helper: configura o chain pra retornar uma expense + ack do update + group_members.
// Usa mockImplementation com contador interno em vez de mockResolvedValueOnce
// (que vaza queued values entre testes — Once não é limpo por clearAllMocks).
function stubExpense(expense: Record<string, unknown>, opts?: { isMember?: boolean }) {
  const isMember = opts?.isMember ?? true;
  let call = 0;
  mockChain.maybeSingle.mockReset();
  mockChain.maybeSingle.mockImplementation(() => {
    call++;
    if (call === 1) return Promise.resolve({ data: expense });
    // Subsequente: assume membership check
    return Promise.resolve({ data: isMember ? { user_id: "x" } : null });
  });
  mockChain.update.mockReset();
  mockChain.update.mockReturnValue({
    ...mockChain,
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(mockChain)) {
    if (typeof mockChain[k]?.mockReturnValue === "function") {
      mockChain[k].mockReset();
      mockChain[k].mockReturnValue(mockChain);
    }
  }
  mockSupabase.from.mockReturnValue(mockChain);
});

/* ========================================================================== */
/* editExpense                                                                 */
/* ========================================================================== */

describe("editExpense", () => {
  it("retorna 403 se actor não for o criador", async () => {
    stubExpense({
      id: "exp-1",
      group_id: "g1",
      paid_by: "other-user",
      status: "pending",
      description: "Old",
      amount: 100,
      category: "food",
      expense_date: "2026-01-01",
      child_id: null,
      priority: "info",
      edit_count: 0,
    });

    const result = await editExpense(mockSupabase as any, {
      expenseId: "exp-1",
      actorId: "me",
      patch: { amount: 150 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/Apenas quem criou/);
    }
  });

  it("bloqueia edit em despesa cancelada", async () => {
    stubExpense({
      id: "exp-1",
      group_id: "g1",
      paid_by: "me",
      status: "cancelled",
      description: "x",
      amount: 50,
      category: "food",
      expense_date: "2026-01-01",
      child_id: null,
      priority: "info",
      edit_count: 0,
    });

    const result = await editExpense(mockSupabase as any, {
      expenseId: "exp-1",
      actorId: "me",
      patch: { amount: 60 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cancelad/);
  });

  it("rejeita valor inválido (negativo ou zero)", async () => {
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "me", status: "pending",
      description: "x", amount: 50, category: "food", expense_date: "2026-01-01",
      child_id: null, priority: "info", edit_count: 0,
    });

    const result = await editExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", patch: { amount: -10 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/inválido/);
  });

  it("edita pending → mantém status pending (sem revert)", async () => {
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "me", status: "pending",
      description: "Old", amount: 100, category: "food", expense_date: "2026-01-01",
      child_id: null, priority: "info", edit_count: 0,
    });

    const result = await editExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", patch: { description: "New", amount: 120 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("pending");
    // Audit log gravado
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "edited" }),
    );
    // NÃO re-notifica (estava pending → continua pending)
    expect(mockNotifyCollabCreate).not.toHaveBeenCalled();
  });

  it("edita approved → REVERTE pra pending + re-notifica coparentes", async () => {
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "me", status: "approved",
      description: "Old", amount: 100, category: "food", expense_date: "2026-01-01",
      child_id: null, priority: "info", edit_count: 0,
    });

    const result = await editExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me",
      patch: { amount: 200 },
      actorDisplayName: "Amanda",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("pending");
    expect(mockNotifyCollabCreate).toHaveBeenCalledTimes(1);
    expect(mockNotifyCollabCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: "expense",
        title: expect.stringContaining("editou"),
      }),
    );
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      "me",
      "expense_edited",
      expect.objectContaining({ reverted_to_pending: true }),
    );
  });
});

/* ========================================================================== */
/* requestCancelExpense                                                        */
/* ========================================================================== */

describe("requestCancelExpense", () => {
  it("exige motivo obrigatório", async () => {
    const result = await requestCancelExpense(mockSupabase as any, {
      expenseId: "exp-1",
      actorId: "me",
      reason: "  ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/obrigatório/);
  });

  it("rejeita se actor não é o criador", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "other", status: "pending", description: "x", amount: 50, approved_by: null, priority: "info" });
    const result = await requestCancelExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", reason: "duplicada",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("pending → cancela direto (status='cancelled')", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "me", status: "pending", description: "x", amount: 50, approved_by: null, priority: "info" });
    const result = await requestCancelExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", reason: "duplicada",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("cancelled");
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancelled", reason: "duplicada" }),
    );
  });

  it("approved → vai pra cancel_pending + notifica reviewer", async () => {
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "me", status: "approved",
      description: "Compra", amount: 200, approved_by: "reviewer-id", priority: "info",
    });
    const result = await requestCancelExpense(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", reason: "comprei sem precisar",
      actorDisplayName: "Amanda",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("cancel_pending");
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel_requested" }),
    );
    expect(mockNotifyCollabCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: "expense",
        priority: "important",
        title: expect.stringContaining("quer cancelar"),
      }),
    );
  });
});

/* ========================================================================== */
/* respondToCancelRequest                                                      */
/* ========================================================================== */

describe("respondToCancelRequest", () => {
  it("bloqueia se status não é cancel_pending", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "amanda", status: "approved" });
    const result = await respondToCancelRequest(mockSupabase as any, {
      expenseId: "exp-1", reviewerId: "henrique", approved: true,
    });
    expect(result.ok).toBe(false);
  });

  it("criador não pode responder ao próprio pedido", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "amanda", status: "cancel_pending" });
    const result = await respondToCancelRequest(mockSupabase as any, {
      expenseId: "exp-1", reviewerId: "amanda", approved: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("approved=true → cancelled + audit", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "amanda", status: "cancel_pending", cancel_reason: "x" });
    const result = await respondToCancelRequest(mockSupabase as any, {
      expenseId: "exp-1", reviewerId: "henrique", approved: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("cancelled");
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancelled", actorId: "henrique" }),
    );
  });

  it("approved=false → restora pra approved + audit 'restored'", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "amanda", status: "cancel_pending", cancel_reason: "x" });
    const result = await respondToCancelRequest(mockSupabase as any, {
      expenseId: "exp-1", reviewerId: "henrique", approved: false, reason: "não concordo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("approved");
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "restored", reason: "não concordo" }),
    );
  });
});

/* ========================================================================== */
/* reopenApproval                                                              */
/* ========================================================================== */

describe("reopenApproval", () => {
  it("exige motivo obrigatório", async () => {
    const result = await reopenApproval(mockSupabase as any, {
      expenseId: "exp-1", actorId: "me", reason: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("só funciona em despesas approved", async () => {
    stubExpense({ id: "exp-1", group_id: "g1", paid_by: "amanda", status: "pending", approved_by: null, approved_at: null });
    const result = await reopenApproval(mockSupabase as any, {
      expenseId: "exp-1", actorId: "henrique", reason: "errei",
    });
    expect(result.ok).toBe(false);
  });

  it("só o approver original pode reabrir", async () => {
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "amanda", status: "approved",
      approved_by: "henrique", approved_at: new Date().toISOString(),
    });
    const result = await reopenApproval(mockSupabase as any, {
      expenseId: "exp-1", actorId: "outro", reason: "errei",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("bloqueia se aprovação tem mais de 24h", async () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "amanda", status: "approved",
      approved_by: "henrique", approved_at: longAgo,
    });
    const result = await reopenApproval(mockSupabase as any, {
      expenseId: "exp-1", actorId: "henrique", reason: "errei",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/24h/);
  });

  it("dentro de 24h → status volta a pending + audit + notifica criador", async () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    stubExpense({
      id: "exp-1", group_id: "g1", paid_by: "amanda", status: "approved",
      approved_by: "henrique", approved_at: recent,
      description: "Compra", amount: 150,
    });
    const result = await reopenApproval(mockSupabase as any, {
      expenseId: "exp-1", actorId: "henrique", reason: "vi errado",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("pending");
    expect(mockLogExpenseHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reopened", reason: "vi errado" }),
    );
    expect(mockNotifyCollabCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: "expense",
        priority: "important",
        title: expect.stringContaining("reaberta"),
      }),
    );
  });
});
