/**
 * Regression tests for `upsertSupabaseUser` (src/lib/social-auth-helpers.ts).
 *
 * Prod bug (2026-07-01, owner locked out of Apple + Google sign-in):
 *   The email lookup used a single page — `listUsers({ page: 1, perPage: 200 })`.
 *   Once prod crossed 200 users (215), accounts past page 1 (the OLDEST ones,
 *   since the listing is newest-first) were never found. The lookup fell
 *   through to createUser, which failed with
 *   "A user with this email address has already been registered".
 *
 * The fix paginates through every page and adds a createUser recovery fallback.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateAdminClient, listUsers, updateUserById, createUser } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { upsertSupabaseUser } from "@/lib/social-auth-helpers";

const PER_PAGE = 200;

/** Build `count` fake auth users; the last ones are the oldest (page 2+). */
function makeUsers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    email: `user${i}@example.com`,
    user_metadata: {},
  }));
}

/** Wire listUsers to paginate over a fixed roster (newest-first order). */
function servePaginated(roster: Array<{ id: string; email: string; user_metadata: unknown }>) {
  listUsers.mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) => {
    const start = (page - 1) * perPage;
    return { data: { users: roster.slice(start, start + perPage) }, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUserById.mockResolvedValue({ data: {}, error: null });
  createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  mockCreateAdminClient.mockReturnValue({
    auth: { admin: { listUsers, updateUserById, createUser } },
  });
});

describe("upsertSupabaseUser — page-2 lookup (prod repro)", () => {
  it("finds a returning user living on page 2 of 215 and does NOT recreate them", async () => {
    const roster = makeUsers(215);
    // The owner is the 3rd-OLDEST account -> position 213 in a newest-first
    // listing -> page 2. The old single-page scan missed exactly this.
    const owner = roster[213];
    owner.email = "henrique.de.pedro@gmail.com";
    owner.id = "owner-id";
    servePaginated(roster);

    const result = await upsertSupabaseUser({
      email: "henrique.de.pedro@gmail.com",
      sub: "apple-sub-xyz",
      provider: "apple",
    });

    expect(result).toEqual({ userId: "owner-id", isNew: false });
    // Paginated past page 1 to reach the owner...
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: PER_PAGE });
    expect(listUsers).toHaveBeenCalledWith({ page: 2, perPage: PER_PAGE });
    // ...merged provider info without recreating the account.
    expect(updateUserById).toHaveBeenCalledWith(
      "owner-id",
      expect.objectContaining({
        user_metadata: expect.objectContaining({ provider: "apple", apple_sub: "apple-sub-xyz" }),
      }),
    );
    expect(createUser).not.toHaveBeenCalled();
  });

  it("case-insensitively matches the stored email", async () => {
    const roster = makeUsers(215);
    roster[210].email = "Owner@Example.com";
    roster[210].id = "case-id";
    servePaginated(roster);

    const result = await upsertSupabaseUser({
      email: "owner@example.com",
      sub: "g-sub",
      provider: "google",
    });

    expect(result).toEqual({ userId: "case-id", isNew: false });
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("upsertSupabaseUser — genuinely new user", () => {
  it("creates the user when the email is on no page", async () => {
    servePaginated(makeUsers(215)); // none match the new email
    const result = await upsertSupabaseUser({
      email: "brand-new@example.com",
      sub: "sub-new",
      provider: "google",
    });
    expect(result).toEqual({ userId: "new-user", isNew: true });
    expect(createUser).toHaveBeenCalledOnce();
  });
});

describe("upsertSupabaseUser — createUser recovery fallback", () => {
  it("recovers by re-scanning when createUser reports the email already exists", async () => {
    // First full scan misses (empty), so createUser is attempted and fails;
    // the re-scan then finds the freshly-visible row -> merge, no throw.
    listUsers
      .mockResolvedValueOnce({ data: { users: [] }, error: null }) // scan 1: miss
      .mockResolvedValueOnce({
        data: { users: [{ id: "raced-id", email: "race@example.com", user_metadata: {} }] },
        error: null,
      }); // scan 2 (recovery): hit
    createUser.mockResolvedValueOnce({
      data: null,
      error: { message: "A user with this email address has already been registered" },
    });

    const result = await upsertSupabaseUser({
      email: "race@example.com",
      sub: "sub-race",
      provider: "apple",
    });

    expect(result).toEqual({ userId: "raced-id", isNew: false });
    expect(updateUserById).toHaveBeenCalledWith("raced-id", expect.any(Object));
  });

  it("still throws when the user is truly uncreatable and unfindable", async () => {
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    createUser.mockResolvedValueOnce({
      data: null,
      error: { message: "some other failure" },
    });

    await expect(
      upsertSupabaseUser({ email: "ghost@example.com", sub: "s", provider: "google" }),
    ).rejects.toThrow(/supabase_create_user_failed/);
  });
});
