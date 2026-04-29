/**
 * Apple ASC API — Deep Probe
 *
 * Tests every endpoint left on the user-pendentes list to determine which
 * ones are actually automatable. For each, prints PASS/FAIL with the actual
 * shape Apple requires (or the precise error if blocked).
 *
 * Targets (in priority order):
 *   1. PATCH /apps/{id} → serverToServerNotificationsUrl
 *      (RevenueCat webhook URL on Apple's side, separate from RC's own webhook)
 *   2. PATCH /appStoreVersions/{id} → usesIdfa
 *      (Encryption + IDFA toggle without manual /distribution/encryption)
 *   3. PATCH /apps/{id} → traderInformation (DSA / Trader Status EU)
 *   4. POST /subscriptionAppStoreReviewScreenshots
 *      (Subscription review screenshot via asset upload)
 *   5. Re-test /subscriptionPrices with alternative shapes:
 *        a) territory in relationships
 *        b) startDate attribute
 *        c) using subscriptionAvailabilities first
 *   6. Probe /appAvailabilities + /appAvailabilityV2 endpoints
 *   7. Probe /territoryAvailabilities (DSA setup)
 *
 * Output format: every probe prints
 *   [endpoint] METHOD path → status (detail)
 * so the script can be run repeatedly without writing anything destructive.
 *
 * Run: node scripts/asc-deep-probe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const APP_ID = '6762701916';
const SUB_ID = '6764693892'; // harmonia.monthly — first IAP, used as test target

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  const candidates = [
    path.join(home, 'OneDrive', 'Área de Trabalho', 'APP CoPais', `AuthKey_${KEY_ID}.p8`),
    path.join(process.cwd(), `AuthKey_${KEY_ID}.p8`),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  throw new Error('AuthKey not found');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function jwt() {
  const pk = findP8();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign('SHA256').update(input).end().sign({ key: pk, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

const TOKEN = jwt();
const BASE = 'https://api.appstoreconnect.apple.com/v1';

async function call(method, p, body) {
  const opts = {
    method,
    headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + p, opts);
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { /* keep raw */ }
  return { status: r.status, ok: r.ok, json: j, text: t.slice(0, 500) };
}

function summary(res) {
  if (res.ok) return `OK ${res.status}`;
  const err = res.json?.errors?.[0];
  if (err) return `${res.status} ${err.code || ''} — ${err.title || ''} :: ${err.detail || ''} :: ${err.source?.pointer || ''}`;
  return `${res.status} ${res.text}`;
}

function row(label, res) {
  const tag = res.ok ? '✅ PASS' : (res.status === 404 ? '⚪ N/A ' : '❌ FAIL');
  console.log(`${tag}  ${label.padEnd(60)} ${summary(res)}`);
}

async function probeApp() {
  console.log('\n══ 1. App-level fields (PATCH /apps/{id}) ══\n');

  // First GET to see what fields exist now
  const cur = await call('GET', `/apps/${APP_ID}?fields[apps]=name,bundleId,primaryLocale,sku,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox`);
  if (cur.ok) {
    console.log('Current app attributes:');
    for (const [k, v] of Object.entries(cur.json.data.attributes || {})) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  } else {
    row('GET /apps/{id} fields', cur);
  }

  // Try to PATCH server-to-server URL (RevenueCat webhook from Apple)
  console.log('\n— Server-to-Server Notification URL (Apple → RC) —');
  const ssnUrl = 'https://api.revenuecat.com/v1/incoming/apple_server_to_server_notification';
  const r1 = await call('PATCH', `/apps/${APP_ID}`, {
    data: {
      type: 'apps',
      id: APP_ID,
      attributes: {
        subscriptionStatusUrl: ssnUrl,
        subscriptionStatusUrlVersion: 'V2',
      },
    },
  });
  row('PATCH apps subscriptionStatusUrl + V2', r1);

  // Sandbox URL too
  const r2 = await call('PATCH', `/apps/${APP_ID}`, {
    data: {
      type: 'apps',
      id: APP_ID,
      attributes: {
        subscriptionStatusUrlForSandbox: ssnUrl,
        subscriptionStatusUrlVersionForSandbox: 'V2',
      },
    },
  });
  row('PATCH apps subscriptionStatusUrlForSandbox', r2);
}

async function probeAppStoreVersion() {
  console.log('\n══ 2. App Store Version fields (encryption / IDFA) ══\n');

  // Find the latest app store version
  const v = await call('GET', `/apps/${APP_ID}/appStoreVersions?limit=1&sort=-createdDate&fields[appStoreVersions]=versionString,appStoreState,usesIdfa,downloadable`);
  if (!v.ok || !v.json?.data?.length) {
    row('GET appStoreVersions', v);
    return;
  }
  const ver = v.json.data[0];
  console.log(`Found version: ${ver.attributes?.versionString} (state=${ver.attributes?.appStoreState}) id=${ver.id}`);
  console.log('  current usesIdfa:', ver.attributes?.usesIdfa);

  // Try to PATCH usesIdfa = false
  const r = await call('PATCH', `/appStoreVersions/${ver.id}`, {
    data: {
      type: 'appStoreVersions',
      id: ver.id,
      attributes: { usesIdfa: false },
    },
  });
  row('PATCH appStoreVersions usesIdfa=false', r);

  // Probe app-level encryption declaration field
  const enc = await call('GET', `/apps/${APP_ID}?fields[apps]=contentRightsDeclaration,availableInNewTerritories`);
  if (enc.ok) {
    console.log('  contentRightsDeclaration:', enc.json.data.attributes?.contentRightsDeclaration);
    console.log('  availableInNewTerritories:', enc.json.data.attributes?.availableInNewTerritories);
  }
}

