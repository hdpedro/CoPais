#!/usr/bin/env node
/**
 * rename-or-delete-1.0.12.mjs
 *
 * Tenta DELETE da appStoreVersion 1.0.12 (state=DEVELOPER_REJECTED). Se não rolar,
 * tenta PATCH versionString → 1.0.13 + reset build relationship.
 */

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const ASC_KEY_PATH = process.env.ASC_KEY_PATH || resolve(PROJECT_ROOT, '../AuthKey.p8');
const ASC_KEY_ID = process.env.ASC_KEY_ID || '736GBBC4YY';
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const ASC_APP_ID = process.env.ASC_APP_ID || '6762701916';
const VERSION_ID_1012 = '3084af5d-fad9-4767-ac13-2fa38f97311b';
const TARGET = process.env.TARGET_VERSION || '1.0.13';

const API = 'https://api.appstoreconnect.apple.com/v1';

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function buildJwt() {
  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${base64urlEncode(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))}.${base64urlEncode(JSON.stringify({ iss: ASC_ISSUER_ID, exp: now + 1200, aud: 'appstoreconnect-v1' }))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64urlEncode(signer.sign({ key: readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
let jwt; function getJwt() { return jwt ||= buildJwt(); }
async function ascFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${getJwt()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    const errMsg = (body.errors || []).map(e => `[${e.code}] ${e.title} :: ${e.detail || ''}`).join('\n') || text;
    const err = new Error(`ASC ${r.status} ${opts.method || 'GET'} ${url}\n${errMsg}`);
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  console.log(`\n1. Tentando DELETE /appStoreVersions/${VERSION_ID_1012}…`);
  try {
    await ascFetch(`/appStoreVersions/${VERSION_ID_1012}`, { method: 'DELETE' });
    console.log('  ✅ DELETE bem-sucedido.');
    return;
  } catch (e) {
    console.log(`  × ${e.message}`);
  }

  console.log(`\n2. Tentando PATCH /appStoreVersions/${VERSION_ID_1012} versionString → ${TARGET}…`);
  try {
    await ascFetch(`/appStoreVersions/${VERSION_ID_1012}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'appStoreVersions', id: VERSION_ID_1012, attributes: { versionString: TARGET } },
      }),
    });
    console.log(`  ✅ renomeada pra ${TARGET}.`);
    console.log('  ⚠ build ainda é o antigo (95) — submit-for-review.mjs vai detectar essa version existente e tentar anexar 96 via PATCH /relationships/build.');
  } catch (e) {
    console.log(`  × PATCH falhou: ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
