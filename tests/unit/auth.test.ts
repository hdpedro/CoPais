import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockRedirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockCookieStore, mockSupabase } = vi.hoisted(() => {
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  };
  const mockSupabase = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signInWithOAuth: vi.fn(),
      updateUser: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { mockCookieStore, mockSupabase };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import {
  signIn,
  signUp,
  signOut,
  resetPassword,
  updatePassword,
} from "@/actions/auth";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

// ---- signUp ---------------------------------------------------------------

describe("signUp", () => {
  it("redirects to /verify-email on success", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({ error: null });

    await expect(
      signUp(makeFormData({ email: "a@b.com", password: "123456", fullName: "Test" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com", password: "123456" })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/verify-email");
  });

  it("returns translated error on duplicate email", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      error: { message: "User already registered" },
    });

    const result = await signUp(
      makeFormData({ email: "a@b.com", password: "123456", fullName: "Test" })
    );

    expect(result).toEqual({ error: "Este e-mail já está cadastrado." });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("includes convite token in callback URL when provided", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({ error: null });

    await expect(
      signUp(
        makeFormData({
          email: "a@b.com",
          password: "123456",
          fullName: "Test",
          convite: "abc123",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");

    const callArg = mockSupabase.auth.signUp.mock.calls[0][0];
    expect(callArg.options.emailRedirectTo).toContain("next=%2Fconvite%2Fabc123");
  });
});

// ---- signIn ---------------------------------------------------------------

describe("signIn", () => {
  it("redirects to /dashboard on success", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      signIn(makeFormData({ email: "a@b.com", password: "123456" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "123456",
    });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns translated error on wrong password", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await signIn(
      makeFormData({ email: "a@b.com", password: "wrong" })
    );

    expect(result).toEqual({ error: "E-mail ou senha incorretos." });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /convite/:token when convite is present", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      signIn(makeFormData({ email: "a@b.com", password: "123456", convite: "tok1" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/convite/tok1");
  });

  it("sets remember_me cookie when checkbox is on", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      signIn(makeFormData({ email: "a@b.com", password: "123456", rememberMe: "on" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "remember_me",
      "true",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 30 })
    );
  });
});

// ---- signOut ---------------------------------------------------------------

describe("signOut", () => {
  it("signs out, clears cookie, and redirects to /login", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "remember_me",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// ---- resetPassword --------------------------------------------------------

describe("resetPassword", () => {
  it("returns success message on success", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await resetPassword(makeFormData({ email: "a@b.com" }));

    expect(result).toEqual({ success: "E-mail de recuperação enviado!" });
  });

  it("returns translated error on rate limit", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });

    const result = await resetPassword(makeFormData({ email: "a@b.com" }));

    expect(result).toEqual({
      error: "Muitas tentativas. Aguarde alguns minutos.",
    });
  });
});

// ---- updatePassword -------------------------------------------------------

describe("updatePassword", () => {
  it("redirects to /dashboard on success", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    await expect(
      updatePassword(makeFormData({ password: "newpass123" }))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
      password: "newpass123",
    });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns translated error when same password", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({
      error: {
        message: "New password should be different from the old password.",
      },
    });

    const result = await updatePassword(makeFormData({ password: "same" }));

    expect(result).toEqual({
      error: "A nova senha deve ser diferente da senha atual.",
    });
  });
});
