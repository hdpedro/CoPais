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
 * CLDR plural rule por locale (cardinal). Reduzido pro essencial das 5
 * línguas suportadas. Versão completa seria via `Intl.PluralRules`, mas
 * essa abordagem inline economiza ~30KB de bundle (CLDR data) e cobre
 * 100% dos casos de uso atuais.
 *
 * - pt/es/fr/de: "one" pra n=0..1 (algumas variantes pt aceitam só n=1,
 *   mas BR rule = 0..1 conforme CLDR 44). Outros => "other".
 * - en: "one" só pra n=1 estrito. Outros => "other".
 *
 * Quando precisar `few`/`many` (russo, polonês, etc.), trocar pra
 * `new Intl.PluralRules(locale).select(count)`.
 */
function pluralKey(locale: Locale, count: number): "one" | "other" {
  if (locale === "en") return count === 1 ? "one" : "other";
  return count >= 0 && count <= 1 ? "one" : "other";
}

/**
 * Parse ICU MessageFormat plural syntax e resolve pro case correto.
 *
 * Suporta apenas plural cardinal (sem select/selectordinal — chave
 * indisponível no projeto). Sintaxe: `{var, plural, =N {text} one {text}
 * other {text}}`. `#` é substituído pelo valor de `var`.
 *
 * Retorna `null` se o template não é ICU — caller volta pro
 * `interpolatePlaceholders` regular. Bug F#62 do E2E PRD 2026-05-25:
 * /chat renderizava `{count, plural, one {# membro} other {# membros}}`
 * literal porque o motor só lidava com `{var}` simples.
 */
function applyICUPlural(
  template: string,
  vars: Record<string, string | number> | undefined,
  locale: Locale,
): string | null {
  // Match `{varname, plural, ...}` no início do template (mesmo se houver
  // texto antes — caso `{days, plural, ...} dias` não suportado por simpli-
  // cidade; ICU completo seria via `intl-messageformat`).
  const header = template.match(/\{(\w+)\s*,\s*plural\s*,\s*/);
  if (!header) return null;
  const varname = header[1];
  if (!vars || vars[varname] === undefined) return null;
  const count = Number(vars[varname]);
  if (Number.isNaN(count)) return null;

  // Find the start of the rules section (after `, plural, `) and the matching
  // closing `}` at the end. We parse `keyword {text}` pairs respecting nested
  // braces (the `text` can itself contain `{var}` placeholders).
  const rulesStart = header.index! + header[0].length;
  // Walk from rulesStart counting braces from the OUTER `{varname, plural, ...}`
  // To find the closing `}` of the ICU pattern: depth starts at 1 (we already
  // consumed the opening `{`), each `{` we see is +1, each `}` is -1.
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
  if (depth !== 0) return null; // malformed ICU
  const rules = template.slice(rulesStart, i);
  const after = template.slice(i + 1); // tail after the ICU block (we don't
  // currently mix ICU + plain text but support it gracefully)

  // Parse rules: sequence of `keyword {body}` pairs.
  const cases: Record<string, string> = {};
  let p = 0;
  while (p < rules.length) {
    // Skip whitespace
    while (p < rules.length && /\s/.test(rules[p])) p++;
    // Read keyword (one, other, =0, =1, few, many, etc.)
    let kw = "";
    while (p < rules.length && /[\w=]/.test(rules[p])) {
      kw += rules[p++];
    }
    if (!kw) break;
    // Skip whitespace before `{`
    while (p < rules.length && /\s/.test(rules[p])) p++;
    if (rules[p] !== "{") break;
    p++; // consume `{`
    // Read body respecting nested braces
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
    p++; // consume closing `}`
    cases[kw] = body;
  }

  // Pick the matching case: exact `=N` wins, else CLDR keyword.
  const exact = cases[`=${count}`];
  const chosen = exact ?? cases[pluralKey(locale, count)] ?? cases["other"] ?? "";
  // Replace `#` with the count (CLDR escape for the variable in the chosen body).
  const rendered = chosen.replace(/#/g, String(count));
  return rendered + after;
}

/**
 * Interpolate named placeholders. Supports both `{name}` (modern) and
 * `{{name}}` (legacy i18next-style — required for parity with native runtime
 * after bug Aline 2026-05-13: native locale JSONs mix both styles).
 *
 * Quando o template é ICU MessageFormat (detecta `{var, plural, ...}`),
 * resolve via `applyICUPlural` primeiro — depois interpola placeholders
 * regulares no resultado (caso o branch escolhido contenha `{name}`).
 */
function interpolatePlaceholders(
  template: string,
  vars?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!vars) return template;
  // Tenta ICU primeiro (template tipo `{count, plural, ...}`). Se não
  // bater, segue pro fluxo de placeholders simples abaixo.
  const icu = applyICUPlural(template, vars, locale);
  const base = icu !== null ? icu : template;
  // `\s*` em torno do nome aceita tanto `{{name}}` (estilo compacto) quanto
  // `{{ name }}` (estilo i18next com espaços, padrão das chaves novas da
  // sprint Tier A 2026-05-20). Bug Henrique 2026-05-20: chaves tipo
  // "{{ email }}" apareciam literais na UI porque o regex anterior exigia
  // ausência de espaço — chave passou direto sem substituição.
  return base
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`,
    )
    .replace(/\{\s*(\w+)\s*\}/g, (_, k) =>
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
  if (hit !== null) return interpolatePlaceholders(hit, vars, locale);

  // Try fallback to source language (pt-BR).
  if (locale !== DEFAULT_LOCALE) {
    const fallbackDict = getDictionary(DEFAULT_LOCALE);
    const fallbackHit = resolveKeyPath(fallbackDict, key);
    if (fallbackHit !== null) {
      reportMissingClient(key, locale);
      return interpolatePlaceholders(fallbackHit, vars, locale);
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
