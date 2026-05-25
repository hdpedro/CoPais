/**
 * Server-side i18n loader for Next.js Server Components.
 *
 * Why this exists:
 *   Server Components run in Node, NOT React Context. They cannot use the
 *   `<I18nProvider>` / `useI18n()` from `provider.tsx` (those are client-only).
 *   Without this module, any string fabricated in a Server Component would
 *   default to pt-BR forever — exactly the bug Henrique hit on 2026-05-16
 *   where "trocar idioma e nada mudou" because dashboard/page.tsx and many
 *   sibling pages hardcode pt strings before handing them to client.
 *
 * How it works:
 *   - Locale is read from cookie `kindar-locale` (set by middleware on first
 *     visit using Accept-Language, or by the LanguageSelector client-side).
 *   - Dictionaries are loaded once per locale per server process and cached.
 *   - `getServerT()` returns a synchronous `t()` ready to use inside server
 *     components. Pre-loads the dictionary on first call.
 *
 * Usage in a Server Component:
 *
 *   import { getServerT } from "@/i18n/server";
 *   export default async function Page() {
 *     const t = await getServerT();
 *     return <h1>{t("dashboard.welcome", { name: "Joao" })}</h1>;
 *   }
 *
 * Source of truth: pt-BR (Regra Canônica 4). Missing keys fall back to pt-BR
 * in prod and surface as Sentry warnings (Regra Canônica 6).
 */

import "server-only";
import { cookies, headers } from "next/headers";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type Locale,
  type Dictionary,
} from "./index";
import ptRaw from "./locales/pt.json";
import { isPseudoLocEnabled, pseudoLocalizeDict } from "./pseudo";

// Pseudo-loc applied at module load (mirrors index.ts client-side). Safe
// because pseudo-loc is forced off in production NODE_ENV.
const pt: Dictionary = isPseudoLocEnabled() ? pseudoLocalizeDict(ptRaw) : ptRaw;

/** Cookie name — KEEP IN SYNC with provider.tsx LOCALE_STORAGE_KEY and middleware. */
export const LOCALE_COOKIE = "kindar-locale";

/**
 * Server-side dictionary cache. Populated lazily as locales are requested.
 * Lives for the lifetime of the server process (Vercel function instance).
 * pt-BR is always available because we statically import it.
 */
const serverDictionaries: Partial<Record<Locale, Dictionary>> = { pt };

/** Wrap a loader so pseudo-loc is applied uniformly when enabled. */
function withPseudo(loader: () => Promise<Dictionary>) {
  return async () => {
    const dict = await loader();
    return (isPseudoLocEnabled() ? pseudoLocalizeDict(dict) : dict) as Dictionary;
  };
}

/** Server-side loaders (dynamic imports). Mirror client loaders in index.ts. */
const serverLoaders: Record<Locale, () => Promise<Dictionary>> = {
  pt: async () => pt,
  en: withPseudo(async () => (await import("./locales/en.json")).default as Dictionary),
  es: withPseudo(async () => (await import("./locales/es.json")).default as Dictionary),
  fr: withPseudo(async () => (await import("./locales/fr.json")).default as Dictionary),
  de: withPseudo(async () => (await import("./locales/de.json")).default as Dictionary),
};

