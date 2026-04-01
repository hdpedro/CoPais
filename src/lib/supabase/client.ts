import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax" as const,
        secure: true,
      },
    }
  );

  // Safari ITP backup: mirror session to localStorage on every auth change.
  // Cookies may be wiped by ITP, but localStorage survives.
  browserClient.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    if (session) {
      try {
        localStorage.setItem("kindar-auth-backup", JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        }));
      } catch { /* quota exceeded or private mode */ }
    } else if (event === "SIGNED_OUT") {
      try { localStorage.removeItem("kindar-auth-backup"); } catch {}
    }
  });

  return browserClient;
}
