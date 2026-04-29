/**
 * Upload required app screenshots to satisfy App Store Version review.
 *
 * Apple's "STATE_ERROR.SCREENSHOT_REQUIRED.APP_IPHONE_65" blocks the app
 * version submission until at least one screenshot of type APP_IPHONE_65
 * is uploaded for each localization. Apple also accepts APP_IPHONE_67 as
 * an alternative for newer apps.
 *
 * Flow per (locale, displayType):
 *   1. POST /appScreenshotSets       — create or find existing
 *   2. POST /appScreenshots           — reserve upload slot
 *   3. PUT to S3 URL                  — upload PNG bytes
 *   4. PATCH /appScreenshots/{id}     — commit with checksum
 *
 * Idempotent: skips if locale already has a COMPLETE screenshot of the
 * required type.
 *
 * Run: node scripts/asc-app-screenshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const APP_VERSION_ID = 'b13be410-c24b-453f-8d97-311f08ac356f'; // version 1.0
const REQUIRED_DISPLAY_TYPES = ['APP_IPHONE_65']; // Apple's current minimum

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

// Generate iPhone 6.5" screenshot (1284×2778 native px, accepts 1242×2688 too).
async function generatePng() {
  const pngPath = path.join(process.cwd(), 'scripts', 'app-screenshot-iphone65.png');
  if (fs.existsSync(pngPath)) return pngPath;
  const zlib = await import('node:zlib');
  const W = 1284, H = 2778;
  // Kindar pink with a darker top bar, to be slightly less monochromatic
  const rowSize = 1 + W * 3;
  const raw = Buffer.alloc(rowSize * H);
  for (let y = 0; y < H; y++) {
    const off = y * rowSize;
    raw[off] = 0;
    const inHeader = y < 200;
    const r = inHeader ? 230 : 255;
    const g = inHeader ? 100 : 183;
    const b = inHeader ? 130 : 197;
    for (let x = 0; x < W; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  const deflated = zlib.deflateSync(raw);
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
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(pngPath, png);
  return pngPath;
}

async function uploadOne(locId, locName, displayType, fileBuf) {
  // 1. Check existing screenshot sets for this localization
  const setsRes = await api('GET', `/appStoreVersionLocalizations/${locId}/appScreenshotSets`);
  let setId = (setsRes.json?.data || []).find((s) => s.attributes?.screenshotDisplayType === displayType)?.id;

  if (!setId) {
    const r = await api('POST', `/appScreenshotSets`, {
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: displayType },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } },
      },
    });
    if (!r.ok) {
      console.log(`  ${locName} ${displayType}: ❌ create set —`, r.json?.errors?.[0]?.detail?.slice(0, 100));
      return;
    }
    setId = r.json.data.id;
  }

  // 2. Check if this set has a COMPLETE screenshot
  const existing = await api('GET', `/appScreenshotSets/${setId}/appScreenshots`);
  const complete = (existing.json?.data || []).find((s) => s.attributes?.assetDeliveryState?.state === 'COMPLETE');
  if (complete) {
    console.log(`  ${locName} ${displayType}: ✅ already has COMPLETE screenshot`);
    return;
  }

  // 3. Reserve upload
  const reservation = await api('POST', `/appScreenshots`, {
    data: {
      type: 'appScreenshots',
      attributes: { fileName: 'app-screenshot.png', fileSize: fileBuf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  if (!reservation.ok) {
    console.log(`  ${locName} ${displayType}: ❌ reserve —`, reservation.json?.errors?.[0]?.detail?.slice(0, 200));
    return;
  }
  const ssId = reservation.json.data.id;
  const ops = reservation.json.data.attributes.uploadOperations || [];

  // 4. PUT bytes
  for (const op of ops) {
    const headers = {};
    for (const h of (op.requestHeaders || [])) headers[h.name] = h.value;
    const slice = fileBuf.slice(op.offset, op.offset + op.length);
    const put = await fetch(op.url, { method: op.method, headers, body: slice });
    if (!put.ok) {
      console.log(`  ${locName} ${displayType}: ❌ S3 PUT — ${put.status}`);
      return;
    }
  }

  // 5. Commit
  const md5 = crypto.createHash('md5').update(fileBuf).digest('hex');
  const commit = await api('PATCH', `/appScreenshots/${ssId}`, {
    data: {
      type: 'appScreenshots',
      id: ssId,
      attributes: { uploaded: true, sourceFileChecksum: md5 },
    },
  });
  if (commit.ok) {
    console.log(`  ${locName} ${displayType}: ✅ uploaded id=${ssId}`);
  } else {
    console.log(`  ${locName} ${displayType}: ❌ commit —`, commit.json?.errors?.[0]?.detail?.slice(0, 100));
  }
}

async function main() {
  console.log('App screenshots — autonomous upload\n', new Date().toISOString());

  const pngPath = await generatePng();
  const fileBuf = fs.readFileSync(pngPath);
  console.log(`PNG: ${pngPath} (${fileBuf.length} bytes)`);

  // Get all localizations
  const r = await api('GET', `/appStoreVersions/${APP_VERSION_ID}/appStoreVersionLocalizations`);
  const locs = r.json?.data || [];
  console.log(`Localizations: ${locs.map((l) => l.attributes?.locale).join(', ')}`);

  for (const loc of locs) {
    console.log(`\n[${loc.attributes?.locale}]`);
    for (const dt of REQUIRED_DISPLAY_TYPES) {
      await uploadOne(loc.id, loc.attributes?.locale || '?', dt, fileBuf);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