/**
 * Parse a comma-separated `Accept-Language` value and return the highest-priority
 * supported locale. Honors q-values per RFC 7231. Falls back to DEFAULT_LOCALE.
 *
 * Examples:
 *   "en-US,en;q=0.9,pt-BR;q=0.8" → "en"
 *   "fr-FR,fr;q=0.9"             → "fr"
 *   "ja-JP,ja;q=0.9"             → "pt" (no Japanese support, fallback)
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(",")
    .map((tag) => {
      const [lang, ...params] = tag.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.split("=")[1]) || 0 : 1;
      // Normalize to BCP 47 primary subtag (lowercase, before hyphen).
      // Trim to defend against headers with extra whitespace like
      // "  en ; q=0.9 ,  de ; q=0.8 " (some proxies emit these).
      const primary = lang.split("-")[0]?.trim().toLowerCase() || "";
      return { primary, q };
    })
    .filter((c) => c.primary)
    .sort((a, b) => b.q - a.q);

  for (const { primary } of candidates) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Resolve the current request's locale. Priority:
 *   1. Cookie `kindar-locale` (user explicitly chose)
 *   2. `Accept-Language` header (browser preference)
 *   3. DEFAULT_LOCALE (pt-BR)
 *
 * Called from Server Components and Route Handlers. Reads Next.js request
 * cookies/headers (must run inside a request scope).
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (fromCookie && (SUPPORTED_LOCALES as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }
  const headerList = await headers();
  return parseAcceptLanguage(headerList.get("accept-language"));
}

/**
 * Load (or return cached) dictionary for a given locale. Always returns a
 * usable dictionary — falls back to pt-BR if the dynamic import fails.
 */
export async function loadServerDictionary(locale: Locale): Promise<Dictionary> {
  if (serverDictionaries[locale]) return serverDictionaries[locale]!;
  try {
    const dict = await serverLoaders[locale]();
    serverDictionaries[locale] = dict;
    return dict;
  } catch {
    // Loader failure (deploy missed a JSON, network blip) → graceful fallback.
    // Logged via Sentry hook in fallback-warning.ts when a real key misses.
    return serverDictionaries[DEFAULT_LOCALE]!;
  }
}

/**
 * Synchronous dictionary getter — only safe AFTER `loadServerDictionary` ran
 * for the locale. Used internally by getServerT().
 */
export function getServerDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return serverDictionaries[locale] ?? serverDictionaries[DEFAULT_LOCALE]!;
}

/* ------------------------------------------------------------------ */
/* Translation primitive                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve a dot-separated key against a dictionary. Returns the resolved
 * string or `null` when the path doesn't yield a string. Caller decides what
 * to do on miss (typically: try fallback locale, then return key).
 */
