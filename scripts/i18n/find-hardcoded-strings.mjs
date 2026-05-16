#!/usr/bin/env node
/**
 * find-hardcoded-strings — heuristic detector for Portuguese text literals in
 * JSX/TSX. Catches the most common violation of Regra Canônica 2: writing
 * `<Text>Olá</Text>` instead of `<Text>{t("home.greeting")}</Text>`.
 *
 * Strategy:
 *   - Regex over .tsx / .ts files (skipping tests and locale JSONs).
 *   - Matches JSX text content with Portuguese accents OR clear pt-BR words.
 *   - Flags attribute literals (placeholder=, alt=, aria-label=, title=,
 *     accessibilityLabel=) that look Portuguese.
 *
 * Limitations:
 *   - Not a parser. Some false positives expected (e.g. proper names with
 *     accents). Allowlist via per-file `// i18n-ignore-line` comment.
 *   - Doesn't catch `toast.error("Erro")`-style API calls. ESLint custom
 *     rule planned separately covers those.
 *
 * Exit: 0 if clean, 1 if violations found (configurable via --warn-only).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCAN_DIRS = [
  join(ROOT, "src/app"),
  join(ROOT, "src/components"),
  join(ROOT, "kindar-native/app"),
];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage", "tests", "test", "__tests__"]);
const SCAN_EXTS = new Set([".tsx", ".jsx"]);

const args = process.argv.slice(2);
const WARN_ONLY = args.includes("--warn-only");
const MAX_REPORT = parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] || "100", 10);

const PT_ACCENTS = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const PT_FILLER_WORDS = /\b(de|da|do|para|com|você|sua|seu|sem|nao|aqui|hoje|amanh[ãa]|sim|crian[çc]a|fam[íi]lia|guarda)\b/i;

/**
 * Allowlist — files whose Portuguese literals are deliberate (Regra Canônica 14:
 * legal/medical copy translated only by human + jurídico). Don't flag these.
 *
 * Match strategy: relative path (forward-slash normalized) starts with prefix.
 */
const ALLOWLIST_PREFIXES = [
  "/src/app/termos/",
  "/src/app/privacidade/",
  "/src/app/suporte/",
  // Marketing landing — copy revisado pelo Henrique e considerado pt-only
  // até decisão de expandir pra outros mercados (Tier 2 deck).
  "/src/app/pricing/",
  "/src/app/admin/",
  "/src/components/landing/",
];
const ALLOWLIST_FILES = ["/src/app/page.tsx"];

/** Per-line ignore via `// i18n-ignore-line`. Per-block via `i18n-ignore-block-start/end`. */

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
    if (st.isDirectory()) out.push(...walkFiles(full));
    else if (SCAN_EXTS.has(extname(full))) out.push(full);
  }
  return out;
}

/**
 * Scan a file's content for likely Portuguese literals. Returns array of
 * findings { line, snippet, kind }.
 *
 * Supports `// i18n-ignore-line` on individual lines and block markers
 * `// i18n-ignore-block-start` / `// i18n-ignore-block-end` for runs of
 * literals (e.g. medical disclaimers, error catalogs that map upstream codes).
 */
function scanFile(content) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inIgnoreBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.includes("i18n-ignore-block-start")) inIgnoreBlock = true;
    if (raw.includes("i18n-ignore-block-end")) {
      inIgnoreBlock = false;
      continue;
    }
    if (inIgnoreBlock) continue;
    if (raw.includes("// i18n-ignore-line")) continue;
    // Skip comment-only lines.
    if (/^\s*\/\//.test(raw)) continue;
    if (/^\s*\*/.test(raw)) continue;
    // Skip imports.
    if (/^\s*import\s/.test(raw)) continue;
    // Skip JSDoc-style example blocks in TS files.
    if (/^\s*\* /.test(raw)) continue;

    // JSX text content between > and <
    const jsxTextMatches = raw.matchAll(/>\s*([^<>{}\n][^<>{}\n]{2,}?)\s*</g);
    for (const m of jsxTextMatches) {
      const text = m[1].trim();
      if (text.length < 4) continue;
      // Skip pure numbers / variables.
      if (/^[\d\s.,/\-+:%R$€£¥]+$/.test(text)) continue;
      // Heuristic: must look Portuguese.
      if (!PT_ACCENTS.test(text) && !PT_FILLER_WORDS.test(text)) continue;
      // Skip if already inside JSX expression block.
      if (text.startsWith("{") || text.endsWith("}")) continue;
      findings.push({ line: i + 1, snippet: text, kind: "jsx-text" });
    }

    // Attribute literals: placeholder="..." / alt="..." etc.
    const attrMatches = raw.matchAll(
      /\b(placeholder|alt|title|aria-label|accessibilityLabel|accessibilityHint|label)\s*=\s*["']([^"']{4,})["']/g,
    );
    for (const m of attrMatches) {
      const text = m[2];
      if (!PT_ACCENTS.test(text) && !PT_FILLER_WORDS.test(text)) continue;
      // Skip pure template paths / IDs (e.g. alt="logo-kindar").
      if (/^[a-z0-9-_/.]+$/.test(text)) continue;
      findings.push({ line: i + 1, snippet: `${m[1]}="${text}"`, kind: "attr" });
    }
  }

  return findings;
}

const allFiles = SCAN_DIRS.flatMap(walkFiles);

// Filter out allowlisted paths and files (legal/marketing/support/admin).
const files = allFiles.filter((f) => {
  const rel = f.replace(ROOT, "").replace(/\\/g, "/");
  if (ALLOWLIST_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (ALLOWLIST_FILES.includes(rel)) return false;
  return true;
});

const skipped = allFiles.length - files.length;
console.log(
  `[hardcoded] Scanning ${files.length} JSX/TSX files ` +
    `(${skipped} allowlisted — legal/marketing copy)...`,
);

let totalViolations = 0;
let filesWithViolations = 0;
const report = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const findings = scanFile(content);
  if (findings.length === 0) continue;
  filesWithViolations++;
  totalViolations += findings.length;
  report.push({ file, findings });
}

// Sort by violation count desc — biggest offenders first.
report.sort((a, b) => b.findings.length - a.findings.length);

let printed = 0;
for (const { file, findings } of report) {
  if (printed >= MAX_REPORT) break;
  const rel = file.replace(ROOT, "").replace(/\\/g, "/");
  console.log(`\n  ${rel} (${findings.length} hit${findings.length === 1 ? "" : "s"}):`);
  for (const f of findings.slice(0, 5)) {
    console.log(`    L${f.line} [${f.kind}] ${f.snippet}`);
  }
  if (findings.length > 5) {
    console.log(`    ... and ${findings.length - 5} more in this file.`);
  }
  printed++;
}

console.log(
  `\n${totalViolations === 0 ? "✅" : "❌"} ${totalViolations} likely hardcoded pt string(s) ` +
    `across ${filesWithViolations} file(s).`,
);
if (totalViolations > 0) {
  console.log(
    "Add `// i18n-ignore-line` to suppress a deliberate false positive.\n" +
      "Run with --warn-only for non-blocking informational mode.",
  );
}
process.exit(totalViolations === 0 || WARN_ONLY ? 0 : 1);
