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
  const publicRoutes = [
    "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password",
    "/auth/callback", "/convite", "/session-recovery", "/native-bridge",
    "/api/calendar", "/api/setup-db", "/api/auth", "/pricing",
    "/suporte", "/privacidade", "/termos",
    "/api/stripe/webhook", "/api/whatsapp/webhook", "/api/discord", "/api/log-error",
    // Vercel cron routes — handlers validam CRON_SECRET via Bearer header.
    // Sem isso, middleware redireciona pra /session-recovery e cron nunca executa.
    "/api/cron",
    // Native-callable routes that authenticate via Bearer header. Each
    // route validates the Bearer token internally with the admin client.
    "/api/create-group",
    "/api/onboarding",
    "/api/health/save-prescription",
    "/api/iap/verify",
    "/api/billing/status",
    "/api/native",
    "/api/push",
    "/api/revenuecat",
    "/api/chat",
    // Wave G — native parity routes wrapping server actions
    "/api/settlements",
    "/api/family",
    "/api/invitations",
    // Wave H — second batch of single-source-of-truth routes
    "/api/decisions",
    "/api/activities",
    "/api/sensitive-notes",
    "/api/onboarding-quest",
    // Wave I — final P2 single-source-of-truth routes
    "/api/event-requests",
    "/api/documents",
    "/api/swaps",
    "/api/health/vaccines-bulk",
    "/api/health/vaccines",
    "/api/health/medication-doses",
    "/api/health/allergies",
    "/api/children/education",
    "/api/notifications/mark-read",
    "/api/notifications/mark-all-read",
    "/api/school",
    // AI endpoints — native uploads (image OCR, assistant chat) carry
    // Bearer auth instead of cookies. Each /api/ai/* handler validates
    // the token via admin client. Without this prefix the middleware
    // bounces the multipart POST to /session-recovery and the native
    // client renders the 500 HTML in the error banner.
    "/api/ai",
  ];
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
