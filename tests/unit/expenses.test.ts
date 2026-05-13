import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockChain, mockSupabase, mockVerifyGroupMembership, mockAdminClient } =
  vi.hoisted(() => {
    const mockRedirect = vi.fn();

    const mockChain: Record<string, any> = {
      select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
      eq: vi.fn(), neq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(),
      order: vi.fn(), limit: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
    };
    for (const key of Object.keys(mockChain)) mockChain[key].mockReturnValue(mockChain);

    const mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn().mockReturnValue(mockChain),
      storage: { from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test/receipt.pdf" } }),
      }) },
    };

    const mockAdminStorage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test/receipt.pdf" } }),
    };
    const mockAdminClient = {
      from: vi.fn().mockReturnValue(mockChain),
      storage: { from: vi.fn().mockReturnValue(mockAdminStorage) },
    };

    const mockVerifyGroupMembership = vi.fn();

    return { mockRedirect, mockChain, mockSupabase, mockVerifyGroupMembership, mockAdminClient };
  });

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

// "server-only" guard fail-fasts em build pra prevenir bundling no client.
// Em Vitest (Node) o marker não tem significado — stubamos.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => { mockRedirect(...args); throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockSupabase) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn().mockReturnValue(mockAdminClient) }));
vi.mock("@/lib/auth-utils", () => ({ verifyGroupMembership: mockVerifyGroupMembership }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({
  createNotificationWithPush: vi.fn().mockResolvedValue(undefined),
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat-notify", () => ({ postChatNotification: vi.fn().mockResolvedValue(undefined) }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createExpense, updateExpenseStatus, deleteExpense } from "@/actions/expenses";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

function setupChain() {
  for (const key of Object.keys(mockChain)) {
    if (typeof mockChain[key]?.mockReturnValue === "function") {
      mockChain[key].mockReturnValue(mockChain);
    }
  }
  mockChain.then = (r: any) => r({ data: null, error: null });
  // Service uses maybeSingle for membership/child/expense lookups; default
  // to a row that satisfies "user is a member" so flow proceeds.
  mockChain.single.mockResolvedValue({ data: { id: "child-1" }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: { user_id: "test-user-id", id: "child-1" },
    error: null,
  });
}

function expectRedirectContains(text: string) {
  const call = mockRedirect.mock.calls[0]?.[0] ?? "";
  const match = call.includes(text) || call.includes(encodeURIComponent(text)) || decodeURIComponent(call).includes(text);
  expect(match).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("expenses actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null,
    });
    mockVerifyGroupMembership.mockResolvedValue({ role: "admin" });
  });

  // -------------------------------------------------------------------------
  // createExpense
  // -------------------------------------------------------------------------

  describe("createExpense", () => {
    const base = {
      groupId: "group-1", childId: "child-1", category: "saude",
      description: "Consulta pediatra", amount: "250.00", expenseDate: "2026-06-15",
    };

    it("creates an expense and redirects with success", async () => {
      await expect(createExpense(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/despesas?success=");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(createExpense(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("creates an expense with receipt upload", async () => {
      const f = fd(base);
      const file = new File(["fake-receipt"], "receipt.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 });
      f.set("receipt", file);
      await expect(createExpense(f)).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/despesas?success=");
    });

    it("redirects with error for zero amount", async () => {
      await expect(createExpense(fd({ ...base, amount: "0" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Valor invalido");
    });

    it("redirects with error for negative amount", async () => {
      await expect(createExpense(fd({ ...base, amount: "-10" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Valor invalido");
    });

    it("redirects with error when user has no membership", async () => {
      // Action chama resolveActorName (profiles → maybeSingle) ANTES de
      // delegar ao service que faz verifyMembership (group_members →
      // maybeSingle). Mockamos os 2 em ordem.
      mockChain.maybeSingle
        .mockResolvedValueOnce({ data: { display_name: "Test", full_name: "Test User" }, error: null }) // resolveActorName
        .mockResolvedValueOnce({ data: null, error: null }); // verifyMembership → null = não-membro
      await expect(createExpense(fd(base))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Sem permissao");
    });

    it("rejects receipt with invalid MIME type", async () => {
      const f = fd(base);
      const file = new File(["data"], "malicious.exe", { type: "application/x-msdownload" });
      Object.defineProperty(file, "size", { value: 1024 });
      f.set("receipt", file);
      await expect(createExpense(f)).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Tipo de arquivo nao permitido");
    });
  });

  // -------------------------------------------------------------------------
  // updateExpenseStatus
  // -------------------------------------------------------------------------

  describe("updateExpenseStatus", () => {
    it("approves an expense from another user", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "other-user-id", description: "Consulta", amount: 250, status: "pending" },
        error: null,
      });
      await expect(
        updateExpenseStatus(fd({ expenseId: "exp-1", status: "approved" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/despesas");
    });

    it("rejects an expense", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "other-user-id", description: "Consulta", amount: 250, status: "pending" },
        error: null,
      });
      await expect(
        updateExpenseStatus(fd({ expenseId: "exp-1", status: "rejected", rejectionReason: "Duplicada" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/despesas");
    });

    it("blocks self-approval", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "test-user-id", description: "Minha", amount: 100, status: "pending" },
        error: null,
      });
      await expect(
        updateExpenseStatus(fd({ expenseId: "exp-1", status: "approved" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("nao pode aprovar sua propria despesa");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(
        updateExpenseStatus(fd({ expenseId: "exp-1", status: "approved" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("blocks status regression from approved to pending", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "other-user-id", description: "Consulta", amount: 250, status: "approved" },
        error: null,
      });
      await expect(
        updateExpenseStatus(fd({ expenseId: "exp-1", status: "pending" })),
      ).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Nao e possivel reverter");
    });
  });

  // -------------------------------------------------------------------------
  // deleteExpense
  // -------------------------------------------------------------------------

  describe("deleteExpense", () => {
    it("deletes a pending expense created by the user", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "test-user-id", status: "pending" },
        error: null,
      });
      await expect(deleteExpense(fd({ expenseId: "exp-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("/despesas?success=");
    });

    it("blocks deletion by non-creator", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "other-user-id", status: "pending" },
        error: null,
      });
      await expect(deleteExpense(fd({ expenseId: "exp-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Apenas quem criou pode excluir");
    });

    it("blocks deletion of already-approved expense", async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { group_id: "group-1", paid_by: "test-user-id", status: "approved" },
        error: null,
      });
      await expect(deleteExpense(fd({ expenseId: "exp-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expectRedirectContains("Despesas aprovadas nao podem ser excluidas");
    });

    it("redirects to /login when unauthenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(deleteExpense(fd({ expenseId: "exp-1" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });
  });
});
