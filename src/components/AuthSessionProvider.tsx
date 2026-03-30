"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side auth session manager.
 * Mirrors the pattern used in the Hospeda app:
 * - Creates a Supabase browser client on mount
 * - Listens to onAuthStateChange to handle token refreshes
 * - autoRefreshToken keeps the session alive while the tab is open
 * - When Safari reopens after being closed, the initial getSession()
 *   reads tokens from cookies and triggers a refresh if needed
 */
export default function AuthSessionProvider() {
  useEffect(() => {
    const supabase = createClient();

    // Force an initial session check — this reads tokens from cookies
    // and triggers a refresh if the access token is expired.
    supabase.auth.getSession();

    // Listen for auth state changes (TOKEN_REFRESHED, SIGNED_IN, etc.)
    // This ensures cookies are updated when the client refreshes tokens.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, _session) => {
      // The Supabase client automatically writes refreshed tokens
      // to cookies via the setAll callback in createBrowserClient.
      // No additional action needed here.
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
