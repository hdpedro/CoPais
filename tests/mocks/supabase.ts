/**
 * Shared Supabase mock for unit testing server actions.
 *
 * Server actions use `createClient()` from `@/lib/supabase/server`
 * which depends on Next.js `cookies()`. We mock the entire chain.
 */
import { vi } from "vitest";

// Chainable query builder mock
export function createQueryMock(returnData: unknown = [], returnError: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const chainFn = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") return undefined; // Not a promise
          if (prop === "data") return returnData;
          if (prop === "error") return returnError;
          if (!chain[prop]) {
            chain[prop] = vi.fn().mockReturnValue(chainFn());
          }
          return chain[prop];
        },
      }
    ) as any;

  return chainFn();
}

// Single-row result mock
export function createSingleMock(data: unknown = null, error: unknown = null) {
  // Override .single() to return { data, error }
  const singleResult = { data, error };
  const originalFrom = vi.fn().mockImplementation(() => {
    const q = createQueryMock();
    q.single = vi.fn().mockResolvedValue(singleResult);
    q.maybeSingle = vi.fn().mockResolvedValue(singleResult);
    return q;
  });

  return originalFrom;
}

// Full Supabase client mock
export function createMockSupabaseClient(overrides: Record<string, any> = {}) {
  const defaultFrom = vi.fn().mockReturnValue(createQueryMock());

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "test-user-id" } } },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://oauth.test" }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      ...overrides.auth,
    },
    from: overrides.from || defaultFrom,
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://storage.test/file.pdf" } }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
      ...overrides.storage,
    },
    ...overrides,
  };
}

// Unauthenticated client mock
export function createUnauthenticatedClient() {
  return createMockSupabaseClient({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  });
}

// Mock FormData helper
export function createMockFormData(entries: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

// Mock File helper
export function createMockFile(name = "test.pdf", size = 1024, type = "application/pdf"): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}
