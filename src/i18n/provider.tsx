"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { type Locale, DEFAULT_LOCALE, getDictionary, loadDictionary, t as translateFn, SUPPORTED_LOCALES } from "./index";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dict: ReturnType<typeof getDictionary>;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * Cookie/localStorage key — KEEP IN SYNC with:
 *   - src/lib/supabase/middleware.ts (LOCALE_COOKIE)
 *   - src/i18n/server.ts (LOCALE_COOKIE)
 *
 * Cookie is the source of truth (server reads it via getRequestLocale).
 * localStorage kept as legacy fallback during transition; will be removed
 * once all clients have visited at least once and middleware seeded the cookie.
 */
const LOCALE_STORAGE_KEY = "kindar-locale";
const LOCALE_COOKIE = "kindar-locale";

/** Write the locale cookie with a 1-year lifetime, lax/secure. */
function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  // Path=/ so every route sees it. SameSite=Lax matches middleware.
  // Secure=true requires HTTPS — dev (localhost) browsers accept without it.
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Max-Age=${oneYear}; Path=/; SameSite=Lax${secureFlag}`;
}

/** Read the locale cookie. Returns null when absent. */
function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)kindar-locale=([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return SUPPORTED_LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Priority: server-provided initialLocale (from cookie read in layout.tsx)
    // > cookie read on hydration > localStorage (legacy) > browser > default.
    if (initialLocale) return initialLocale;

    if (typeof window !== "undefined") {
      // 1. Cookie (source of truth — same one middleware/server reads).
      const fromCookie = readLocaleCookie();
      if (fromCookie) return fromCookie;

      // 2. localStorage (legacy). Migrate to cookie if found.
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (stored && SUPPORTED_LOCALES.includes(stored)) {
        writeLocaleCookie(stored);
        return stored;
      }

      // 3. Browser preference (last resort — middleware should have set cookie).
      const browserLang = navigator.language?.split("-")[0]?.toLowerCase();
      if (browserLang && SUPPORTED_LOCALES.includes(browserLang as Locale)) {
        return browserLang as Locale;
      }
    }

    return DEFAULT_LOCALE;
  });

  // Track when async dictionary has been loaded (triggers re-render)
  const [dictVersion, setDictVersion] = useState(0);

  const setLocale = useCallback((newLocale: Locale) => {
    // Load the dictionary async before switching locale
    loadDictionary(newLocale).then(() => {
      setLocaleState(newLocale);
      setDictVersion((v) => v + 1);
      if (typeof window !== "undefined") {
        // Cookie is the source of truth (server reads it). localStorage is
        // kept in sync as a legacy fallback for environments where cookies
        // are unreliable (some embedded webviews, etc.).
        writeLocaleCookie(newLocale);
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
        } catch {
          /* Safari private mode / quota — non-fatal, cookie is enough. */
        }
        document.documentElement.lang = newLocale;
        // Force a full reload so Server Components re-render in the new
        // locale (they read the cookie at request time). Without this, the
        // user-visible mix would be: client strings translate immediately
        // but server-rendered text stays in the previous language until
        // next navigation. Reload is the simplest correct behavior.
        // Skip reload in tests (jsdom) to avoid breaking unit tests.
        if (process.env.NODE_ENV !== "test") {
          window.location.reload();
        }
      }
    });
  }, []);

  // Load initial locale dictionary if not default
  useEffect(() => {
    if (locale !== DEFAULT_LOCALE) {
      loadDictionary(locale).then(() => setDictVersion((v) => v + 1));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set HTML lang attribute on mount
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translateFn(key, vars, locale),
    [locale]
  );

  // Memoize dictionary to prevent child re-renders. dictVersion bumps after
  // an async loadDictionary completes, so we include it as a dep even though
  // getDictionary itself only reads from a module-level cache — without the
  // bump, the memoized value would stay pointing at the pt fallback after
  // the en/es/fr/de bundle resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dict = useMemo(() => getDictionary(locale), [locale, dictVersion]);

  const value = useMemo(() => ({ locale, setLocale, t, dict }), [locale, setLocale, t, dict]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to access translations in client components
 * Usage: const { t, locale, setLocale } = useI18n();
 *        t("common.save") => "Salvar"
 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
