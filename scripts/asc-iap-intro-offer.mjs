/**
 * Create Apple "2 meses grátis" Introductory Offers via ASC API.
 *
 * Adds a FREE_TRIAL · TWO_MONTHS introductory offer to the 4 regular IAPs
 * (Harmonia monthly + annual + Premium Jurídico monthly + annual). Skips
 * Early Bird since they already have a lifetime discount.
 *
 * Per Apple docs (forums thread 759596 confirms): introductory offers are
 * scoped per subscription + per territory, no bulk endpoint. We POST one
 * offer per (subscription, territory) tuple — 4 × 175 = 700 calls.
 *
 * Behavior:
 *   - default mode: create
 *   - --delete: remove all FREE_TRIAL offers from all 4 subs
 *   - idempotent: skips existing offers per territory
 *
 * Usage:
 *   node scripts/asc-iap-intro-offer.mjs            # create
 *   node scripts/asc-iap-intro-offer.mjs --delete   # remove
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const MODE = process.argv.includes('--delete') ? 'delete' : 'create';

// Regular IAPs only — Early Bird is excluded (already discounted).
const SUBS = [
  { id: '6764693892', name: 'harmonia.monthly' },
  { id: '6764693944', name: 'harmonia.annual' },
  { id: '6764694011', name: 'juridico.monthly' },
  { id: '6764693946', name: 'juridico.annual' },
];

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return fs.readFileSync(
    path.join(home, 'OneDrive', 'Área de Trabalho', 'APP CoPais', `AuthKey_${KEY_ID}.p8`),
    'utf8',
  );
}
function b64url(b) {
  return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
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

async function apiOnce(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, json: j, text: t };
}

async function api(method, p, body) {
  const delays = [3000, 8000, 20000, 45000, 90000];
  for (let i = 0; i <= delays.length; i++) {
    const r = await apiOnce(method, p, body);
    if (r.status !== 429) return r;
    if (i === delays.length) return r;
    await new Promise((res) => setTimeout(res, delays[i]));
  }
}

async function getAllTerritories() {
  const all = [];
  let next = `/territories?limit=200`;
  while (next) {
    const r = await api('GET', next);
    if (!r.ok) throw new Error(`territories fetch: ${r.text}`);
    all.push(...(r.json.data || []));
    const nx = r.json.links?.next;
    next = nx ? nx.replace('https://api.appstoreconnect.apple.com/v1', '') : null;
  }
  return all.map((t) => t.id);
}

async function getCurrentOffers(subId) {
  // Returns Map<territoryId, offerId> of existing FREE_TRIAL offers
  // for this subscription. Used to skip duplicates and to drive --delete.
  const out = new Map();
  let next = `/subscriptions/${subId}/introductoryOffers?include=territory&limit=200`;
  while (next) {
    const r = await api('GET', next);
    if (!r.ok) break;
    for (const offer of (r.json.data || [])) {
      const territoryId = offer.relationships?.territory?.data?.id;
      if (territoryId) out.set(territoryId, offer.id);
    }
    const nx = r.json.links?.next;
    next = nx ? nx.replace('https://api.appstoreconnect.apple.com/v1', '') : null;
  }
  return out;
}

async function postOffer(subId, territoryId) {
  // FREE_TRIAL · TWO_MONTHS, no end date (active until manually expired).
  // startDate=null tells Apple "starts when offer becomes valid" (which is
  // when the subscription is approved + offer is approved by review).
  return api('POST', '/subscriptionIntroductoryOffers', {
    data: {
      type: 'subscriptionIntroductoryOffers',
      attributes: {
        offerMode: 'FREE_TRIAL',
        duration: 'TWO_MONTHS',
        startDate: null,
        endDate: null,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        territory: { data: { type: 'territories', id: territoryId } },
      },
    },
  });
}

async function deleteOffer(offerId) {
  return api('DELETE', `/subscriptionIntroductoryOffers/${offerId}`);
}

async function processSub(sub, allTerritories) {
  console.log(`\n${sub.name}`);
  const existing = await getCurrentOffers(sub.id);
  console.log(`  existing offers: ${existing.size}`);

  if (MODE === 'delete') {
    let deleted = 0, errors = 0;
    for (const [terr, offerId] of existing) {
      const r = await deleteOffer(offerId);
      if (r.ok) deleted++;
      else { errors++; if (errors < 5) console.log(`    ✗ ${terr}: ${r.text.slice(0, 80)}`); }
      if (deleted % 25 === 24) {
        process.stdout.write(`    ${deleted} deleted, ${errors} errors\n`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(`  → deleted=${deleted}, errors=${errors}`);
    return { created: 0, skipped: 0, deleted, errors };
  }

  // create mode
  const tasks = [];
  for (const terr of allTerritories) {
    if (existing.has(terr)) continue;
    tasks.push(terr);
  }
  console.log(`  posting ${tasks.length} new offers (skipping ${existing.size} existing)`);

  let created = 0, errors = 0;
  for (let i = 0; i < tasks.length; i++) {
    const r = await postOffer(sub.id, tasks[i]);
    if (r.ok) created++;
    else if (r.status === 409) {
      // Already exists — race or stale getCurrentOffers cache. Treat as skipped.
    } else {
      errors++;
      if (errors < 5) console.log(`    ✗ ${tasks[i]}: ${r.json?.errors?.[0]?.detail?.slice(0, 80) || r.text.slice(0, 80)}`);
    }
    if (i % 25 === 24 || i === tasks.length - 1) {
      process.stdout.write(`    ${i + 1}/${tasks.length} done — created=${created}, errors=${errors}\n`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  console.log(`  → created=${created}, skipped=${existing.size}, errors=${errors}`);
  return { created, skipped: existing.size, errors };
}

async function main() {
  console.log(`Apple ASC — IAP Introductory Offer ${MODE.toUpperCase()}\n`, new Date().toISOString());

  const allTerritories = MODE === 'delete' ? [] : await getAllTerritories();
  if (MODE === 'create') console.log(`Territories: ${allTerritories.length}`);

  const totals = { created: 0, skipped: 0, deleted: 0, errors: 0 };
  for (const sub of SUBS) {
    try {
      const r = await processSub(sub, allTerritories);
      totals.created += r.created;
      totals.skipped += r.skipped;
      totals.deleted += r.deleted ?? 0;
      totals.errors += r.errors;
    } catch (e) {
      console.log(`  FATAL ${sub.name}: ${e.message}`);
    }
  }

  console.log(`\nTotal: created=${totals.created}, skipped=${totals.skipped}, deleted=${totals.deleted}, errors=${totals.errors}`);

  console.log('\nFinal offer count per subscription:');
  for (const sub of SUBS) {
    const offers = await getCurrentOffers(sub.id);
    console.log(`  ${sub.name.padEnd(20)} ${offers.size} territories`);
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
