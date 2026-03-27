import pt from "./locales/pt.json";

export const SUPPORTED_LOCALES = ["pt", "en", "es", "fr", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type Dictionary = typeof pt;

export const LOCALE_NAMES: Record<Locale, string> = {
  pt: "Português (BR)",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  pt: "\u{1F1E7}\u{1F1F7}",
  en: "\u{1F1FA}\u{1F1F8}",
  es: "\u{1F1EA}\u{1F1F8}",
  fr: "\u{1F1EB}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}",
};

// Only the default locale is statically imported.
// Other locales are loaded on demand to reduce initial bundle (~220KB saved).
const dictionaries: Partial<Record<Locale, Dictionary>> = { pt };

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  pt: () => Promise.resolve({ default: pt }),
  en: () => import("./locales/en.json"),
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
};

export const DEFAULT_LOCALE: Locale = "pt";

/**
 * Async loader for non-default locales. Returns the dictionary once loaded.
 * For the default locale (pt), returns synchronously from cache.
 */
export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (dictionaries[locale]) return dictionaries[locale]!;
  const mod = await loaders[locale]();
  dictionaries[locale] = mod.default;
  return mod.default;
}

/**
 * Get the full dictionary for a locale (synchronous, returns default if not yet loaded)
 */
export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE]!;
}

/**
 * Get a nested translation value by dot-separated key path
 * e.g. t("common.save") => "Salvar"
 * Supports interpolation: t("dashboard.todayWith", { name: "Joao" })
 */
export function t(
  key: string,
  vars?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE
): string {
  const dict = getDictionary(locale);
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = dict;

  for (const part of parts) {
    if (value == null || typeof value !== "object") return key;
    value = value[part];
  }

  if (typeof value !== "string") return key;

  // Replace {varName} placeholders
  if (vars) {
    return value.replace(/\{(\w+)\}/g, (_, varName) =>
      vars[varName] !== undefined ? String(vars[varName]) : `{${varName}}`
    );
  }

  return value;
}

/**
 * Detect user's preferred locale from browser or Accept-Language header
 */
export function detectLocale(acceptLanguage?: string | null): Locale {
  if (!acceptLanguage) {
    if (typeof navigator !== "undefined") {
      acceptLanguage = navigator.language || navigator.languages?.[0];
    }
  }

  if (!acceptLanguage) return DEFAULT_LOCALE;

  // Parse the primary language tag
  const primary = acceptLanguage.split(",")[0]?.split("-")[0]?.toLowerCase();

  if (primary && SUPPORTED_LOCALES.includes(primary as Locale)) {
    return primary as Locale;
  }

  return DEFAULT_LOCALE;
}
