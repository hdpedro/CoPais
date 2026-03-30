"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const LS_KEY = "kindar-auth-backup";

/**
 * Client-side auth session manager with localStorage backup.
 *
 * Safari/iOS aggressively clears cookies (ITP), but NEVER clears localStorage.
 * This component:
 * 1. On mount and on every visibility change, backs up current tokens to localStorage
 * 2. On every auth state change (SIGNED_IN, TOKEN_REFRESHED), backs up tokens
 * 3. On SIGNED_OUT, clears the backup
 *
 * Recovery is handled by /session-recovery page (middleware redirects there
 * when no auth cookies exist).
 */
export default function AuthSessionProvider() {
  useEffect(() => {
    const supabase = createClient();

    // Back up current session tokens to localStorage
    function backupSession() {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          try {
            localStorage.setItem(
              LS_KEY,
              JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              })
            );
          } catch {}
        }
      });
    }

    // Back up on mount (captures middleware-refreshed tokens)
    backupSession();

    // Back up when user returns to the tab (captures any server-side token refresh)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        backupSession();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
      } else if (session) {
        // Back up tokens on every auth event (SIGNED_IN, TOKEN_REFRESHED, etc.)
        try {
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            })
          );
        } catch {}
      }
    });

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
