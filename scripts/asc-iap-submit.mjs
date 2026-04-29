/**
 * Submit all 6 Kindar IAPs for Apple Beta App Review.
 *
 * Pre-reqs (script will check):
 *   - localizations pt-BR + en-US present
 *   - subscriptionAvailability set
 *   - prices in all 175 territories (run asc-iap-equalize.mjs first)
 *   - subscription review screenshot uploaded (state=COMPLETE)
 *
 * Apple's `subscriptionSubmissions` endpoint returns:
 *   • 201 → submitted, state goes to WAITING_FOR_REVIEW
 *   • 409 STATE_ERROR.IAP_SUBMISSION_NOT_ALLOWED_* → tells us what's missing
 *   • 409 ALREADY_SUBMITTED → already in review, skip
 *
 * The script reports per-IAP: SUBMITTED / SKIPPED / BLOCKED with details.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';

const SUBS = [
  { id: '6764693892', name: 'harmonia.monthly' },
  { id: '6764693944', name: 'harmonia.annual' },
  { id: '6764693945', name: 'earlybird.monthly' },
  { id: '6764693916', name: 'earlybird.annual' },
  { id: '6764694011', name: 'juridico.monthly' },
  { id: '6764693946', name: 'juridico.annual' },
];

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return fs.readFileSync(path.join(home, 'OneDrive', 'Área de Trabalho', 'APP CoPais', `AuthKey_${KEY_ID}.p8`), 'utf8');
}
function b64url(b) { return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function jwt() {
  const pk = findP8();
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const i = `${h}.${p}`;
  const sig = crypto.createSign('SHA256').update(i).end().sign({ key: pk, dsaEncoding: 'ieee-p1363' });
  return `${i}.${b64url(sig)}`;
}
const T = jwt();
const BASE = 'https://api.appstoreconnect.apple.com/v1';

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, json: j, text: t };
}

async function submitOne(sub) {
  // Check current state first
  const cur = await api('GET', `/subscriptions/${sub.id}`);
  const state = cur.json?.data?.attributes?.state;
  if (state === 'WAITING_FOR_REVIEW' || state === 'IN_REVIEW') {
    return { result: 'SKIPPED', reason: `already ${state}` };
  }
  if (state === 'APPROVED') {
    return { result: 'SKIPPED', reason: 'already APPROVED' };
  }

  const r = await api('POST', `/subscriptionSubmissions`, {
    data: {
      type: 'subscriptionSubmissions',
      relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
    },
  });
  if (r.ok) {
    return { result: 'SUBMITTED', reason: `id=${r.json.data?.id}` };
  }
  const err = r.json?.errors?.[0];
  return { result: 'BLOCKED', reason: `${err?.code || r.status}: ${err?.detail?.slice(0, 200) || r.text.slice(0, 200)}` };
}

async function main() {
  console.log('Apple IAP — submit for review\n', new Date().toISOString());
  for (const sub of SUBS) {
    const res = await submitOne(sub);
    const ico = res.result === 'SUBMITTED' ? '✅' : res.result === 'SKIPPED' ? '⏭' : '❌';
    console.log(`${ico} ${sub.name.padEnd(20)} ${res.result} — ${res.reason}`);
  }

  console.log('\nFinal states:');
  for (const sub of SUBS) {
    const r = await api('GET', `/subscriptions/${sub.id}`);
    console.log(`  ${sub.name.padEnd(20)} ${r.json?.data?.attributes?.state}`);
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