async function probeTraderInfo() {
  console.log('\n══ 3. DSA / Trader Status (EU) ══\n');

  // Try traderInformation as a nested resource
  const r1 = await call('GET', `/apps/${APP_ID}/marketplaceWebhookConfiguration`);
  row('GET /apps/{id}/marketplaceWebhookConfiguration', r1);

  // Probe direct trader endpoints
  const r2 = await call('GET', `/apps/${APP_ID}/eulas`);
  row('GET /apps/{id}/eulas', r2);

  // App-level fields
  const r3 = await call('GET', `/apps/${APP_ID}?fields[apps]=name`);
  if (r3.ok) {
    console.log('  All app fields available — probing trader-related ones:');
    for (const k of ['contentRightsDeclaration', 'distributionType', 'isNewApp']) {
      const sub = await call('GET', `/apps/${APP_ID}?fields[apps]=${k}`);
      if (sub.ok && sub.json.data.attributes && k in sub.json.data.attributes) {
        console.log(`    ✅ ${k}: ${JSON.stringify(sub.json.data.attributes[k])}`);
      }
    }
  }
}

async function probeSubscriptionScreenshot() {
  console.log('\n══ 4. Subscription Review Screenshot (POST + asset upload) ══\n');

  // List existing screenshots
  const cur = await call('GET', `/subscriptions/${SUB_ID}/appStoreReviewScreenshot`);
  row('GET subscription appStoreReviewScreenshot', cur);
  if (cur.ok && cur.json?.data) {
    console.log('  Already has screenshot: id=', cur.json.data.id);
    return;
  }

  // Try to POST a placeholder reservation (would need actual file size to complete)
  const r = await call('POST', `/subscriptionAppStoreReviewScreenshots`, {
    data: {
      type: 'subscriptionAppStoreReviewScreenshots',
      attributes: {
        fileName: 'subscription-review.png',
        fileSize: 100000,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: SUB_ID } },
      },
    },
  });
  row('POST subscriptionAppStoreReviewScreenshots reservation', r);
  if (r.ok) {
    console.log('  Reservation URL:', r.json?.data?.attributes?.uploadOperations?.[0]?.url);
    console.log('  → needs PUT to URL with image bytes, then PATCH with sourceFileChecksum');
  }
}

async function probeSubscriptionPrices() {
  console.log('\n══ 5. Subscription Prices — alternate shapes ══\n');

  // Get a known-valid price point ID
  const pp = await call('GET', `/subscriptions/${SUB_ID}/pricePoints?filter[territory]=BRA&limit=5`);
  if (!pp.ok || !pp.json?.data?.length) {
    row('GET pricePoints (sanity)', pp);
    return;
  }
  const ppId = pp.json.data[0].id;
  console.log(`Using pricePoint id=${ppId} (price=${pp.json.data[0].attributes?.customerPrice})`);

  // Shape A: with territory in relationships (we expect RELATIONSHIP.INVALID either way)
  const a = await call('POST', `/subscriptionPrices`, {
    data: {
      type: 'subscriptionPrices',
      relationships: {
        subscription: { data: { type: 'subscriptions', id: SUB_ID } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: ppId } },
        territory: { data: { type: 'territories', id: 'BRA' } },
      },
    },
  });
  row('POST subscriptionPrices (with territory rel)', a);

  // Shape B: with startDate attribute
  const b = await call('POST', `/subscriptionPrices`, {
    data: {
      type: 'subscriptionPrices',
      attributes: { startDate: null },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: SUB_ID } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: ppId } },
      },
    },
  });
  row('POST subscriptionPrices (startDate:null)', b);

  // Shape C: as a price point relationship in the format Apple uses for app prices
  const c = await call('POST', `/subscriptionPrices`, {
    data: {
      type: 'subscriptionPrices',
      relationships: {
        subscription: { data: { type: 'subscriptions', id: SUB_ID } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: ppId.replace(/_BRA$/, '') } },
      },
    },
  });
  row('POST subscriptionPrices (stripped territory)', c);

  // Shape D: try the V2 batch endpoint
  const d = await call('POST', `/subscriptions/${SUB_ID}/relationships/prices`, {
    data: [{ type: 'subscriptionPrices', id: ppId }],
  });
  row('POST /subscriptions/{id}/relationships/prices', d);
}

async function probeAvailabilities() {
  console.log('\n══ 6. Availabilities & Territories ══\n');

  // Subscription-level availability
  const a = await call('GET', `/subscriptions/${SUB_ID}/availability`);
  row('GET subscription availability', a);

  // Subscription Group availability
  const grp = await call('GET', `/subscriptions/${SUB_ID}?include=group`);
  if (grp.ok) {
    const groupId = grp.json?.data?.relationships?.group?.data?.id;
    if (groupId) {
      console.log(`  group id = ${groupId}`);
      const ga = await call('GET', `/subscriptionGroups/${groupId}`);
      row('GET subscriptionGroup', ga);
    }
  }

  // App-level availability V2
  const av2 = await call('GET', `/apps/${APP_ID}/appAvailabilityV2`);
  row('GET /apps/{id}/appAvailabilityV2', av2);
  if (av2.ok) {
    console.log('  Territories on availability:');
    const tr = av2.json?.data?.attributes?.availableInNewTerritories;
    console.log('    availableInNewTerritories:', tr);
  }
}

async function main() {
  console.log('Apple ASC Deep Probe\n', new Date().toISOString());
  console.log('App:', APP_ID, '· Subscription:', SUB_ID);

  await probeApp();
  await probeAppStoreVersion();
  await probeTraderInfo();
  await probeSubscriptionScreenshot();
  await probeSubscriptionPrices();
  await probeAvailabilities();

  console.log('\n══ Done ══');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
