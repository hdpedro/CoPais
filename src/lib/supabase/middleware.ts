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
              httpOnly: false, // Browser client must read these cookies
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
    // Safari ITP may have cleared auth cookies but localStorage still has tokens.
    // If kindar-has-session flag exists, the user had a valid session before.
    // Let the page load so client-side AuthSessionProvider can restore from localStorage.
    const hadSession = request.cookies.get("kindar-has-session")?.value === "1";
    if (hadSession) {
      // Allow the request through — client-side will attempt session recovery.
      // Set a header so the client knows this is a recovery scenario.
      supabaseResponse.headers.set("x-session-recovery", "1");
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // When user is authenticated, ensure the has-session flag is set.
  // This long-lived cookie survives Safari ITP (server-set, HttpOnly, 1 year).
  if (user) {
    const hasFlag = request.cookies.get("kindar-has-session")?.value === "1";
    if (!hasFlag) {
      supabaseResponse.cookies.set("kindar-has-session", "1", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
