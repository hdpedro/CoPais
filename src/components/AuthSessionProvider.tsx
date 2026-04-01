"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPersistenceClient } from "@/lib/supabase/persistence";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * Syncs the SSR Supabase client (cookies) → persistence client (localStorage).
 *
 * Safari/iOS aggressively clears cookies (ITP), but NEVER clears localStorage.
 * The persistence client uses the standard @supabase/supabase-js which stores
 * tokens in localStorage automatically (same approach as the Hospeda app).
 *
 * On every auth event and visibility change, we copy the current session from
 * cookies to localStorage. When cookies are lost, /session-recovery reads
 * from the persistence client's localStorage to restore the session.
 */
export default function AuthSessionProvider() {
  useEffect(() => {
    const ssrClient = createClient();
    const persistClient = getPersistenceClient();

    // Sync current session from cookies to localStorage
    async function syncToLocalStorage() {
      const { data: { session } } = await ssrClient.auth.getSession();
      if (session) {
        await persistClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
    }

    // Sync on mount
    syncToLocalStorage();

    // Sync when user returns to the tab (captures middleware-refreshed tokens)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        syncToLocalStorage();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Listen for auth state changes on the SSR client
    const {
      data: { subscription },
    } = ssrClient.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        await persistClient.auth.signOut();
      } else if (session) {
        await persistClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
