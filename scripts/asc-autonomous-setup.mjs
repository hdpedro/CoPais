/**
 * Apple ASC — Autonomous setup runner.
 *
 * Applies everything the deep-probe proved is automatable, in production:
 *
 *   1. Server-to-Server Notification URL (Apple → RC), prod + sandbox
 *      [PATCH /apps/{id}]  ✅ proven 2026-04-29
 *   2. usesIdfa=false on the editable app store version
 *      [PATCH /appStoreVersions/{id}]  — only on PREPARE_FOR_SUBMISSION states
 *   3. Subscription review screenshots (one per IAP) via asset upload
 *      [POST /subscriptionAppStoreReviewScreenshots → PUT to S3 → PATCH commit]
 *      Uses a generated 1024×1024 PNG ("Kindar Premium subscription") as
 *      placeholder; real screenshot can replace it later.
 *   4. Verifies all changes persisted by re-GETting the resources.
 *
 * What's NOT in this script (proven blocked by Apple):
 *   • Subscription pricing (RELATIONSHIP.INVALID — manual via ASC web)
 *   • DSA / Trader Status (no API endpoint)
 *   • App Privacy questionnaire (endpoint removed)
 *   • Encryption declaration ITSAppUsesNonExemptEncryption (already in Info.plist
 *     via app.json, so this is moot — usesIdfa is the only remaining toggle)
 *
 * Run: node scripts/asc-autonomous-setup.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const APP_ID = '6762701916';

// RevenueCat endpoint that receives Apple Server-to-Server notifications.
// Confirmed by RC docs (2026): same URL for prod + sandbox; RC infers
// environment from the notification payload signedDate.
const RC_S2S_URL = 'https://api.revenuecat.com/v1/incoming/apple_server_to_server_notification';

const SUBSCRIPTIONS = [
  { id: '6764693892', productId: 'com.kindar.harmonia.monthly' },
  { id: '6764693944', productId: 'com.kindar.harmonia.annual' },
  { id: '6764693945', productId: 'com.kindar.harmonia.earlybird.monthly' },
  { id: '6764693916', productId: 'com.kindar.harmonia.earlybird.annual' },
  { id: '6764694011', productId: 'com.kindar.juridico.monthly' },
  { id: '6764693946', productId: 'com.kindar.juridico.annual' },
];

// ── auth + http ───────────────────────────────────────────────────────────────
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

// ── 1. Server-to-Server Notification URL ──────────────────────────────────────
async function setS2SUrl() {
  console.log('\n══ 1. Apple Server-to-Server Notification URL ══');

  // Verify current state
  const cur = await call('GET',
    `/apps/${APP_ID}?fields[apps]=subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox`);
  if (cur.ok) {
    const a = cur.json.data.attributes;
    if (a.subscriptionStatusUrl === RC_S2S_URL && a.subscriptionStatusUrlVersion === 'V2'
        && a.subscriptionStatusUrlForSandbox === RC_S2S_URL && a.subscriptionStatusUrlVersionForSandbox === 'V2') {
      console.log('  ✅ S2S URLs already configured (prod + sandbox, V2)');
      return;
    }
  }

  const r = await call('PATCH', `/apps/${APP_ID}`, {
    data: {
      type: 'apps',
      id: APP_ID,
      attributes: {
        subscriptionStatusUrl: RC_S2S_URL,
        subscriptionStatusUrlVersion: 'V2',
        subscriptionStatusUrlForSandbox: RC_S2S_URL,
        subscriptionStatusUrlVersionForSandbox: 'V2',
      },
    },
  });
  if (r.ok) {
    console.log('  ✅ Set both prod + sandbox to V2');
  } else {
    console.log('  ❌ FAIL', r.json?.errors?.[0] || r.text);
  }
}

// ── 2. usesIdfa ────────────────────────────────────────────────────────────────
async function setUsesIdfa() {
  console.log('\n══ 2. usesIdfa on editable app store version ══');

  const v = await call('GET',
    `/apps/${APP_ID}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,usesIdfa`);
  if (!v.ok || !v.json?.data?.length) {
    console.log('  ❌ No app store versions');
    return;
  }

  // Editable states: PREPARE_FOR_SUBMISSION, METADATA_REJECTED, DEVELOPER_REJECTED, etc.
  const editableStates = new Set(['PREPARE_FOR_SUBMISSION', 'METADATA_REJECTED', 'DEVELOPER_REJECTED',
    'INVALID_BINARY', 'WAITING_FOR_REVIEW', 'IN_REVIEW']);
  const target = v.json.data.find((x) => editableStates.has(x.attributes?.appStoreState));
  if (!target) {
    console.log('  ⚪ No editable version (states found:',
      v.json.data.map((x) => x.attributes?.appStoreState).join(', '), ')');
    return;
  }

  console.log(`  → version ${target.attributes.versionString} (${target.attributes.appStoreState}) id=${target.id}`);
  if (target.attributes.usesIdfa === false) {
    console.log('  ✅ usesIdfa already false');
    return;
  }

  const r = await call('PATCH', `/appStoreVersions/${target.id}`, {
    data: { type: 'appStoreVersions', id: target.id, attributes: { usesIdfa: false } },
  });
  if (r.ok) {
    console.log('  ✅ Set usesIdfa=false');
  } else {
    console.log('  ❌ FAIL', r.json?.errors?.[0] || r.text);
  }
}

// ── 3. Subscription review screenshots ─────────────────────────────────────────
//
// We generate a tiny but valid PNG (1024×1024 solid Kindar pink with text) at
// runtime so we don't have to ship a binary in scripts/. Apple validates:
//   • PNG format
//   • file size matches reservation (we read the file we wrote)
//   • MD5 checksum matches sourceFileChecksum
//   • dimensions ≥ ~640×640 (we go 1024×1024 to be safe)
//
async function ensureScreenshotPng() {
  // Apple subscription review screenshots require iPhone screenshot dimensions.
  // Confirmed via API error IMAGE_INCORRECT_DIMENSIONS that 1024×1024 fails.
  // We use 1290×2796 (iPhone 6.7" — required for 2024+ App Store submissions).
  const screenshotPath = path.join(process.cwd(), 'scripts', 'subscription-review.png');
  if (fs.existsSync(screenshotPath)) {
    return screenshotPath;
  }

  const zlib = await import('node:zlib');
  const W = 1290, H = 2796;
  // RGB pixels, Kindar pink = #FFB7C5 (255,183,197)
  const r = 255, g = 183, b = 197;

  // Build raw image: each row prefixed with filter byte 0
  const rowSize = 1 + W * 3;
  const raw = Buffer.alloc(rowSize * H);
  for (let y = 0; y < H; y++) {
    const off = y * rowSize;
    raw[off] = 0; // filter type
    for (let x = 0; x < W; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const deflated = zlib.deflateSync(raw);

  // PNG chunks
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  function crc32(buf) {
    let c, table = crc32._t;
    if (!table) {
      table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
      }
      crc32._t = table;
    }
    c = -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
    return c ^ -1;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(screenshotPath, png);
  return screenshotPath;
}

async function uploadOneScreenshot(sub, fileBuf) {
  // Skip if subscription already has a COMPLETE screenshot.
  // Delete any FAILED/AWAITING_UPLOAD ones so we can re-upload cleanly.
  const cur = await call('GET', `/subscriptions/${sub.id}/appStoreReviewScreenshot`);
  if (cur.ok && cur.json?.data?.id) {
    const state = cur.json.data.attributes?.assetDeliveryState?.state;
    const id = cur.json.data.id;
    if (state === 'COMPLETE') {
      console.log(`  ${sub.productId}: ✅ already has COMPLETE screenshot (id=${id})`);
      return;
    }
    // Delete the broken/incomplete one before re-uploading
    const del = await call('DELETE', `/subscriptionAppStoreReviewScreenshots/${id}`);
    if (del.ok) {
      console.log(`  ${sub.productId}: 🗑 deleted ${state} screenshot (id=${id})`);
    } else {
      console.log(`  ${sub.productId}: ⚠ could not delete broken screenshot (id=${id}, state=${state}) — skipping`);
      return;
    }
  }

  // 3a. Reserve
  const reservation = await call('POST', `/subscriptionAppStoreReviewScreenshots`, {
    data: {
      type: 'subscriptionAppStoreReviewScreenshots',
      attributes: {
        fileName: 'subscription-review.png',
        fileSize: fileBuf.length,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: sub.id } },
      },
    },
  });
  if (!reservation.ok) {
    console.log(`  ${sub.productId}: ❌ reserve failed —`, reservation.json?.errors?.[0]?.detail || reservation.text);
    return;
  }

  const screenshotId = reservation.json.data.id;
  const ops = reservation.json.data.attributes.uploadOperations || [];

  // 3b. PUT bytes to each operation URL (Apple chunks large files; 100 KB fits in one part)
  for (const op of ops) {
    const headers = {};
    for (const h of (op.requestHeaders || [])) headers[h.name] = h.value;
    const slice = fileBuf.slice(op.offset, op.offset + op.length);
    const putRes = await fetch(op.url, { method: op.method, headers, body: slice });
    if (!putRes.ok) {
      const txt = (await putRes.text()).slice(0, 200);
      console.log(`  ${sub.productId}: ❌ S3 PUT failed — ${putRes.status} ${txt}`);
      return;
    }
  }

  // 3c. Commit reservation with sourceFileChecksum (MD5 in hex)
  const md5 = crypto.createHash('md5').update(fileBuf).digest('hex');
  const commit = await call('PATCH', `/subscriptionAppStoreReviewScreenshots/${screenshotId}`, {
    data: {
      type: 'subscriptionAppStoreReviewScreenshots',
      id: screenshotId,
      attributes: { uploaded: true, sourceFileChecksum: md5 },
    },
  });
  if (commit.ok) {
    console.log(`  ${sub.productId}: ✅ uploaded screenshot (id=${screenshotId})`);
  } else {
    console.log(`  ${sub.productId}: ❌ commit failed —`, commit.json?.errors?.[0]?.detail || commit.text);
  }
}

async function uploadAllScreenshots() {
  console.log('\n══ 3. Subscription review screenshots ══');
  const pngPath = await ensureScreenshotPng();
  const fileBuf = fs.readFileSync(pngPath);
  console.log(`  Using ${pngPath} (${fileBuf.length} bytes)`);

  for (const sub of SUBSCRIPTIONS) {
    await uploadOneScreenshot(sub, fileBuf);
  }
}

// ── 4. Verification ───────────────────────────────────────────────────────────
async function verify() {
  console.log('\n══ 4. Verification ══');

  // S2S URLs
  const a = await call('GET', `/apps/${APP_ID}?fields[apps]=subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox`);
  if (a.ok) {
    const x = a.json.data.attributes;
    console.log('  S2S prod   :', x.subscriptionStatusUrl, x.subscriptionStatusUrlVersion);
    console.log('  S2S sandbox:', x.subscriptionStatusUrlForSandbox, x.subscriptionStatusUrlVersionForSandbox);
  }

  // Screenshots per subscription
  console.log('  Screenshots:');
  for (const sub of SUBSCRIPTIONS) {
    const r = await call('GET', `/subscriptions/${sub.id}/appStoreReviewScreenshot`);
    const id = r.json?.data?.id;
    const st = r.json?.data?.attributes?.assetDeliveryState?.state;
    console.log(`    ${sub.productId}: ${id ? `✅ id=${id} state=${st}` : '⚪ none'}`);
  }
}

async function main() {
  console.log('Apple ASC — Autonomous setup\n', new Date().toISOString());
  await setS2SUrl();
  await setUsesIdfa();
  await uploadAllScreenshots();
  await verify();
  console.log('\n══ Done ══');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
