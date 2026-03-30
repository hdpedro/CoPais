import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const rememberMe = cookieStore.get("remember_me")?.value !== "false";
            const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // If "Lembrar-me" is checked (default), persist for 30 days.
                // Set both maxAge AND expires for Safari compatibility.
                ...(rememberMe
                  ? { maxAge: 60 * 60 * 24 * 30, expires: thirtyDaysFromNow }
                  : {}),
                httpOnly: false, // Browser client must read these cookies
                sameSite: options?.sameSite ?? "lax",
                secure: true,
              })
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
