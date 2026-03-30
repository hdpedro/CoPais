import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockSupabase, mockGetActiveGroup, mockAdminFrom, mockAdminClient } = vi.hoisted(() => {
  const mockRedirect = vi.fn();
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  const mockGetActiveGroup = vi.fn();
  const mockAdminStorage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://storage.test/doc.pdf" },
      }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
  const mockAdminFrom = vi.fn();
  const mockAdminClient = {
    storage: mockAdminStorage,
    from: mockAdminFrom,
  };
  return { mockRedirect, mockSupabase, mockGetActiveGroup, mockAdminFrom, mockAdminClient };
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

vi.mock("@/lib/group-utils", () => ({
  getActiveGroup: (...args: any[]) => mockGetActiveGroup(...args),
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue(mockAdminClient),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-1" };
const ACTIVE_GROUP = {
  groupId: "group-1",
  role: "parent",
  groupName: "Familia",
  isReadonly: false,
  memberships: [],
  hasMultipleGroups: false,
};

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v as any);
  }
  return fd;
}

function fakeFile(
  name: string,
  size: number,
  type: string
): File {
  // Create a real File with the right type, then override size
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, writable: false, configurable: true });
  return file;
}

/** Helper to set up a Supabase chained query mock */
function chainMock(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  uploadChildDocument,
  deleteChildDocument,
  upsertChildEducation,
} from "@/actions/children";

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

// ---- uploadChildDocument --------------------------------------------------

describe("uploadChildDocument", () => {
  it("uploads successfully and redirects", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // insert into documents table
    const insertChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(insertChain);

    const file = fakeFile("doc.pdf", 5000, "application/pdf");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Exam",
      file,
    });

    await expect(uploadChildDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/criancas/child-1?tab=documentos")
    );
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

    await expect(uploadChildDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Arquivo%20muito%20grande")
    );
  });

  it("redirects with error for invalid MIME type", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const exeFile = fakeFile("virus.exe", 500, "application/x-msdownload");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "Bad",
      file: exeFile,
    });

    await expect(uploadChildDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Tipo%20de%20arquivo")
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

    await expect(uploadChildDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects with error when no file is provided", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const emptyFile = fakeFile("", 0, "");
    const fd = makeFormData({
      groupId: "group-1",
      childId: "child-1",
      category: "medical",
      name: "No file",
      file: emptyFile,
    });

    await expect(uploadChildDocument(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("Selecione%20um%20arquivo")
    );
  });
});

// ---- deleteChildDocument --------------------------------------------------

describe("deleteChildDocument", () => {
  it("deletes successfully and returns success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    // find document
    const docChain = chainMock({
      data: {
        id: "doc-1",
        file_url: "https://test.supabase.co/storage/v1/object/public/documents/group-1/file.pdf",
        group_id: "group-1",
      },
      error: null,
    });
    mockSupabase.from.mockReturnValue(docChain);
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // admin delete chain
    const adminDeleteChain = chainMock({ data: null, error: null });
    mockAdminFrom.mockReturnValue(adminDeleteChain);

    const result = await deleteChildDocument("doc-1", "child-1");

    expect(result).toEqual({ success: true });
  });

  it("returns error when document not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const docChain = chainMock({ data: null, error: null });
    mockSupabase.from.mockReturnValue(docChain);

    const result = await deleteChildDocument("nonexistent", "child-1");

    expect(result).toEqual({ error: "Documento não encontrado." });
  });

  it("returns error when user not in document group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });

    const docChain = chainMock({
      data: { id: "doc-1", file_url: "https://x.co/f.pdf", group_id: "other-group" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(docChain);
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP); // group-1

    const result = await deleteChildDocument("doc-1", "child-1");

    expect(result).toEqual({ error: "Sem permissão." });
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      deleteChildDocument("doc-1", "child-1")
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// ---- upsertChildEducation -------------------------------------------------

describe("upsertChildEducation", () => {
  it("inserts education record on success (no existing record)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue(ACTIVE_GROUP);

    // child belongs to group
    const childChain = chainMock({ data: { id: "child-1" }, error: null });
    // existing education check returns null
    const existingChain = chainMock({ data: null, error: null });
    // insert succeeds
    const insertChain = chainMock({ data: null, error: null });

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++;
      if (table === "children") return childChain;
      if (table === "child_education" && callCount <= 3) return existingChain;
      return insertChain;
    });

    const fd = makeFormData({
      childId: "child-1",
      groupId: "group-1",
      school_name: "Escola ABC",
      school_address: "",
      school_phone: "",
      grade: "3",
      class_name: "",
      teacher_name: "",
      coordinator_name: "",
      entry_time: "08:00",
      exit_time: "12:00",
      extracurricular_activities: "",
    });

    await expect(upsertChildEducation(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/criancas/child-1?tab=educacao")
    );
  });

  it("redirects to /login when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const fd = makeFormData({
      childId: "child-1",
      groupId: "group-1",
      school_name: "Test",
      school_address: "",
      school_phone: "",
      grade: "",
      class_name: "",
      teacher_name: "",
      coordinator_name: "",
      entry_time: "",
      exit_time: "",
      extracurricular_activities: "",
    });

    await expect(upsertChildEducation(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /dashboard when user not in group", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockGetActiveGroup.mockResolvedValue({
      ...ACTIVE_GROUP,
      groupId: "other-group",
    });

    const fd = makeFormData({
      childId: "child-1",
      groupId: "group-1",
      school_name: "Test",
      school_address: "",
      school_phone: "",
      grade: "",
      class_name: "",
      teacher_name: "",
      coordinator_name: "",
      entry_time: "",
      exit_time: "",
      extracurricular_activities: "",
    });

    await expect(upsertChildEducation(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard?error=")
    );
  });
});
