/**
 * Pseudo-localization helpers — Regra Canônica 7.
 *
 * Pseudo-loc replaces every translated string with a transliterated, padded
 * version that:
 *   1. Stays visually readable in English (so QA can navigate).
 *   2. Tests UI for truncation — pseudo strings are ~40% longer than source,
 *      simulating DE/FI which run longer than PT/EN. If a button overflows
 *      in pseudo, it WILL overflow in DE production.
 *   3. Surfaces strings missed by `t()` — non-pseudo characters in the UI
 *      reveal hardcoded literals immediately.
 *
 * Enable via env flag:
 *   PWA:    NEXT_PUBLIC_PSEUDO_LOC=1 npm run dev
 *   Native: EXPO_PUBLIC_PSEUDO_LOC=1 npx expo start
 *
 * Standard pseudo-loc convention (Microsoft, ICU):
 *   "Save" → "[!! Šåṽé ŴŴŴ !!]"
 *           ↑          ↑↑↑ ↑↑
 *           bracket    pad bracket
 *
 * NEVER enable in production. Tests assert pseudo strings are unreachable
 * from production code paths.
 */

/** Character map — ASCII letter → accented look-alike. */
const PSEUDO_MAP: Record<string, string> = {
  a: "å", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ğ", h: "ĥ", i: "ḯ",
  j: "ĵ", k: "ķ", l: "ĺ", m: "ṁ", n: "ń", o: "ó", p: "þ", q: "ǫ", r: "ŕ",
  s: "ś", t: "ť", u: "ú", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Å", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ğ", H: "Ĥ", I: "Ḯ",
  J: "Ĵ", K: "Ķ", L: "Ĺ", M: "Ṁ", N: "Ń", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ",
  S: "Ś", T: "Ť", U: "Ú", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

/**
 * Transliterate a string into pseudo-localized form. Preserves placeholders
 * (`{name}`, `{{name}}`), HTML tags, URLs, and emoji — they would break the
 * app if mangled.
 */
export function pseudoLocalize(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;

  // Split into segments preserving placeholders / tags / URLs untouched.
  // The regex matches anything we DON'T want to transliterate.
  const preservePattern = /(\{\{?[^}]+\}\}?|<[^>]+>|https?:\/\/\S+|[A-Z0-9_-]{3,}(?=\b))/g;
  const parts = input.split(preservePattern);

  const transliterated = parts
    .map((part, idx) => {
      // Odd indices are the captured groups (preserved chunks).
      if (idx % 2 === 1) return part;
      return Array.from(part)
        .map((ch) => PSEUDO_MAP[ch] ?? ch)
        .join("");
    })
    .join("");

  // Pad ~40% for length-stress testing — appended Ŵ so a missing translation
  // in DE doesn't catch us off guard. Wrap in markers for visual scanning.
  const padLength = Math.max(3, Math.ceil(transliterated.length * 0.4));
  const pad = "Ŵ".repeat(padLength);
  return `[!! ${transliterated} ${pad} !!]`;
}

/**
 * Recursively transliterate every leaf string in a dictionary. Used at app
 * boot when the pseudo flag is on, to replace the active dict.
 */
export function pseudoLocalizeDict<T>(dict: T): T {
  if (dict === null || dict === undefined) return dict;
  if (typeof dict === "string") return pseudoLocalize(dict) as unknown as T;
  if (Array.isArray(dict)) {
    return dict.map((item) => pseudoLocalizeDict(item)) as unknown as T;
  }
  if (typeof dict === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dict)) {
      out[key] = pseudoLocalizeDict(value);
    }
    return out as T;
  }
  return dict;
}

/**
 * Is pseudo-loc enabled? Reads env flags. Always false on the server in
 * production NODE_ENV — defensive double-check.
 */
export function isPseudoLocEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const pwaFlag = process.env.NEXT_PUBLIC_PSEUDO_LOC;
  const nativeFlag = process.env.EXPO_PUBLIC_PSEUDO_LOC;
  return pwaFlag === "1" || pwaFlag === "true" || nativeFlag === "1" || nativeFlag === "true";
}
