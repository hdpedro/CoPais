import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockSupabase, mockAdminStorage } = vi.hoisted(() => {
  const mockRedirect = vi.fn();
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  const mockAdminStorage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://storage.test/documents/group-1/file.pdf" },
      }),
    }),
  };
  return { mockRedirect, mockSupabase, mockAdminStorage };
});

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({ storage: mockAdminStorage }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-1" };

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v as any);
  return fd;
}

function fakeFile(name: string, size: number, type: string): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, writable: false, configurable: true });
  return file;
}

function chainMock(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { createDocument } from "@/actions/documents";

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

// ---- createDocument -------------------------------------------------------

describe("createDocument", () => {
  it("uploads and inserts document on success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    // membership check
    const memberChain = chainMock({ data: { group_id: "group-1" }, error: null });
    // child check
    const childChain = chainMock({ data: { id: "child-1" }, error: null });
    // insert document
    const insertChain = chainMock({ data: null, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "group_members") return memberChain;
      if (table === "children") return childChain;
      return insertChain;
    });

    const file = fakeFile("report.pdf", 5000, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Blood test",
      file,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/documentos");
  });

  it("redirects with error when file exceeds 10MB", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const bigFile = fakeFile("big.pdf", 11 * 1024 * 1024, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Big",
      file: bigFile,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Arquivo%20muito%20grande")
    );
  });

  it("redirects with error for invalid MIME type", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const badFile = fakeFile("script.sh", 100, "application/x-sh");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Script",
      file: badFile,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Tipo%20de%20arquivo")
    );
  });

  it("redirects with error when no file provided", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const emptyFile = fakeFile("", 0, "");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "None",
      file: emptyFile,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Selecione%20um%20arquivo")
    );
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const file = fakeFile("doc.pdf", 500, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Test",
      file,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects with error when user not in group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    // membership check returns null
    const memberChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(memberChain);

    const file = fakeFile("doc.pdf", 500, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Test",
      file,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Sem%20permissao")
    );
  });

  it("redirects with error when child not in group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    // membership OK
    const memberChain = chainMock({ data: { group_id: "group-1" }, error: null });
    // child NOT found
    const childChain = chainMock({ data: null, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "group_members") return memberChain;
      return childChain; // children or documents
    });

    const file = fakeFile("doc.pdf", 500, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Test",
      file,
    });

    await expect(createDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Crianca%20nao%20pertence")
    );
  });
});
