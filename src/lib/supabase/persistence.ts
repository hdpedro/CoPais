/**
 * Supabase client for localStorage-based session persistence.
 *
 * Safari ITP clears cookies but NEVER clears localStorage.
 * This client uses the standard @supabase/supabase-js createClient
 * (same as the Hospeda app) which stores tokens in localStorage
 * via persistSession: true.
 *
 * Used by:
 * - AuthSessionProvider: syncs cookie-based session → localStorage
 * - /session-recovery: restores localStorage session → cookies
 */
import { createClient } from "@supabase/supabase-js";

let persistenceClient: ReturnType<typeof createClient> | null = null;

export function getPersistenceClient() {
  if (persistenceClient) return persistenceClient;

  persistenceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // SSR client handles URL detection
        storageKey: "kindar-auth-persist", // distinct from SSR cookies
      },
    }
  );

  return persistenceClient;
}
