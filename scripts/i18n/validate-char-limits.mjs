#!/usr/bin/env node
/**
 * validate-char-limits — enforces Regra Canônica 15. Catches strings that
 * exceed channel-specific limits BEFORE they ship and get truncated for the
 * user. Each rule maps a key-pattern to a max length; CI fails on violation.
 *
 * Channels and limits (mirror REGRAS_CANONICAS.md):
 *   - iOS push title       50 chars
 *   - iOS push body       178 chars
 *   - Android push body   240 chars
 *   - Email subject        50 chars (Gmail mobile truncates above)
 *   - accessibilityLabel  200 chars (iOS VoiceOver pause)
 *   - Primary button (mobile) 30 chars (informational warn — heuristic)
 *
 * Add rules by appending to RULES below. Pattern is a regex on the dotted
 * key path. If pattern matches, the leaf string length is checked against
 * the channel limit FOR THAT LOCALE. DE strings can be 30% longer than PT,
 * so per-locale per-channel rules are honored.
 *
 * Exit code: 0 if all locales pass; 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PWA_LOCALES = ["pt", "en", "es", "fr", "de"];
const PWA_DIR = join(ROOT, "src/i18n/locales");

/**
 * @typedef Rule
 * @property {string} label       Human-readable name (printed in failures).
 * @property {RegExp} keyPattern  Matches the dotted key path.
 * @property {number} maxChars    Hard limit. Strings longer than this fail.
 * @property {boolean} [warnOnly] Treat as warning rather than failure.
 */

/** @type {Rule[]} */
const RULES = [
  // Push notifications — heuristics on key naming. Most push copy lives in
  // notifications.* or vaccine.due.* per project conventions.
  {
    label: "iOS push body / Android push body",
    keyPattern: /^(notifications|vaccine|whatsapp)\..*\.(push|body|notification)/i,
    maxChars: 178,
  },
  {
    label: "Push title (any channel)",
    keyPattern: /^(notifications|vaccine|whatsapp)\..*\.(title|pushTitle)$/i,
    maxChars: 50,
  },
  // Email subjects — convention: keys ending in .subject.
  {
    label: "Email subject (Gmail mobile)",
    keyPattern: /\.subject$/,
    maxChars: 50,
  },
  // A11y labels — keys explicitly under a11y.*.
  {
    label: "accessibilityLabel (VoiceOver)",
    keyPattern: /^a11y\./,
    maxChars: 200,
  },
  // Generic warnings — primary button text on mobile readability heuristic.
  {
    label: "Primary action button (mobile readability)",
    keyPattern: /^action\.(primary|save|continue|confirm)$/,
    maxChars: 30,
    warnOnly: true,
  },
];

function walkLeaves(obj, prefix = "", out = []) {
  if (obj === null) return out;
  if (typeof obj === "string") {
    out.push({ path: prefix, value: obj });
    return out;
  }
  if (typeof obj !== "object") return out;
  for (const key of Object.keys(obj)) {
    const child = prefix ? `${prefix}.${key}` : key;
    walkLeaves(obj[key], child, out);
  }
  return out;
}

let hardFailures = 0;
let warnings = 0;

for (const locale of PWA_LOCALES) {
  const file = join(PWA_DIR, `${locale}.json`);
  let dict;
  try {
    dict = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.log(`⏭️  ${locale}.json missing — skip`);
    continue;
  }
  const leaves = walkLeaves(dict);

  for (const rule of RULES) {
    const matches = leaves.filter((l) => rule.keyPattern.test(l.path));
    const violations = matches.filter((l) => l.value.length > rule.maxChars);
    for (const v of violations) {
      const symbol = rule.warnOnly ? "⚠️" : "❌";
      console.log(
        `${symbol} [${locale}] ${rule.label} (max ${rule.maxChars}):` +
          ` ${v.path} = ${v.value.length} chars`,
      );
      console.log(`     "${v.value}"`);
      if (rule.warnOnly) warnings++;
      else hardFailures++;
    }
  }
}

if (hardFailures === 0) {
  console.log(`\n✅ Char limits OK (${warnings} warning(s)).`);
  process.exit(0);
}
console.log(`\n❌ ${hardFailures} char-limit violation(s) — fix or extend rules.`);
process.exit(1);
