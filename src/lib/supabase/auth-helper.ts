import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

/**
 * Get the current user from session (no network call).
 * Safe to use in server components because middleware already validated
 * the user with getUser() on every request.
 *
 * Use this instead of supabase.auth.getUser() in page.tsx files
 * to avoid a duplicate network call to Supabase Auth (~100-200ms saved).
 */
export async function getSessionUser(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; user: User | null }> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, user: session?.user ?? null };
}
