#!/usr/bin/env node
/**
 * validate-locale-parity — fails CI when locales drift apart structurally.
 *
 * Enforces Regra Canônica 2 + 7: every key present in the source language
 * (pt-BR) MUST exist in all 5 locales, with the same nested shape.
 *
 * Checks both:
 *   - PWA locales:    src/i18n/locales/{pt,en,es,fr,de}.json
 *   - Native locales: kindar-native/app/_src/i18n/locales/{pt,en,es,fr,de}.json
 *
 * Reports missing keys, type-mismatched keys (e.g. pt has object, en has
 * string), and orphan keys (in non-pt locale but not in pt). Exits non-zero
 * with a clean human report on failure.
 *
 * Usage:
 *   node scripts/i18n/validate-locale-parity.mjs         (validates both)
 *   node scripts/i18n/validate-locale-parity.mjs --pwa
 *   node scripts/i18n/validate-locale-parity.mjs --native
 *   node scripts/i18n/validate-locale-parity.mjs --quiet (only failures)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PWA_LOCALES_DIR = join(ROOT, "src/i18n/locales");
const NATIVE_LOCALES_DIR = join(ROOT, "kindar-native/app/_src/i18n/locales");
const SUPPORTED = ["pt", "en", "es", "fr", "de"];
const SOURCE = "pt";

const args = process.argv.slice(2);
const ONLY_PWA = args.includes("--pwa");
const ONLY_NATIVE = args.includes("--native");
const QUIET = args.includes("--quiet");

/** Walk a dict and emit every leaf path with its leaf type. */
function walk(obj, prefix = "") {
  const out = [];
  if (obj === null || typeof obj !== "object") {
    out.push({ path: prefix, type: typeof obj });
    return out;
  }
  for (const key of Object.keys(obj)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    out.push(...walk(obj[key], childPath));
  }
  return out;
}

function indexByPath(paths) {
  const m = new Map();
  for (const p of paths) m.set(p.path, p.type);
  return m;
}

function loadLocale(dir, locale) {
  const file = join(dir, `${locale}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function validate(dir, label) {
  const sourceDict = loadLocale(dir, SOURCE);
  if (!sourceDict) {
    return { label, skipped: true, reason: `${SOURCE}.json missing` };
  }
  const sourceIndex = indexByPath(walk(sourceDict));
  const report = {
    label,
    skipped: false,
    sourceKeyCount: sourceIndex.size,
    locales: {},
    pass: true,
  };

  for (const locale of SUPPORTED) {
    if (locale === SOURCE) {
      report.locales[locale] = { source: true, keyCount: sourceIndex.size };
      continue;
    }
    const dict = loadLocale(dir, locale);
    if (!dict) {
      report.locales[locale] = { missing_file: true };
      report.pass = false;
      continue;
    }
    const localeIndex = indexByPath(walk(dict));
    const missing = []; // present in source, absent in this locale
    const typeMismatch = []; // present in both but different leaf type
    const orphan = []; // present in this locale, absent in source

    for (const [path, type] of sourceIndex) {
      const otherType = localeIndex.get(path);
      if (otherType === undefined) {
        missing.push(path);
      } else if (otherType !== type) {
        typeMismatch.push({ path, sourceType: type, localeType: otherType });
      }
    }
    for (const path of localeIndex.keys()) {
      if (!sourceIndex.has(path)) orphan.push(path);
    }

    const ok = missing.length === 0 && typeMismatch.length === 0 && orphan.length === 0;
    if (!ok) report.pass = false;
    report.locales[locale] = {
      keyCount: localeIndex.size,
      missing,
      typeMismatch,
      orphan,
      ok,
    };
  }

  return report;
}

function printReport(report) {
  if (report.skipped) {
    console.log(`⏭️  [${report.label}] skipped: ${report.reason}`);
    return;
  }
  const status = report.pass ? "✅" : "❌";
  console.log(`\n${status} [${report.label}] source=${SOURCE} keys=${report.sourceKeyCount}`);
  for (const [locale, r] of Object.entries(report.locales)) {
    if (r.source) {
      if (!QUIET) console.log(`   ${locale}: source (${r.keyCount} keys)`);
      continue;
    }
    if (r.missing_file) {
      console.log(`   ❌ ${locale}: FILE MISSING`);
      continue;
    }
    const symbol = r.ok ? "✓" : "✗";
    if (r.ok && QUIET) continue;
    console.log(`   ${symbol} ${locale}: ${r.keyCount} keys`);
    if (r.missing.length > 0) {
      console.log(`      missing ${r.missing.length}:`);
      r.missing.slice(0, 10).forEach((p) => console.log(`        - ${p}`));
      if (r.missing.length > 10) console.log(`        ... and ${r.missing.length - 10} more`);
    }
    if (r.typeMismatch.length > 0) {
      console.log(`      type mismatch ${r.typeMismatch.length}:`);
      r.typeMismatch.slice(0, 10).forEach((m) =>
        console.log(`        - ${m.path}: ${SOURCE}=${m.sourceType}, ${locale}=${m.localeType}`),
      );
    }
    if (r.orphan.length > 0) {
      console.log(`      orphan ${r.orphan.length} (in ${locale} but not in ${SOURCE}):`);
      r.orphan.slice(0, 10).forEach((p) => console.log(`        - ${p}`));
    }
  }
}

const reports = [];
if (!ONLY_NATIVE) reports.push(validate(PWA_LOCALES_DIR, "PWA"));
if (!ONLY_PWA) reports.push(validate(NATIVE_LOCALES_DIR, "Native"));

reports.forEach(printReport);
const allPass = reports.every((r) => r.skipped || r.pass);
console.log(
  `\n${allPass ? "✅ Locale parity OK" : "❌ Locale parity FAILED"} ` +
    `(${reports.filter((r) => !r.skipped).length} target(s) checked).`,
);
process.exit(allPass ? 0 : 1);
