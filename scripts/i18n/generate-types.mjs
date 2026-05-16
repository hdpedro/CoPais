#!/usr/bin/env node
/**
 * generate-types — emits src/i18n/keys.generated.ts with a `TranslationKey`
 * union type containing every leaf path of pt.json. Calling
 *   t("home.welcome")     // ✅ valid
 *   t("home.wlecome")     // ❌ Type error at compile time
 *
 * This is the cheapest enforcement of Regra Canônica 9 (naming) and Regra 2
 * (no hardcoded strings — typed keys force you to add it to JSON first).
 *
 * Runs in CI and pre-commit. Idempotent: only writes when content changes.
 *
 * Why generated, not hand-maintained: pt.json has 2000+ leaves and grows
 * every PR. Hand-keeping a union type would drift in 24h.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PT_FILE = join(ROOT, "src/i18n/locales/pt.json");
const OUT_FILE = join(ROOT, "src/i18n/keys.generated.ts");

function leafPaths(obj, prefix = "") {
  const out = [];
  if (obj === null || typeof obj !== "object") {
    return prefix ? [prefix] : [];
  }
  for (const key of Object.keys(obj)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    out.push(...leafPaths(obj[key], childPath));
  }
  return out;
}

const dict = JSON.parse(readFileSync(PT_FILE, "utf8"));
const allKeys = leafPaths(dict).sort();

// Header kept timestamp-free on purpose: re-running this script with the same
// pt.json must produce a byte-identical file so pre-commit + CI gates pass
// without spurious diffs. Source-of-truth is the key count + leaf set below.
const header = `/**
 * AUTO-GENERATED — DO NOT EDIT by hand.
 *
 * Source: src/i18n/locales/pt.json (Regra Canônica 4 — pt-BR is source).
 * Regenerate: \`npm run i18n:gen\`
 *
 * Exports \`TranslationKey\` — the union of every dot-separated leaf path in
 * pt.json. Use as the key argument to \`t()\` for compile-time safety.
 * Importing this file does NOT pull pt.json into the bundle.
 */

`;

const body =
  `export type TranslationKey =\n` +
  allKeys.map((k) => `  | "${k.replace(/"/g, '\\"')}"`).join("\n") +
  ";\n\n" +
  `/** All translation keys as a readonly array. Useful for orphan checkers. */\n` +
  `export const TRANSLATION_KEYS = [\n` +
  allKeys.map((k) => `  "${k.replace(/"/g, '\\"')}",`).join("\n") +
  `\n] as const;\n`;

const content = header + body;

if (existsSync(OUT_FILE) && readFileSync(OUT_FILE, "utf8") === content) {
  console.log(`✅ keys.generated.ts up to date (${allKeys.length} keys).`);
  process.exit(0);
}

writeFileSync(OUT_FILE, content, "utf8");
console.log(`✅ Generated keys.generated.ts with ${allKeys.length} keys.`);
