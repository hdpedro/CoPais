#!/usr/bin/env node
/**
 * Helper: ranks files by kindar/no-pt-literal violation count.
 * Run: node scripts/i18n/_rank-offenders.mjs
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = execSync('npx eslint src kindar-native/app --format=json', {
  cwd: ROOT,
  maxBuffer: 100 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});
const data = JSON.parse(out.toString());
const counts = {};
for (const file of data) {
  const ptCount = file.messages.filter((m) => m.ruleId === "kindar/no-pt-literal").length;
  if (ptCount > 0) counts[file.filePath] = ptCount;
}
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log("Total files with hits:", sorted.length);
console.log("Total hits:", sorted.reduce((s, [, c]) => s + c, 0));
console.log("--- TOP 40 ---");
for (const [f, c] of sorted.slice(0, 40)) {
  const rel = f.replace(ROOT, "").replace(/\\/g, "/");
  console.log(c.toString().padStart(4), rel);
}
