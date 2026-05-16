#!/usr/bin/env node
/**
 * validate-orphan-keys — detects keys defined in pt.json that are never used
 * in the source code. Dead translations are dead weight: bigger bundle, more
 * Tolgee work, more drift risk. Surfacing them lets the team clean up.
 *
 * Heuristic: greps the codebase for `t("namespace.key")`, `t('namespace.key')`
 * and `dict.namespace.key`. Any pt.json leaf path not found in any of those
 * patterns is reported.
 *
 * Limitations (deliberate trade-offs to stay fast and zero-dep):
 *   - Dynamic keys like `t(\`status.${state}\`)` are NOT detected. The script
 *     errs on the side of caution by treating any namespace whose prefix is
 *     interpolated as "referenced" (allowlist via --dynamic-prefix).
 *   - Reads files synchronously, single-threaded. Run takes <2s for ~2k keys.
 *
 * Exit code:
 *   - 0 if no orphans found OR if --warn-only.
 *   - 1 if orphans found AND not --warn-only (default for CI).
 *
 * Usage:
 *   node scripts/i18n/validate-orphan-keys.mjs
 *   node scripts/i18n/validate-orphan-keys.mjs --warn-only
 *   node scripts/i18n/validate-orphan-keys.mjs --dynamic-prefix=status,error
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const PT_FILE = join(ROOT, "src/i18n/locales/pt.json");

const args = process.argv.slice(2);
const WARN_ONLY = args.includes("--warn-only");
const DYNAMIC_PREFIXES = (args.find((a) => a.startsWith("--dynamic-prefix=")) || "")
  .split("=")[1]
  ?.split(",")
  .filter(Boolean) ?? [];

const SCAN_DIRS = [
  join(ROOT, "src"),
  join(ROOT, "kindar-native/app"),
];
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage"]);

function walkFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (SCAN_EXTS.has(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function leafPaths(obj, prefix = "") {
  const out = [];
  if (obj === null || typeof obj !== "object") {
    out.push(prefix);
    return out;
  }
  for (const key of Object.keys(obj)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    out.push(...leafPaths(obj[key], childPath));
  }
  return out;
}

const pt = JSON.parse(readFileSync(PT_FILE, "utf8"));
const allLeaves = leafPaths(pt);

console.log(`[orphan-keys] Scanning ${SCAN_DIRS.length} root(s), checking ${allLeaves.length} keys...`);

// Concatenate all source code into one string for a fast single sweep.
// At 2k keys × 1k files this is the simplest practical approach.
const sourceFiles = SCAN_DIRS.flatMap(walkFiles);
let bigBlob = "";
for (const file of sourceFiles) {
  try {
    bigBlob += readFileSync(file, "utf8");
  } catch {
    /* binary / unreadable — skip */
  }
}

const orphans = [];
for (const leaf of allLeaves) {
  // Allowlist: dynamic prefix means we can't statically prove usage.
  // We consider any key under such a prefix as "used" to avoid false positives.
  if (DYNAMIC_PREFIXES.some((p) => leaf.startsWith(p + "."))) continue;

  // Match: "leaf" inside t("...") or dict.leaf access. Escape dots for regex.
  // Two patterns are enough for current codebase style:
  //   1. Literal quoted: "leaf.path" inside source — covers t("x.y"), dict["x.y"], JSON-RPC.
  //   2. Dot-access: dict.leaf.path or d.leaf.path — less common but exists.
  const escaped = leaf.replace(/\./g, "\\.");
  const quotedRE = new RegExp(`["'\`]${escaped}["'\`]`);
  if (quotedRE.test(bigBlob)) continue;

  // Dot-access — only check the bottom path segment as anchor to avoid
  // false matches like "common.save" matching a different "save". Require
  // dot-prefix before the full path to anchor.
  const dotRE = new RegExp(`[\\w$]\\.${escaped}\\b`);
  if (dotRE.test(bigBlob)) continue;

  orphans.push(leaf);
}

if (orphans.length === 0) {
  console.log(`✅ No orphan keys found.`);
  process.exit(0);
}

console.log(`\n⚠️  Found ${orphans.length} orphan key(s) — defined in pt.json but never referenced:`);
orphans.slice(0, 50).forEach((k) => console.log(`   - ${k}`));
if (orphans.length > 50) {
  console.log(`   ... and ${orphans.length - 50} more.`);
}
console.log(
  `\n${WARN_ONLY ? "(warn-only mode — not failing CI)" : "Run with --warn-only to make this non-fatal during cleanup."}`,
);
process.exit(WARN_ONLY ? 0 : 1);
