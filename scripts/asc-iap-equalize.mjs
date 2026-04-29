/**
 * Equalize subscription prices across all territories.
 *
 * Apple requires every subscription in the app to have a price for EVERY
 * territory where the app is sold (175+). The base BRA price we set isn't
 * enough — Apple auto-converts the BRA tier to equivalents in all other
 * territories, but the API requires us to POST one subscriptionPrice record
 * per (subscription, territory) tuple.
 *
 * Strategy:
 *   1. For each subscription, find its current BRA price tier (e.g., "10077"
 *      for R$ 19.90).
 *   2. Find the equivalent pricePoint for every other territory at the SAME
 *      tier number — that's Apple's currency-converted equivalent.
 *   3. POST a subscriptionPrice for each of those pricePoints.
 *
 * We skip territories that already have a price (idempotent).
 *
 * Run: node scripts/asc-iap-equalize.mjs
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

// Apple rate limits ~200 req/min per key. We retry 429 with exponential
// backoff so the script doesn't fail on bursts.
async function api(method, p, body) {
  const delays = [3000, 8000, 20000, 45000, 90000];
  for (let i = 0; i <= delays.length; i++) {
    const r = await apiOnce(method, p, body);
    if (r.status !== 429) return r;
    if (i === delays.length) return r;
    await new Promise((res) => setTimeout(res, delays[i]));
  }
}

// Decode pricePoint id: base64url-encoded JSON {s: subId, t: territory, p: tier}
function decode(ppId) {
  return JSON.parse(Buffer.from(ppId, 'base64url').toString());
}

async function getCurrentBaseTier(subId) {
  // Fetch subscription's current prices, decode pricePointId, get tier number.
  const r = await api('GET', `/subscriptions/${subId}/prices?include=subscriptionPricePoint&limit=200`);
  if (!r.ok) throw new Error(`Cant fetch prices: ${r.text}`);
  const prices = r.json.data || [];
  const ppMap = new Map();
  for (const inc of (r.json.included || [])) ppMap.set(inc.id, inc);

  // Find BRA price
  for (const price of prices) {
    const ppId = price.relationships?.subscriptionPricePoint?.data?.id;
    if (!ppId) continue;
    const dec = decode(ppId);
    if (dec.t === 'BRA') return { tier: dec.p, ppId };
  }
  throw new Error(`No BRA price for ${subId}`);
}

// Construct pricePoint ID for any (subId, territory, tier) tuple.
// Apple's pricePointId is base64url-encoded JSON `{s, t, p}`.
function makePricePointId(subId, territory, tier) {
  return Buffer.from(JSON.stringify({ s: subId, t: territory, p: String(tier) })).toString('base64url');
}

async function getAllTerritories() {
  // The full Apple territory catalogue (~175 entries). One paginated GET.
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

async function getCurrentTerritories(subId) {
  // Apple's max limit on this endpoint is 200 — passing higher silently
  // returns an empty set (200 status, but data: []). Paginate properly.
  const set = new Set();
  let next = `/subscriptions/${subId}/prices?include=subscriptionPricePoint&limit=200`;
  while (next) {
    const r = await api('GET', next);
    if (!r.ok) break;
    for (const price of (r.json.data || [])) {
      const ppId = price.relationships?.subscriptionPricePoint?.data?.id;
      if (!ppId) continue;
      const dec = decode(ppId);
      if (dec.t) set.add(dec.t);
    }
    const nx = r.json.links?.next;
    next = nx ? nx.replace('https://api.appstoreconnect.apple.com/v1', '') : null;
  }
  return set;
}

async function postPrice(subId, ppId) {
  return api('POST', `/subscriptionPrices`, {
    data: {
      type: 'subscriptionPrices',
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: ppId } },
      },
    },
  });
}

async function equalize(sub, allTerritories) {
  console.log(`\n${sub.name}`);
  const { tier } = await getCurrentBaseTier(sub.id);
  console.log(`  base tier (BRA) = ${tier}`);

  const already = await getCurrentTerritories(sub.id);
  console.log(`  territories already priced = ${already.size}`);

  let created = 0, skipped = 0, errors = 0;
  const tasks = [];
  for (const terr of allTerritories) {
    if (already.has(terr)) { skipped++; continue; }
    tasks.push({ terr, ppId: makePricePointId(sub.id, terr, tier) });
  }
  console.log(`  posting ${tasks.length} prices sequentially (300ms gap)...`);

  // Sequential with 300ms gap = ~3 req/s = 180/min. Under Apple's ~200/min limit.
  // 429s get retried via api() with backoff.
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const r = await postPrice(sub.id, t.ppId);
    if (r.ok) {
      created++;
    } else if (r.status === 409) {
      // 409 = price already exists for this territory. Treat as skipped.
      skipped++;
    } else {
      errors++;
      if (errors < 5) console.log(`    ✗ ${t.terr}:`, r.json?.errors?.[0]?.detail?.slice(0, 80) || r.text.slice(0, 80));
    }
    if (i % 25 === 24 || i === tasks.length - 1) {
      process.stdout.write(`    ${i + 1}/${tasks.length} done — created=${created}, skipped=${skipped}, errors=${errors}\n`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  console.log(`  → created=${created}, skipped=${skipped}, errors=${errors}`);
  return { created, skipped, errors };
}

async function main() {
  console.log('Apple ASC — IAP price equalization\n', new Date().toISOString());

  console.log('Fetching all Apple territories...');
  const allTerritories = await getAllTerritories();
  console.log(`  ${allTerritories.length} territories`);

  const totals = { created: 0, skipped: 0, errors: 0 };
  for (const sub of SUBS) {
    try {
      const r = await equalize(sub, allTerritories);
      totals.created += r.created; totals.skipped += r.skipped; totals.errors += r.errors;
    } catch (e) {
      console.log(`  FATAL ${sub.name}: ${e.message}`);
    }
  }
  console.log(`\nTotal: created=${totals.created}, skipped=${totals.skipped}, errors=${totals.errors}`);

  // Final state of all subs
  console.log('\nFinal subscription states:');
  for (const sub of SUBS) {
    const r = await api('GET', `/subscriptions/${sub.id}`);
    console.log(`  ${sub.name.padEnd(20)} ${r.json?.data?.attributes?.state || '?'}`);
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
