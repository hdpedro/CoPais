"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const LS_KEY = "kindar-auth-backup";
const RECOVERY_FLAG = "kindar-recovering";

/**
 * Client-side auth session manager with localStorage backup.
 *
 * Safari/iOS aggressively clears cookies (ITP), but NEVER clears localStorage.
 * This component:
 * 1. On every auth state change, backs up tokens to localStorage
 * 2. On mount, if cookies are gone but localStorage has tokens,
 *    restores the session and reloads so middleware sees fresh cookies
 */
export default function AuthSessionProvider() {
  useEffect(() => {
    const supabase = createClient();

    // Try to restore session: first from cookies, then from localStorage
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Session exists in cookies — back it up to localStorage
        try {
          localStorage.setItem(
            LS_KEY,
            JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            })
          );
        } catch {}
        return;
      }

      // No session in cookies — try restoring from localStorage backup.
      // Use sessionStorage flag to prevent infinite reload loops.
      const isRecovering = sessionStorage.getItem(RECOVERY_FLAG);
      if (isRecovering) {
        // Already tried recovery this tab session — don't loop.
        sessionStorage.removeItem(RECOVERY_FLAG);
        return;
      }

      try {
        const backup = localStorage.getItem(LS_KEY);
        if (!backup) return;

        const { access_token, refresh_token } = JSON.parse(backup);
        if (!access_token || !refresh_token) return;

        // Mark that we're attempting recovery before the reload
        sessionStorage.setItem(RECOVERY_FLAG, "1");

        // setSession validates tokens and triggers a refresh if needed.
        // On success, the Supabase client writes new tokens to cookies
        // via the setAll callback, restoring the server-side session.
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error || !data.session) {
          // Tokens were expired/invalid — clean up
          localStorage.removeItem(LS_KEY);
          sessionStorage.removeItem(RECOVERY_FLAG);
          return;
        }

        // Session restored! Reload the page so middleware sees fresh cookies
        // and serves the correct authenticated content.
        window.location.reload();
      } catch {
        // localStorage not available or corrupt — clean up
        try {
          localStorage.removeItem(LS_KEY);
          sessionStorage.removeItem(RECOVERY_FLAG);
        } catch {}
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Clear localStorage backup on logout
        try {
          localStorage.removeItem(LS_KEY);
          sessionStorage.removeItem(RECOVERY_FLAG);
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
    };
  }, []);

  return null;
}
