import ptRaw from "./locales/pt.json";
import { isPseudoLocEnabled, pseudoLocalizeDict } from "./pseudo";

export const SUPPORTED_LOCALES = ["pt", "en", "es", "fr", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type Dictionary = typeof ptRaw;

// Apply pseudo-localization at module load when the env flag is on. This
// catches strings rendered server-side AND client-side without each call
// site needing to know about pseudo-loc. Disabled in production.
const pt: Dictionary = isPseudoLocEnabled() ? pseudoLocalizeDict(ptRaw) : ptRaw;

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

// Pseudo-loc applied to non-pt locales the same way as pt above. Wrapper
// resolves the raw module, then optionally pseudo-localizes before caching.
function wrapWithPseudo(loader: () => Promise<{ default: Dictionary }>) {
  return async () => {
    const mod = await loader();
    return { default: isPseudoLocEnabled() ? pseudoLocalizeDict(mod.default) : mod.default };
  };
}

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  pt: () => Promise.resolve({ default: pt }),
  en: wrapWithPseudo(() => import("./locales/en.json")),
  es: wrapWithPseudo(() => import("./locales/es.json")),
  fr: wrapWithPseudo(() => import("./locales/fr.json")),
  de: wrapWithPseudo(() => import("./locales/de.json")),
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
 * Cache of already-reported missing keys to avoid log/Sentry flooding.
 * Cleared when locale dict reloads (new dict version might have the key).
 */
const reportedClientMisses = new Set<string>();

/**
 * Resolve a nested key against a dict. Returns null on miss, the string on hit.
 * Internal — shared between primary lookup and fallback lookup.
 */
function resolveKeyPath(dict: Dictionary, key: string): string | null {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = dict;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return null;
    value = value[part];
  }
  return typeof value === "string" ? value : null;
}

/**
 * Interpolate named placeholders. Supports both `{name}` (modern) and
 * `{{name}}` (legacy i18next-style — required for parity with native runtime
 * after bug Aline 2026-05-13: native locale JSONs mix both styles).
 */
function interpolatePlaceholders(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`,
    )
    .replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
    );
}

/**
 * Get a nested translation value by dot-separated key path
 * e.g. t("common.save") => "Salvar"
 * Supports interpolation: t("dashboard.todayWith", { name: "Joao" })
 *
 * Fallback chain (Regra Canônica 6):
 *   1. Try requested locale.
 *   2. If miss, try DEFAULT_LOCALE (pt-BR) — source language.
 *   3. In dev: prepend "🔴 MISSING: " to the key for visual debugging.
 *      In prod: log warning + return raw key (Sentry hook attached separately).
 */
export function t(
  key: string,
  vars?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE
): string {
  const dict = getDictionary(locale);
  const hit = resolveKeyPath(dict, key);
  if (hit !== null) return interpolatePlaceholders(hit, vars);

  // Try fallback to source language (pt-BR).
  if (locale !== DEFAULT_LOCALE) {
    const fallbackDict = getDictionary(DEFAULT_LOCALE);
    const fallbackHit = resolveKeyPath(fallbackDict, key);
    if (fallbackHit !== null) {
      reportMissingClient(key, locale);
      return interpolatePlaceholders(fallbackHit, vars);
    }
  }

  reportMissingClient(key, locale);
  if (process.env.NODE_ENV === "production") return key;
  return `🔴 MISSING: ${key}`;
}

/**
 * Report a missing key (client-side). Dedupes by locale+key. In dev, logs
 * to console. In prod, fires Sentry warning if @sentry/browser is available.
 */
function reportMissingClient(key: string, locale: Locale): void {
  const signature = `${locale}::${key}`;
  if (reportedClientMisses.has(signature)) return;
  reportedClientMisses.add(signature);
  console.warn(`[i18n] Missing translation: locale=${locale} key=${key}`);
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined") return;
  // Dynamic import — Sentry browser SDK already in bundle via @sentry/nextjs.
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(`i18n missing key: ${key}`, {
        level: "warning",
        tags: { i18n_locale: locale, i18n_key: key, source: "i18n-client" },
      });
    })
    .catch(() => {
      /* Sentry not loaded — non-fatal */
    });
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
