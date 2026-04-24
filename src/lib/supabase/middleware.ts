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
          const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // ALWAYS persist for 30 days. Safari ITP aggressively clears
              // session cookies (no maxAge) when closing PWA/browser.
              // Server-set cookies with explicit maxAge survive ITP better.
              maxAge: 60 * 60 * 24 * 30,
              expires: thirtyDaysFromNow,
              httpOnly: false,
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

  // Redirect unauthenticated users (except public routes).
  //
  // /native-bridge is public because the native WebView injects the session
  // into localStorage with the SSR storage key (sb-{ref}-auth-token) BEFORE
  // this request arrives. The page then calls supabase.auth.setSession() to
  // materialize cookies, which middleware will see on the *next* request to
  // the actual target (?next=/…). Without this allowlist, middleware would
  // bounce to /session-recovery, which uses different localStorage keys
  // (kindar-auth-persist, kindar-auth-backup) and can't see the native's
  // injected session → falls through to /login.
  const publicRoutes = ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback", "/convite", "/session-recovery", "/native-bridge", "/api/calendar", "/api/setup-db", "/api/auth", "/pricing", "/suporte", "/privacidade", "/termos", "/api/stripe/webhook", "/api/whatsapp/webhook", "/api/discord", "/api/log-error"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );
  const isRootRoute = request.nextUrl.pathname === "/";

  if (!user && !isPublicRoute && !isRootRoute) {
    // Safari ITP clears auth cookies but localStorage survives.
    // Redirect to /session-recovery which checks localStorage for backup tokens.
    // If tokens are valid, it restores cookies and redirects to the original page.
    // If not, it redirects to /login. User sees a spinner, not a login form.
    const url = request.nextUrl.clone();
    url.pathname = "/session-recovery";
    url.searchParams.set("next", request.nextUrl.pathname);
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
