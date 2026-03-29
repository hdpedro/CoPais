import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          const rememberMe = request.cookies.get("remember_me")?.value !== "false";
          const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // If "Lembrar-me" is checked (default), persist for 30 days.
              // Set both maxAge AND expires for Safari compatibility.
              ...(rememberMe
                ? { maxAge: 60 * 60 * 24 * 30, expires: thirtyDaysFromNow }
                : {}),
              sameSite: options?.sameSite ?? "lax",
              secure: true,
            })
          );
        },
      },
    }
  );

  // IMPORTANT: Use getUser() — it makes a network call to Supabase Auth,
  // validates the session, and triggers a token refresh when the access token
  // is expired but the refresh token is still valid. This is essential for
  // Safari/iOS where closing the browser lets the access token expire (~1h).
  // Without this, users would be redirected to login every time they reopen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except public routes)
  const publicRoutes = ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback", "/convite", "/api/calendar", "/api/setup-db", "/api/auth"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );
  const isRootRoute = request.nextUrl.pathname === "/";

  if (!user && !isPublicRoute && !isRootRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
