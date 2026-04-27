/**
 * Admin auth — env-based allowlist. Keep this mechanism simple until the
 * admin team grows past ~10 people; at that point, switch to a
 * `profiles.is_admin` column with an invite flow.
 *
 * ADMIN_EMAILS in Vercel env = comma-separated list of emails.
 * Example: "henrique@kindar.com.br,founder@kindar.com.br"
 *
 * This allowlist is read server-side only — never exposed to the client.
 * There is no NEXT_PUBLIC variant, and pages that call isAppAdmin run in
 * Server Components / Route Handlers.
 */

export interface AdminUser {
  id: string;
  email: string | null;
}

export function isAppAdmin(user: AdminUser | null | undefined): boolean {
  if (!user?.email) return false;
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(user.email.toLowerCase());
}

/**
 * Throws if the current user is not an admin. Use at the top of admin
 * route handlers and Server Components to fail fast.
 */
export function assertAdmin(user: AdminUser | null | undefined): void {
  if (!isAppAdmin(user)) {
    throw new Error("FORBIDDEN: admin access required");
  }
}
