import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * i18n locale cookie — server reads via getRequestLocale (src/i18n/server.ts).
 * Client reads/writes via I18nProvider (src/i18n/provider.tsx).
 * KEEP IN SYNC with both: cookie name "kindar-locale".
 */
const LOCALE_COOKIE = "kindar-locale";
const SUPPORTED_LOCALES = ["pt", "en", "es", "fr", "de"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Resolve preferred locale from Accept-Language header. Used to seed the
 * cookie on first visit so server components can render in the user's
 * language immediately (no client-side flicker). Honors RFC 7231 q-values.
 */
function detectLocaleFromHeader(header: string | null): SupportedLocale {
  if (!header) return "pt";
  const ranked = header
    .split(",")
    .map((tag) => {
      const [lang, ...params] = tag.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        primary: lang.split("-")[0]?.toLowerCase() || "",
        q: q ? parseFloat(q.split("=")[1]) || 0 : 1,
      };
    })
    .sort((a, b) => b.q - a.q);
  for (const { primary } of ranked) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary as SupportedLocale;
    }
  }
  return "pt";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  /* ------------------------------------------------------------------ */
  /* i18n: seed locale cookie on first visit                              */
  /*                                                                      */
  /* Why here: middleware runs at the Edge BEFORE any Server Component    */
  /* renders. If the cookie isn't set, the user's first dashboard render  */
  /* would default to pt-BR even when their browser asks for en/es/fr/de. */
  /* Setting the cookie now means src/i18n/server.ts:getRequestLocale     */
  /* reads it on the same request and the page renders in the right      */
  /* language with zero flicker.                                          */
  /*                                                                      */
  /* Fase 0 gate (ENABLE_LOCALE_SWITCH=0 default):                        */
  /*   Force pt regardless of Accept-Language. This is the correct        */
  /*   "stop the bleeding" — without it, a Chrome-en user would get       */
  /*   the 3 refactored Server Components in EN and the other ~27 pages   */
  /*   still in PT, producing a worse half-translated UX than pt-only.    */
  /*   When the feature flag flips to "1" (post-cleanup), middleware      */
  /*   resumes honoring Accept-Language for first-visit users.            */
  /*                                                                      */
  /* User can still override via LanguageSelector in /perfil when the     */
  /* flag is ON; that path writes the same cookie client-side.            */
  /* ------------------------------------------------------------------ */
  const localeSwitchEnabled =
    process.env.NEXT_PUBLIC_ENABLE_LOCALE_SWITCH === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_LOCALE_SWITCH === "true";

  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const needsCookie =
    !existingLocale ||
    (!localeSwitchEnabled && existingLocale !== "pt");

  if (needsCookie) {
    const target = localeSwitchEnabled
      ? detectLocaleFromHeader(request.headers.get("accept-language"))
      : "pt";
    request.cookies.set(LOCALE_COOKIE, target);
    supabaseResponse.cookies.set(LOCALE_COOKIE, target, {
      maxAge: 60 * 60 * 24 * 365, // 1 year — preference, not session.
      sameSite: "lax",
      secure: true,
      httpOnly: false, // Client needs to read it to keep provider in sync.
      path: "/",
    });
  }

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
    "/auth/callback",
    // /auth/confirm — Tier A token_hash flow (signup/magiclink/recovery/email_change).
    // Sem essa rota pública, link de e-mail (que sempre é clicado SEM sessão)
    // bounce pra /session-recovery → quebra todo o fluxo de confirmação cross-device.
    "/auth/confirm",
    "/convite", "/session-recovery", "/native-bridge",
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
    // /api/children/* — Native chama create/edit/delete + subrotas
    // (sizes, education). Cada handler valida Bearer via resolveAuthenticatedUser.
    // Sem esse prefix, middleware bouncava /api/children/<id>/sizes pra
    // /session-recovery → toast "Falha ao registrar tamanho" no Native
    // (Henrique 2026-05-19). /api/children/education já era listado individual;
    // o prefix /api/children é superset, mas mantemos os dois pra rastreio.
    "/api/children",
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
