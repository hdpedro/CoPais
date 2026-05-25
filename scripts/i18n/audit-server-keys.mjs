#!/usr/bin/env node
/**
 * audit-server-keys.mjs
 *
 * Detecta uso de t() / getServerT() com chaves que NÃO existem em pt.json
 * — caso do bug `reminders.activity.title` (2026-05-22) que ia pro push
 * cru porque ninguém validou que a chave existia no dicionário PWA.
 *
 * Escopo: server-side only. Cliente já valida via TypeScript types
 * (keys.generated.ts). Server usa `t(stringDinâmica, vars)` que escapa
 * do checker estático.
 *
 * Arquivos analisados:
 *   - src/lib/services/**
 *   - src/lib/push.ts, lib/push-fcm.ts
 *   - src/app/api/cron/**
 *   - src/app/api/push/**
 *   - src/app/api/native/notify/**
 *   - src/actions/**
 *
 * Detecta:
 *   - t("foo.bar.baz")  → literal chave
 *   - t(`foo.bar.${var}`)  → template literal com prefixo conhecido
 *   - t(constanteVariável)  → flag pra revisão manual (não resolvível estático)
 *
 * Output:
 *   - Lista de keys usadas em server-side
 *   - Subset que NÃO existe em pt.json (falhas críticas)
 *   - Exit code 1 se houver missing → integra com CI
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const PT_JSON = join(ROOT, 'src/i18n/locales/pt.json');

/* ---------- 1. Coleta de chaves usadas em server ---------- */

const SCAN_DIRS = [
  'src/lib/services',
  'src/lib',  // push.ts, push-fcm.ts
  'src/app/api/cron',
  'src/app/api/push',
  'src/app/api/native',
  'src/actions',
];

const SCAN_FILE_BLACKLIST = [
  'keys.generated.ts',
  '.test.ts',
  '.spec.ts',
];

// Matches:
//   t("foo.bar.baz")          → captura "foo.bar.baz"
//   t('foo.bar.baz')          → captura 'foo.bar.baz'
//   t("foo.bar.baz", vars)    → mesmo
//   getServerT(...)("foo.x")  → idem
//   `${actorPrefix}.title`    → ignora (template var)
const KEY_LITERAL_RE = /\bt\s*\(\s*["']([a-zA-Z][\w.]*)["']/g;
// Template literal com prefixo literal: `foo.bar.${suffix}` → captura prefixo
const KEY_TEMPLATE_RE = /\bt\s*\(\s*`([a-zA-Z][\w.]*)\.\$\{/g;
// Variável dinâmica: t(varName) — flag pra revisão
const KEY_DYNAMIC_RE = /\bt\s*\(\s*([a-zA-Z]\w*)\s*[,)]/g;

const usedKeys = new Map(); // key → [files]
const dynamicCalls = []; // { file, line, varName }
const templatePrefixes = new Map(); // prefix → [files]

function walk(dir, callback) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules / .next / etc
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full, callback);
    } else if (stat.isFile()) {
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      if (SCAN_FILE_BLACKLIST.some((b) => entry.includes(b))) continue;
      callback(full);
    }
  }
}

function scanFile(absPath) {
  const rel = relative(ROOT, absPath).replace(/\\/g, '/');
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');

  // Literal keys
  for (const match of content.matchAll(KEY_LITERAL_RE)) {
    const key = match[1];
    // Skip non-dotted (likely variable name, not a key)
    if (!key.includes('.')) continue;
    if (!usedKeys.has(key)) usedKeys.set(key, []);
    usedKeys.get(key).push(rel);
  }

  // Template prefixes
  for (const match of content.matchAll(KEY_TEMPLATE_RE)) {
    const prefix = match[1];
    if (!templatePrefixes.has(prefix)) templatePrefixes.set(prefix, []);
    templatePrefixes.get(prefix).push(rel);
  }

  // Dynamic calls — only flag if the variable name suggests a key (ends in Key, etc.)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const match of line.matchAll(KEY_DYNAMIC_RE)) {
      const varName = match[1];
      // Skip the noise: t(t), t(error), t(props), etc.
      if (/Key$/i.test(varName) || /^title|message|body$/i.test(varName)) {
        dynamicCalls.push({ file: rel, line: i + 1, varName });
      }
    }
  }
}

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    walk(abs, scanFile);
  } catch (e) {
    console.warn(`Could not scan ${dir}: ${e.message}`);
  }
}

/* ---------- 2. Carrega dicionário pt-BR ---------- */

const ptDict = JSON.parse(readFileSync(PT_JSON, 'utf-8'));

function resolveKey(dict, key) {
  const parts = key.split('.');
  let val = dict;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return null;
    val = val[p];
  }
  return typeof val === 'string' ? val : null;
}

/* ---------- 3. Audita ---------- */

const missing = [];
const found = [];
for (const [key, files] of usedKeys) {
  const value = resolveKey(ptDict, key);
  if (value === null) {
    missing.push({ key, files });
  } else {
    found.push({ key, value, files });
  }
}

// Template prefixes — verifica se PELO MENOS UM filho existe (heurística:
// se prefixo tem subkeys, OK; se vazio/inexistente, missing).
const templateMissing = [];
for (const [prefix, files] of templatePrefixes) {
  const node = (function resolveNode(dict, key) {
    const parts = key.split('.');
    let val = dict;
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return null;
      val = val[p];
    }
    return val;
  })(ptDict, prefix);

  if (!node || typeof node !== 'object' || Object.keys(node).length === 0) {
    templateMissing.push({ prefix, files });
  }
}

/* ---------- 4. Output ---------- */

console.log('═══════════════════════════════════════════════════════════════════');
console.log('   🔍 i18n Server-Side Audit — Kindar PWA');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`Arquivos varridos: ${SCAN_DIRS.join(', ')}`);
console.log(`Source: ${relative(ROOT, PT_JSON)}\n`);

console.log(`📦 Chaves literais usadas: ${usedKeys.size}`);
console.log(`✅ Encontradas em pt.json: ${found.length}`);
console.log(`❌ MISSING em pt.json:     ${missing.length}\n`);

if (missing.length > 0) {
  console.log('═══ CHAVES MISSING (renderizam crua em prod) ═══\n');
  for (const { key, files } of missing) {
    console.log(`  ${key}`);
    for (const f of [...new Set(files)]) {
      console.log(`    → ${f}`);
    }
    console.log();
  }
}

if (templatePrefixes.size > 0) {
  console.log(`\n📐 Template literal prefixes (\`prefix.\${var}\`): ${templatePrefixes.size}`);
  for (const { prefix, files } of templateMissing) {
    console.log(`  ❌ ${prefix}.* → namespace não existe`);
    for (const f of [...new Set(files)]) {
      console.log(`     → ${f}`);
    }
  }
}

if (dynamicCalls.length > 0 && process.env.VERBOSE === '1') {
  console.log(`\n🔧 Dynamic calls (variável passada — não-resolvível estaticamente): ${dynamicCalls.length}`);
  console.log('   Revisar manualmente — só aparece com VERBOSE=1\n');
  for (const { file, line, varName } of dynamicCalls.slice(0, 20)) {
    console.log(`  ${file}:${line}  t(${varName})`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════');
if (missing.length === 0 && templateMissing.length === 0) {
  console.log('✅ Tudo OK — nenhuma chave server-side missing.');
  process.exit(0);
} else {
  console.log(`❌ ${missing.length + templateMissing.length} problemas detectados — fix antes de deploy.`);
  process.exit(1);
}
