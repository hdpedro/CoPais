import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with the service role key.
 * Bypasses RLS — use only in server-side code (API routes, server actions).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
