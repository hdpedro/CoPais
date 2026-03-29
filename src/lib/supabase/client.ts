import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        // Force 30-day persistence — Safari ITP may cap JS-set cookies to 7 days,
        // but the middleware refreshes them server-side on every request.
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax" as const,
        secure: true,
      },
    }
  );
}
