/**
 * Locale utilities shared across PWA + server jobs (cron, push, email).
 *
 * Why this exists:
 *   - Server Components have getRequestLocale() (reads cookie / Accept-Language).
 *   - Server JOBS don't have a request: cron, push notifiers, email senders.
 *     They need to resolve "what locale does user X prefer?" from persistent
 *     data (profiles.locale, migration 00083).
 *
 * Also centralizes the BCP 47 region tag map used by Intl.* formatters in
 * server pages, so future locales add in one place.
 */

import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n";

/**
 * App-locale (BCP 47 primary subtag) → BCP 47 region tag.
 * Used by Intl.DateTimeFormat / NumberFormat / RelativeTimeFormat / etc.
 *
 * Rationale per locale:
 *   - pt → pt-BR: launch market is BR. pt-PT can be added later as a separate
 *                 entry if/when EU expansion happens.
 *   - en → en-US: most common reference for English-speaking users. en-GB
 *                 could be added if AU/UK feedback shows ambiguity.
 *   - es → es-ES: covers EU + LatAm well enough. es-MX/AR if expansion.
 *   - fr → fr-FR: similar (covers FR + BE + CH for our use cases).
 *   - de → de-DE: covers DE + AT + CH.
 */
export const INTL_LOCALE_MAP: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

/**
 * Resolve an app-locale to its BCP 47 region tag for Intl formatters.
 * Falls back to pt-BR (source language) on unknown input — never throws.
 */
export function toBcp47(locale: string | null | undefined): string {
  if (!locale) return INTL_LOCALE_MAP[DEFAULT_LOCALE];
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return INTL_LOCALE_MAP[locale as Locale];
  }
  // Accept BCP 47 input too (e.g. "pt-PT" → primary subtag "pt") to be tolerant.
  const primary = locale.split("-")[0]?.toLowerCase();
  if (primary && (SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
    return INTL_LOCALE_MAP[primary as Locale];
  }
  return INTL_LOCALE_MAP[DEFAULT_LOCALE];
}

/**
 * Coerce any string into a supported Locale. Used when reading persisted
 * data (profiles.locale, cookie) — db check constraint should already
 * guarantee validity, but defensive layer protects against legacy rows.
 */
export function toSupportedLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return DEFAULT_LOCALE;
}

/* ------------------------------------------------------------------ */
/* Server-only: resolve locale from a user id                           */
/* ------------------------------------------------------------------ */

/**
 * Read `profiles.locale` for a user. Used by cron jobs, push notifiers,
 * email senders — anywhere a request-bound cookie isn't available.
 *
 * Server-only. Uses admin client because callers are typically also server
 * services (RLS-bypassing reads of the user's own profile).
 *
 * Returns DEFAULT_LOCALE (pt) when:
 *   - users.locale column doesn't exist yet (pre-migration-00083 deploys)
 *   - profile row missing (user deleted)
 *   - locale value invalid (defensive)
 *
 * NOTE: keep this function lazy — don't add to import graphs that load on
 * the edge unless you know what you're doing (admin client uses service
 * role key, which is server-only).
 */
export async function getUserLocale(userId: string): Promise<Locale> {
  // Lazy import — admin client is server-side service-role; pulling it into
  // the edge bundle would crash. This file is import-safe from both edges
  // because the heavy admin client only loads when getUserLocale() runs.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .single();

  if (error || !data) return DEFAULT_LOCALE;
  return toSupportedLocale((data as { locale?: string | null }).locale ?? null);
}

/**
 * Bulk variant — resolve locales for many users at once. Used by fan-out
 * push (cron de vacina dispara pra 100+ usuários; uma query é melhor que N).
 *
 * Returns a Map keyed by userId. Users without a row fall back to DEFAULT_LOCALE.
 */
export async function getUsersLocale(userIds: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>();
  if (userIds.length === 0) return out;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, locale")
    .in("id", userIds);
  if (error || !data) {
    for (const id of userIds) out.set(id, DEFAULT_LOCALE);
    return out;
  }
  const seen = new Set<string>();
  for (const row of data as { id: string; locale?: string | null }[]) {
    seen.add(row.id);
    out.set(row.id, toSupportedLocale(row.locale ?? null));
  }
  // Ensure every requested user has an entry (default for missing rows).
  for (const id of userIds) if (!seen.has(id)) out.set(id, DEFAULT_LOCALE);
  return out;
}
