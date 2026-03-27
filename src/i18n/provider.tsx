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

const LOCALE_STORAGE_KEY = "kindar-locale";

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale) return initialLocale;

    // Check localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;

      // Detect from browser
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
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
        document.documentElement.lang = newLocale;
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

  // Memoize dictionary to prevent child re-renders
  // dictVersion ensures we re-memoize after async load completes
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
