#!/usr/bin/env node
/**
 * delete-pending-version.mjs
 *
 * Apple bloqueia criação de novo appStoreVersion quando já existe um em estado
 * pré-review (PREPARE_FOR_SUBMISSION, WAITING_FOR_REVIEW, IN_REVIEW etc).
 * Esse script encontra a appStoreVersion não-completa atual e deleta, pra
 * desbloquear a criação da nova versão.
 *
 * Aguarda também CANCELING → CANCELED do reviewSubmission antes de tentar DELETE.
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

const API = 'https://api.appstoreconnect.apple.com/v1';

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function buildJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const payload = { iss: ASC_ISSUER_ID, exp: now + 1200, aud: 'appstoreconnect-v1' };
  const signingInput = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64urlEncode(signature)}`;
}
let cachedJwt = null, cachedJwtExpiry = 0;
function getJwt() {
  const now = Date.now();
  if (!cachedJwt || now > cachedJwtExpiry - 60_000) {
    cachedJwt = buildJwt();
    cachedJwtExpiry = now + 1200 * 1000;
  }
  return cachedJwt;
}
async function ascFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${getJwt()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    const errMsg = (body.errors || []).map(e => `[${e.code}] ${e.title} :: ${e.detail || ''}`).join('\n') || text;
    const err = new Error(`ASC ${r.status} ${opts.method || 'GET'} ${url}\n${errMsg}`);
    err.status = r.status;
    throw err;
  }
  return body;
}

const TERMINAL_STATES = new Set(['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE', 'METADATA_REJECTED', 'REJECTED', 'DEVELOPER_REJECTED']);

async function waitForCancelingDone() {
  console.log('1. Aguardando reviewSubmissions em CANCELING terminarem…');
  for (let i = 0; i < 30; i++) {
    const list = await ascFetch(`/reviewSubmissions?filter[app]=${ASC_APP_ID}&limit=20`);
    const canceling = (list.data || []).filter(s => s.attributes?.state === 'CANCELING');
    if (canceling.length === 0) {
      console.log('  · todas as cancelations completaram.');
      return;
    }
    console.log(`  · ${canceling.length} ainda em CANCELING, aguardando 10s… (tentativa ${i + 1}/30)`);
    await new Promise(r => setTimeout(r, 10_000));
  }
  console.warn('  ⚠ timeout aguardando CANCELING, tentando proceder mesmo assim');
}

async function listAppStoreVersions() {
  const list = await ascFetch(`/apps/${ASC_APP_ID}/appStoreVersions?limit=20&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate`);
  return list.data || [];
}

async function main() {
  await waitForCancelingDone();

  console.log('\n2. Listando appStoreVersions do app…');
  const versions = await listAppStoreVersions();
  for (const v of versions) {
    console.log(`  · ${v.attributes.versionString} state=${v.attributes.appStoreState} id=${v.id}`);
  }

  const pending = versions.filter(v => !TERMINAL_STATES.has(v.attributes.appStoreState));
  if (pending.length === 0) {
    console.log('Nenhuma versão pendente — pode criar 1.0.13 agora.');
    return;
  }

  for (const v of pending) {
    console.log(`\n3. Deletando appStoreVersion ${v.attributes.versionString} (${v.id}, state=${v.attributes.appStoreState})…`);
    try {
      await ascFetch(`/appStoreVersions/${v.id}`, { method: 'DELETE' });
      console.log('  ✅ deletado.');
    } catch (e) {
      console.log(`  × falhou: ${e.message}`);
      // Fallback: rename versionString pra liberar
      console.log('  → fallback: tentar PATCH versionString pra 1.0.13…');
      try {
        await ascFetch(`/appStoreVersions/${v.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            data: { type: 'appStoreVersions', id: v.id, attributes: { versionString: process.env.TARGET_VERSION || '1.0.13' } },
          }),
        });
        console.log(`  ✅ renomeado pra ${process.env.TARGET_VERSION || '1.0.13'}.`);
      } catch (e2) {
        console.log(`  × rename também falhou: ${e2.message}`);
      }
    }
  }

  console.log('\n4. Estado final:');
  const after = await listAppStoreVersions();
  for (const v of after) {
    console.log(`  · ${v.attributes.versionString} state=${v.attributes.appStoreState} id=${v.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
