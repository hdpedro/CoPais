/**
 * Upload Canva-generated App Store screenshots to ASC.
 *
 * Reads 5 PNG files from C:\Users\henri\OneDrive\Área de Trabalho\APP CoPais\AppleStore_Artes\
 * and uploads them as APP_IPHONE_67 (1290×2796) screenshots to both
 * pt-BR and en-US localizations of app version 1.0.
 *
 * Replaces any existing screenshot set / individual screenshot at
 * those slots — idempotent.
 *
 * Run: node scripts/asc-upload-canva-screenshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const APP_VERSION_ID = 'b13be410-c24b-453f-8d97-311f08ac356f';
const DISPLAY_TYPE = 'APP_IPHONE_67'; // 1290×2796
const ARTES_DIR = 'C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/AppleStore_Artes';

const SCREENSHOTS = [
  '03_Screenshot_1_Hero.png',
  '04_Screenshot_2_Calendario.png',
  '05_Screenshot_3_Coordenacao.png',
  '06_Screenshot_4_Saude.png',
  '07_Screenshot_5_Despesas.png',
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
  let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, ok: r.ok, json: j, text: t };
}

async function findOrCreateSet(locId, displayType) {
  const list = await api('GET', `/appStoreVersionLocalizations/${locId}/appScreenshotSets`);
  const existing = (list.json?.data || []).find((s) => s.attributes?.screenshotDisplayType === displayType);
  if (existing) return existing.id;
  const r = await api('POST', '/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } },
    },
  });
  if (!r.ok) throw new Error('Cant create set: ' + JSON.stringify(r.json));
  return r.json.data.id;
}

async function deleteAllInSet(setId) {
  const list = await api('GET', `/appScreenshotSets/${setId}/appScreenshots`);
  for (const ss of (list.json?.data || [])) {
    const d = await api('DELETE', `/appScreenshots/${ss.id}`);
    console.log(`    deleted ${ss.id} (${d.status})`);
  }
}

async function uploadOne(setId, fileName, fileBuf) {
  // Reserve
  const reservation = await api('POST', '/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize: fileBuf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  if (!reservation.ok) {
    console.log('    ✗ reserve failed:', reservation.json?.errors?.[0]?.detail || reservation.text.slice(0, 200));
    return null;
  }
  const ssId = reservation.json.data.id;
  const ops = reservation.json.data.attributes.uploadOperations || [];

  for (const op of ops) {
    const headers = {};
    for (const h of (op.requestHeaders || [])) headers[h.name] = h.value;
    const slice = fileBuf.slice(op.offset, op.offset + op.length);
    const put = await fetch(op.url, { method: op.method, headers, body: slice });
    if (!put.ok) {
      console.log(`    ✗ S3 PUT failed: ${put.status}`);
      return null;
    }
  }

  const md5 = crypto.createHash('md5').update(fileBuf).digest('hex');
  const commit = await api('PATCH', `/appScreenshots/${ssId}`, {
    data: { type: 'appScreenshots', id: ssId, attributes: { uploaded: true, sourceFileChecksum: md5 } },
  });
  if (!commit.ok) {
    console.log('    ✗ commit failed:', commit.json?.errors?.[0]?.detail);
    return null;
  }
  return ssId;
}

async function main() {
  console.log('Apple ASC — Canva screenshots upload\n', new Date().toISOString());

  // Read all 5 PNGs first
  const files = SCREENSHOTS.map((f) => ({
    name: f,
    buf: fs.readFileSync(path.join(ARTES_DIR, f)),
  }));
  console.log('Files loaded:');
  for (const f of files) console.log(`  ${f.name}: ${f.buf.length} bytes`);

  // Get all version localizations
  const locsRes = await api('GET', `/appStoreVersions/${APP_VERSION_ID}/appStoreVersionLocalizations`);
  const locs = locsRes.json?.data || [];

  for (const loc of locs) {
    const localeName = loc.attributes?.locale || '?';
    console.log(`\n[${localeName}]`);

    // Also find old IPHONE_65 set with placeholder screenshot; remove
    const oldSets = await api('GET', `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    for (const s of (oldSets.json?.data || [])) {
      if (s.attributes?.screenshotDisplayType === 'APP_IPHONE_65') {
        console.log(`  removing old IPHONE_65 set ${s.id} (placeholder)`);
        await deleteAllInSet(s.id);
        await api('DELETE', `/appScreenshotSets/${s.id}`);
      }
    }

    // Get/create IPHONE_67 set, clear it
    const setId = await findOrCreateSet(loc.id, DISPLAY_TYPE);
    console.log(`  IPHONE_67 set: ${setId}`);
    await deleteAllInSet(setId);

    // Upload 5 screenshots in order
    for (const file of files) {
      console.log(`  uploading ${file.name}...`);
      const id = await uploadOne(setId, file.name, file.buf);
      if (id) console.log(`    ✓ ${id}`);
    }
  }

  // Final state report
  console.log('\nFinal state per locale:');
  for (const loc of locs) {
    const sets = await api('GET', `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots`);
    for (const s of (sets.json?.data || [])) {
      const ssIds = s.relationships?.appScreenshots?.data?.length || 0;
      console.log(`  ${loc.attributes?.locale} ${s.attributes?.screenshotDisplayType} → ${ssIds} screenshots`);
    }
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
