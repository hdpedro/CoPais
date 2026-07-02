#!/usr/bin/env node
/**
 * Hard toolchain guard — runs as the root project's `preinstall` hook.
 *
 * Why this exists:
 *   The lockfile's @emnapi/* optional entries (pulled by the wasm32-wasi
 *   builds of @rolldown, @tailwindcss/oxide, @unrs/resolver) are resolved
 *   DIFFERENTLY by npm 10 vs npm 11. Generating package-lock.json with the
 *   "wrong" npm desyncs it from CI and makes `npm ci` abort on EVERY job
 *   (Unit Tests, Typecheck, i18n Gate) — see PR #142 and the
 *   `project-ci-npm-version-skew-lockfile` memory.
 *
 *   The project is standardized on Node 24 + npm 11. This guard blocks a
 *   root `npm install` / `npm ci` on an older toolchain so nobody can
 *   silently re-introduce the skew.
 *
 * Scope:
 *   - Runs ONLY for the root (PWA) package — kindar-native has its own
 *     package.json with no preinstall, so native/EAS installs are untouched.
 *   - Pure built-in Node (no deps) so it works before node_modules exists.
 *   - npm version is read from npm_config_user_agent (set by npm during
 *     lifecycle scripts); if absent (script run directly, not via npm) the
 *     npm check is skipped.
 *
 * Escape hatch (rare, e.g. a one-off on a constrained machine):
 *   KINDAR_SKIP_ENGINE_CHECK=1 npm ci
 */

const MIN_NODE_MAJOR = 24;
const MIN_NPM_MAJOR = 11;

if (process.env.KINDAR_SKIP_ENGINE_CHECK === "1") {
  console.warn("⚠️  KINDAR_SKIP_ENGINE_CHECK=1 — skipping Node/npm version guard.");
  process.exit(0);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);

const ua = process.env.npm_config_user_agent || "";
const npmMatch = ua.match(/npm\/(\d+)\.\d+\.\d+/);
const npmMajor = npmMatch ? Number(npmMatch[1]) : null;

const problems = [];
if (Number.isFinite(nodeMajor) && nodeMajor < MIN_NODE_MAJOR) {
  problems.push(`Node ${process.versions.node} detected — this repo requires Node >= ${MIN_NODE_MAJOR}.`);
}
if (npmMajor !== null && npmMajor < MIN_NPM_MAJOR) {
  problems.push(`npm ${npmMatch[1]}.x detected — this repo requires npm >= ${MIN_NPM_MAJOR}.`);
}

if (problems.length > 0) {
  console.error("\n❌  Wrong toolchain for this project (root/PWA):\n");
  for (const p of problems) console.error("   - " + p);
  console.error(
    "\n   Why: npm 10 and npm 11 resolve the @emnapi optional deps differently and" +
      "\n   desync package-lock.json, which makes `npm ci` fail on all CI jobs." +
      "\n\n   Fix: use Node 24 + npm 11 (see .nvmrc — `nvm install 24 && nvm use`)," +
      "\n   then retry. To bypass once: KINDAR_SKIP_ENGINE_CHECK=1 npm ci\n"
  );
  process.exit(1);
}
