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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // If "Lembrar-me" is checked (default), persist for 30 days.
                // Otherwise, omit maxAge so the cookie expires when the browser closes.
                ...(rememberMe
                  ? { maxAge: options?.maxAge ?? 60 * 60 * 24 * 30 }
                  : {}),
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
