#!/usr/bin/env node
/**
 * setup-expo-ota.mjs — Configures EAS Update (OTA) for any Expo project.
 *
 * Idempotent: safe to re-run. Skips steps that are already done.
 * Cross-platform: pure Node.js, no shell-specific syntax.
 *
 * What it does:
 *   1. Validates you're in an Expo project (app.json present)
 *   2. Validates eas-cli is installed and you're logged in
 *   3. Resolves the EAS project ID (creates one if missing)
 *   4. Installs expo-updates (if missing)
 *   5. Adds runtimeVersion + updates section to app.json
 *   6. Adds channel to each build profile in eas.json
 *   7. Verifies the final configuration
 *
 * Usage:
 *   cd /path/to/your-expo-project
 *   node /path/to/setup-expo-ota.mjs
 *
 * Or copy this file into your project's scripts/ folder and run:
 *   node scripts/setup-expo-ota.mjs
 *
 * Prerequisites:
 *   - Node.js 18+
 *   - npm or yarn
 *   - eas-cli authenticated (`npx eas-cli login` if not)
 *   - Expo project already initialized (`app.json` exists)
 *
 * After running, your next production build will support OTA. Then use:
 *   npx eas-cli update --branch production --message "your changes"
 * to push JS/TS updates without rebuilding.
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helpers ───────────────────────────────────────────────────────────

const log = {
  step: (msg) => console.log(`\n\x1b[36m▶\x1b[0m \x1b[1m${msg}\x1b[0m`),
  ok: (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`),
  skip: (msg) => console.log(`  \x1b[33m↷\x1b[0m ${msg} \x1b[2m(already done)\x1b[0m`),
  warn: (msg) => console.log(`  \x1b[33m⚠\x1b[0m  ${msg}`),
  err: (msg) => console.error(`  \x1b[31m✗\x1b[0m ${msg}`),
  info: (msg) => console.log(`  \x1b[2m${msg}\x1b[0m`),
};

function runSync(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: opts.silent ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0 && !opts.allowFail) {
    log.err(`Command failed: ${cmd} ${args.join(' ')}`);
    if (result.stderr) log.err(result.stderr.trim());
    process.exit(1);
  }
  return result;
}

function readJsonPreserve(path) {
  const raw = readFileSync(path, 'utf8');
  return { data: JSON.parse(raw), raw };
}

function writeJsonPreserve(path, data, sourceRaw) {
  // Best-effort indentation preservation by sniffing the original file.
  const indent = sourceRaw && sourceRaw.match(/\n( {2}|\t)/)?.[1] === '\t' ? '\t' : 2;
  // Trailing newline preserved if original had one.
  const newline = sourceRaw && sourceRaw.endsWith('\n') ? '\n' : '';
  writeFileSync(path, JSON.stringify(data, null, indent) + newline, 'utf8');
}

// ─── Pre-flight checks ─────────────────────────────────────────────────

log.step('Pre-flight checks');

const cwd = process.cwd();
const appJsonPath = resolve(cwd, 'app.json');
const easJsonPath = resolve(cwd, 'eas.json');
const packageJsonPath = resolve(cwd, 'package.json');

if (!existsSync(appJsonPath)) {
  log.err(`app.json not found in ${cwd}`);
  log.info('Run this script from the root of your Expo project.');
  process.exit(1);
}
log.ok(`app.json found at ${appJsonPath}`);

if (!existsSync(packageJsonPath)) {
  log.err(`package.json not found.`);
  process.exit(1);
}
log.ok('package.json found');

// Check Node version
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 18) {
  log.err(`Node.js 18+ required (you have ${process.versions.node}).`);
  process.exit(1);
}
log.ok(`Node.js ${process.versions.node}`);

// Check eas-cli auth
log.step('Checking EAS CLI authentication');
const whoami = runSync('npx', ['eas-cli@latest', 'whoami'], { silent: true, allowFail: true });
if (whoami.status !== 0) {
  log.err('Not logged in to EAS. Run: npx eas-cli login');
  process.exit(1);
}
const account = whoami.stdout.trim().split('\n')[0];
log.ok(`Logged in as ${account}`);

// ─── Resolve project ID ────────────────────────────────────────────────

log.step('Resolving EAS project ID');

let { data: appJson, raw: appJsonRaw } = readJsonPreserve(appJsonPath);
let projectId = appJson?.expo?.extra?.eas?.projectId;

if (!projectId) {
  log.info('No projectId in app.json — fetching from EAS...');
  const info = runSync('npx', ['eas-cli@latest', 'project:info'], { silent: true, allowFail: true });
  if (info.status === 0) {
    const match = info.stdout.match(/ID\s+([0-9a-f-]{36})/);
    if (match) projectId = match[1];
  }
  if (!projectId) {
    log.warn('Project not initialized on EAS. Run `npx eas-cli init` first.');
    process.exit(1);
  }
  // Persist projectId to app.json (some projects haven't been linked yet)
  appJson.expo = appJson.expo ?? {};
  appJson.expo.extra = appJson.expo.extra ?? {};
  appJson.expo.extra.eas = { projectId };
  writeJsonPreserve(appJsonPath, appJson, appJsonRaw);
  ({ data: appJson, raw: appJsonRaw } = readJsonPreserve(appJsonPath));
  log.ok(`Linked project: ${projectId} (saved to app.json)`);
} else {
  log.ok(`Project ID: ${projectId}`);
}

// ─── Install expo-updates ──────────────────────────────────────────────

log.step('Installing expo-updates');

const pkgJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const hasExpoUpdates = !!(pkgJson.dependencies?.['expo-updates'] || pkgJson.devDependencies?.['expo-updates']);

if (hasExpoUpdates) {
  log.skip(`expo-updates already in package.json (${pkgJson.dependencies['expo-updates']})`);
} else {
  log.info('Running: npx expo install expo-updates');
  runSync('npx', ['expo', 'install', 'expo-updates']);
  log.ok('expo-updates installed');
}

// ─── Configure app.json ────────────────────────────────────────────────

log.step('Configuring app.json (runtimeVersion + updates)');

({ data: appJson, raw: appJsonRaw } = readJsonPreserve(appJsonPath));
let appJsonChanged = false;

if (!appJson.expo.runtimeVersion) {
  appJson.expo.runtimeVersion = { policy: 'appVersion' };
  appJsonChanged = true;
  log.ok('Added runtimeVersion: { policy: "appVersion" }');
} else {
  log.skip('runtimeVersion already set');
}

if (!appJson.expo.updates) {
  appJson.expo.updates = {
    url: `https://u.expo.dev/${projectId}`,
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
  };
  appJsonChanged = true;
  log.ok(`Added updates.url: https://u.expo.dev/${projectId}`);
} else {
  if (!appJson.expo.updates.url) {
    appJson.expo.updates.url = `https://u.expo.dev/${projectId}`;
    appJsonChanged = true;
    log.ok('Added updates.url to existing updates section');
  } else {
    log.skip('updates section already configured');
  }
}

if (appJsonChanged) {
  writeJsonPreserve(appJsonPath, appJson, appJsonRaw);
  log.ok('app.json saved');
}

// ─── Configure eas.json ────────────────────────────────────────────────

log.step('Configuring eas.json (channels per profile)');

if (!existsSync(easJsonPath)) {
  log.warn('eas.json not found — running eas init first...');
  runSync('npx', ['eas-cli@latest', 'init', '--non-interactive']);
}

const { data: easJson, raw: easJsonRaw } = readJsonPreserve(easJsonPath);
let easJsonChanged = false;

if (!easJson.build) {
  easJson.build = {};
  easJsonChanged = true;
}

const profilesToChannel = [
  { name: 'development', defaults: { developmentClient: true, distribution: 'internal' } },
  { name: 'preview', defaults: { distribution: 'internal' } },
  { name: 'production', defaults: {} },
];

for (const { name, defaults } of profilesToChannel) {
  if (!easJson.build[name]) {
    easJson.build[name] = { ...defaults, channel: name };
    easJsonChanged = true;
    log.ok(`Created profile "${name}" with channel "${name}"`);
  } else if (!easJson.build[name].channel) {
    easJson.build[name].channel = name;
    easJsonChanged = true;
    log.ok(`Added channel "${name}" to existing "${name}" profile`);
  } else {
    log.skip(`Profile "${name}" already has channel "${easJson.build[name].channel}"`);
  }
}

if (easJsonChanged) {
  writeJsonPreserve(easJsonPath, easJson, easJsonRaw);
  log.ok('eas.json saved');
}

// ─── Run eas update:configure (idempotent) ─────────────────────────────

log.step('Running eas update:configure (final wiring)');
runSync('npx', ['eas-cli@latest', 'update:configure', '--non-interactive'], { allowFail: true });

// ─── Verification ──────────────────────────────────────────────────────

log.step('Final verification');

const finalApp = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const finalEas = JSON.parse(readFileSync(easJsonPath, 'utf8'));
const finalPkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const checks = [
  ['expo-updates installed', !!finalPkg.dependencies?.['expo-updates']],
  ['runtimeVersion configured', !!finalApp.expo.runtimeVersion],
  ['updates.url configured', !!finalApp.expo.updates?.url],
  ['eas.json production channel', !!finalEas.build?.production?.channel],
  ['eas.json preview channel', !!finalEas.build?.preview?.channel],
];

let allOk = true;
for (const [label, ok] of checks) {
  if (ok) log.ok(label);
  else { log.err(label); allOk = false; }
}

// ─── Summary ───────────────────────────────────────────────────────────

console.log('');
console.log('═'.repeat(70));
if (allOk) {
  console.log('\x1b[32m\x1b[1m✓ OTA setup complete!\x1b[0m');
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('  1. Commit the changes:');
  console.log('       git add app.json eas.json package.json package-lock.json');
  console.log('       git commit -m "Enable OTA updates via expo-updates"');
  console.log('       git push');
  console.log('');
  console.log('  2. Build ONE more time so the binary includes expo-updates:');
  console.log('       npx eas-cli build --platform ios --profile production');
  console.log('       npx eas-cli submit --platform ios --id <BUILD_ID>');
  console.log('');
  console.log('  3. After that build is on TestFlight/App Store, push JS-only updates:');
  console.log('       npx eas-cli update --branch production --message "your changes"');
  console.log('     This is INSTANT and FREE. No rebuild needed for JS/TSX/parser changes.');
  console.log('');
  console.log('  Rebuild only when you change:');
  console.log('    - app.json (permissions, plugins, icons)');
  console.log('    - native modules (new npm package with iOS/Android code)');
  console.log('    - Expo SDK version');
  console.log('    - app version (2.1.0 → 2.2.0) — runtimeVersion policy enforces this');
  console.log('');
} else {
  console.log('\x1b[31m\x1b[1m✗ Setup incomplete — check errors above\x1b[0m');
  process.exit(1);
}
console.log('═'.repeat(70));
