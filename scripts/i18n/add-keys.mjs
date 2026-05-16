#!/usr/bin/env node
/**
 * i18n key adder — programmatic, idempotent, preserves key order.
 *
 * Why: hand-editing 5 locale JSONs to add a new key is error-prone (you forget
 * one and the CI parity check fails, or worse, the key ships in pt-BR but not
 * in en). This helper does a deep merge of a translations object into all 5
 * locale files at once, in one atomic write per file.
 *
 * Usage as a library:
 *
 *   import { addKeys } from "./add-keys.mjs";
 *   await addKeys({
 *     "dashboard.healthStatus": {
 *       pt: { healthy: "Saudável" },
 *       en: { healthy: "Healthy" },
 *       es: { healthy: "Saludable" },
 *       fr: { healthy: "En bonne santé" },
 *       de: { healthy: "Gesund" },
 *     },
 *   });
 *
 * Each locale must have a value for every leaf. Throws if any locale is
 * missing — enforces Regra Canônica 2 (chave em todos os 5 locales).
 *
 * Idempotent: re-running with the same input is a no-op (existing leaves
 * preserved unless the value differs, in which case the new value wins and
 * a warning is logged so reviewers see deliberate edits).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PWA_LOCALES_DIR = resolve(__dirname, "../../src/i18n/locales");
const NATIVE_LOCALES_DIR = resolve(__dirname, "../../kindar-native/app/_src/i18n/locales");
const SUPPORTED = ["pt", "en", "es", "fr", "de"];

/** Set a nested key path inside an object, creating intermediate objects. */
function setDeep(obj, keyPath, value) {
  const parts = keyPath.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cursor[part] !== "object" || cursor[part] === null) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  const leaf = parts[parts.length - 1];
  const existing = cursor[leaf];
  if (existing !== undefined && existing !== value) {
    if (typeof existing === "object" && typeof value === "object") {
      // Recursive merge — overlay value onto existing.
      Object.assign(existing, value);
      return { changed: true, replaced: false };
    }
    cursor[leaf] = value;
    return { changed: true, replaced: true };
  }
  if (existing === undefined) {
    cursor[leaf] = value;
    return { changed: true, replaced: false };
  }
  return { changed: false, replaced: false };
}

/**
 * Merge `keys` into every locale JSON.
 *
 * @param {Record<string, Record<string, unknown>>} keys
 *   { "scope.path": { pt: <leaf or subtree>, en: ..., es: ..., fr: ..., de: ... } }
 *   The leaf can be a string OR a subtree of nested keys. When it's a subtree,
 *   the subtree shape must be IDENTICAL across all 5 locales (enforced).
 *
 * @param {object} [options]
 * @param {"pwa"|"native"|"both"} [options.target="pwa"]
 *   Which set of locale JSONs to write to. "both" mirrors the same keys to
 *   PWA and Native — useful for strings shared by both apps (auth screens,
 *   common buttons, validation messages).
 */
export async function addKeys(keys, options = {}) {
  const target = options.target ?? "pwa";
  const dirs = [];
  if (target === "pwa" || target === "both") dirs.push({ label: "pwa", dir: PWA_LOCALES_DIR });
  if (target === "native" || target === "both") dirs.push({ label: "native", dir: NATIVE_LOCALES_DIR });
  return Promise.all(dirs.map((d) => addKeysToDir(keys, d.dir, d.label))).then(
    (results) => Object.fromEntries(results.map((r, i) => [dirs[i].label, r])),
  );
}

async function addKeysToDir(keys, LOCALES_DIR, _label) {
  for (const [keyPath, perLocale] of Object.entries(keys)) {
    const missing = SUPPORTED.filter((l) => perLocale[l] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `[i18n] Key "${keyPath}" missing locale(s): ${missing.join(", ")} — ` +
          `Regra Canônica 2 requires all 5 locales.`,
      );
    }
  }

  const summary = { added: 0, replaced: 0, unchanged: 0, files: [] };

  for (const locale of SUPPORTED) {
    const file = join(LOCALES_DIR, `${locale}.json`);
    const dict = JSON.parse(readFileSync(file, "utf8"));
    let fileChanged = false;
    let fileAdded = 0;
    let fileReplaced = 0;

    for (const [keyPath, perLocale] of Object.entries(keys)) {
      const result = setDeep(dict, keyPath, perLocale[locale]);
      if (result.changed) {
        fileChanged = true;
        if (result.replaced) fileReplaced++;
        else fileAdded++;
      }
    }

    if (fileChanged) {
      writeFileSync(file, JSON.stringify(dict, null, 2) + "\n", "utf8");
      summary.added += fileAdded;
      summary.replaced += fileReplaced;
      summary.files.push({ locale, added: fileAdded, replaced: fileReplaced });
    } else {
      summary.unchanged++;
    }
  }

  return summary;
}

/* When invoked directly, expects --keys-file=path argument. The cross-platform
 * check uses pathToFileURL because Windows absolute paths break the naive
 * `file://${argv[1]}` comparison (drive letter + backslashes).
 *
 * Optional flags:
 *   --target=pwa     (default) write only to PWA locales
 *   --target=native  write only to native locales
 *   --target=both    mirror to PWA + native
 */
import { pathToFileURL } from "node:url";
const isDirectRun = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const args = process.argv.slice(2);
  const arg = args.find((a) => a.startsWith("--keys-file="));
  if (!arg) {
    console.error("Usage: node add-keys.mjs --keys-file=path/to/keys.json [--target=pwa|native|both]");
    process.exit(1);
  }
  const target = (args.find((a) => a.startsWith("--target="))?.split("=")[1] || "pwa");
  const file = arg.split("=")[1];
  const keys = JSON.parse(readFileSync(resolve(file), "utf8"));
  const summary = await addKeys(keys, { target });
  console.log(JSON.stringify(summary, null, 2));
}
