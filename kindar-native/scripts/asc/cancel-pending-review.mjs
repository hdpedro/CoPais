#!/usr/bin/env node
/**
 * cancel-pending-review.mjs
 *
 * Encontra reviewSubmissions em estado pendente (WAITING_FOR_REVIEW / IN_REVIEW)
 * pro App Kindar e tenta cancelar via PATCH canceled=true.
 *
 * Caso de uso: você submeteu 1.0.X, depois precisou bump pra 1.0.Y, mas Apple
 * bloqueia create de 1.0.Y com "cannot create a new version of the App in the
 * current state". Esse script libera o estado.
 *
 * Auth: JWT ES256 igual ao submit-for-review.mjs.
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
  const encHeader = base64urlEncode(JSON.stringify(header));
  const encPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;
  const privateKey = readFileSync(ASC_KEY_PATH, 'utf8');
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64urlEncode(signature)}`;
}

let cachedJwt = null;
let cachedJwtExpiry = 0;

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
    headers: {
      Authorization: `Bearer ${getJwt()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    const errMsg = (body.errors || []).map(e => `[${e.code}] ${e.title} :: ${e.detail || ''}`).join('\n') || text;
    const err = new Error(`ASC ${r.status} ${opts.method || 'GET'} ${url}\n${errMsg}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  console.log(`🧹 Listando reviewSubmissions pendentes do app ${ASC_APP_ID}…`);
  const list = await ascFetch(`/reviewSubmissions?filter[app]=${ASC_APP_ID}&limit=20`);
  const items = list.data || [];
  console.log(`  · ${items.length} submission(s) encontradas`);
  for (const sub of items) {
    console.log(`     id=${sub.id} state=${sub.attributes?.state} submittedDate=${sub.attributes?.submittedDate}`);
  }
  const cancellable = items.filter(s => {
    const st = s.attributes?.state;
    return st === 'WAITING_FOR_REVIEW' || st === 'IN_REVIEW' || st === 'READY_FOR_REVIEW';
  });
  if (cancellable.length === 0) {
    console.log('Nada a cancelar — todas as submissions estão em estado final ou nenhum pendente.');
    return;
  }
  for (const sub of cancellable) {
    console.log(`\n→ Tentando cancelar ${sub.id} (state=${sub.attributes?.state})…`);
    try {
      await ascFetch(`/reviewSubmissions/${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: { type: 'reviewSubmissions', id: sub.id, attributes: { canceled: true } },
        }),
      });
      console.log(`  ✅ cancelado.`);
    } catch (e) {
      console.log(`  × PATCH canceled=true falhou: ${e.message}`);
      // Fallback: tentar DELETE
      try {
        await ascFetch(`/reviewSubmissions/${sub.id}`, { method: 'DELETE' });
        console.log(`  ✅ DELETE bem-sucedido.`);
      } catch (e2) {
        console.log(`  × DELETE também falhou: ${e2.message}`);
      }
    }
  }
  console.log('\n📋 Estado pós-cancelamento:');
  const after = await ascFetch(`/reviewSubmissions?filter[app]=${ASC_APP_ID}&limit=20`);
  for (const sub of (after.data || [])) {
    console.log(`  · id=${sub.id} state=${sub.attributes?.state}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