function resolveKey(dict: Dictionary, key: string): string | null {
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
 * CLDR plural rule por locale (cardinal). KEEP IN SYNC com src/i18n/index.ts
 * `pluralKey`.
 */
function pluralKey(locale: Locale, count: number): "one" | "other" {
  if (locale === "en") return count === 1 ? "one" : "other";
  return count >= 0 && count <= 1 ? "one" : "other";
}

/**
 * Parse ICU MessageFormat plural syntax e resolve pro case correto.
 * KEEP IN SYNC com src/i18n/index.ts `applyICUPlural`. Bug F#62 do E2E PRD
 * 2026-05-25: /chat renderizava ICU literal porque motor só lidava com
 * `{var}` simples.
 */
function applyICUPlural(
  template: string,
  vars: Record<string, string | number> | undefined,
  locale: Locale,
): string | null {
  const header = template.match(/\{(\w+)\s*,\s*plural\s*,\s*/);
  if (!header) return null;
  const varname = header[1];
  if (!vars || vars[varname] === undefined) return null;
  const count = Number(vars[varname]);
  if (Number.isNaN(count)) return null;
  const rulesStart = header.index! + header[0].length;
  let i = rulesStart;
  let depth = 1;
  while (i < template.length && depth > 0) {
    if (template[i] === "{") depth++;
    else if (template[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (depth !== 0) return null;
  const rules = template.slice(rulesStart, i);
  const after = template.slice(i + 1);
  const cases: Record<string, string> = {};
  let p = 0;
  while (p < rules.length) {
    while (p < rules.length && /\s/.test(rules[p])) p++;
    let kw = "";
    while (p < rules.length && /[\w=]/.test(rules[p])) kw += rules[p++];
    if (!kw) break;
    while (p < rules.length && /\s/.test(rules[p])) p++;
    if (rules[p] !== "{") break;
    p++;
    let body = "";
    let d = 1;
    while (p < rules.length && d > 0) {
      if (rules[p] === "{") d++;
      else if (rules[p] === "}") {
        d--;
        if (d === 0) break;
      }
      body += rules[p++];
    }
    p++;
    cases[kw] = body;
  }
  const exact = cases[`=${count}`];
  const chosen = exact ?? cases[pluralKey(locale, count)] ?? cases["other"] ?? "";
  return chosen.replace(/#/g, String(count)) + after;
}

/**
 * Substitute named placeholders. Supports both `{name}` (modern) and
 * `{{name}}` (legacy i18next-style — kept for parity with native runtime
 * which already supports both, see bug Aline 2026-05-13 in native i18n).
 *
 * Quando o template é ICU MessageFormat (detecta `{var, plural, ...}`),
 * resolve via `applyICUPlural` primeiro — depois interpola placeholders
 * regulares no resultado.
 */
function interpolate(template: string, vars: Record<string, string | number> | undefined, locale: Locale): string {
  if (!vars) return template;
  const icu = applyICUPlural(template, vars, locale);
  const base = icu !== null ? icu : template;
  // `\s*` em torno do nome aceita tanto `{{name}}` (estilo compacto) quanto
  // `{{ name }}` (estilo i18next com espaços, padrão das chaves novas da
  // sprint Tier A 2026-05-20). KEEP IN SYNC com src/i18n/index.ts.
  return base
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`,
    )
    .replace(/\{\s*(\w+)\s*\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
    );
}

/**
 * Translation function signature shared by server and client.
 */
export type TFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Build a server-side `t()` for the current request's locale. The dictionary
 * is preloaded so the returned `t` is synchronous (same ergonomics as the
 * client `t` from useI18n).
 *
 * Fallback chain (Regra Canônica 6):
 *   1. Try requested locale.
 *   2. Try pt-BR (source language).
 *   3. In dev: prepend "🔴 MISSING: " to the key.
 *      In prod: emit Sentry warning (via reportMissingKey) and return key.
 *
 * @param overrideLocale Optional — usually you want auto-detected. Useful for
 *   server-side jobs (cron, push, email) where the locale comes from
 *   users.locale instead of the request.
 */
export async function getServerT(overrideLocale?: Locale): Promise<TFn> {
  const locale = overrideLocale ?? (await getRequestLocale());
  // Preload both target + fallback for synchronous resolution.
  await loadServerDictionary(locale);
  if (locale !== DEFAULT_LOCALE) {
    await loadServerDictionary(DEFAULT_LOCALE);
  }
  const primary = getServerDictionary(locale);
  const fallback = getServerDictionary(DEFAULT_LOCALE);

  return (key, vars) => {
    const hit = resolveKey(primary, key);
    if (hit !== null) return interpolate(hit, vars, locale);
    const fallbackHit = resolveKey(fallback, key);
    if (fallbackHit !== null) {
      // Async-fire-and-forget: don't block render to log a miss.
      void reportMissingKey(key, locale);
      return interpolate(fallbackHit, vars, locale);
    }
    void reportMissingKey(key, locale);
    return process.env.NODE_ENV === "production" ? key : `🔴 MISSING: ${key}`;
  };
}

/* ------------------------------------------------------------------ */
/* Sentry hook for missing keys (Regra Canônica 6)                      */
/* ------------------------------------------------------------------ */

/**
 * Tracks already-reported keys per process to avoid Sentry flooding.
 * Same key from same locale only fires once per server lifetime.
 */
const reportedMisses = new Set<string>();

async function reportMissingKey(key: string, locale: Locale): Promise<void> {
  const signature = `${locale}::${key}`;
  if (reportedMisses.has(signature)) return;
  reportedMisses.add(signature);

  // Console always — visible in dev terminal and Vercel logs.
  console.warn(`[i18n] Missing translation: locale=${locale} key=${key}`);

  if (process.env.NODE_ENV !== "production") return;

  // Sentry warning in prod. Dynamic import so dev/test doesn't pull Sentry.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage(`i18n missing key: ${key}`, {
      level: "warning",
      tags: { i18n_locale: locale, i18n_key: key, source: "i18n-server" },
    });
  } catch {
    // Sentry not configured — non-fatal.
  }
}
