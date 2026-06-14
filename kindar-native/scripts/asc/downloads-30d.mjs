#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const ASC_KEY_PATH = process.env.ASC_KEY_PATH || resolve(PROJECT_ROOT, '../AuthKey.p8');
const ASC_KEY_ID = process.env.ASC_KEY_ID || '736GBBC4YY';
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const ASC_VENDOR = process.env.ASC_VENDOR_NUMBER || '94182024';
const KINDAR_APPLE_ID = '6762701916';
const API = 'https://api.appstoreconnect.apple.com/v1';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const signer = createSign('SHA256');
  signer.update(`${h}.${p}`); signer.end();
  return `${h}.${p}.${b64url(signer.sign({ key: readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
const TOKEN = jwt();

async function fetchSalesReportTsv(dateStr) {
  const url = `${API}/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${ASC_VENDOR}&filter[reportDate]=${dateStr}&filter[version]=1_1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/a-gzip' } });
  if (r.status === 404) return null;
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HTTP ${r.status} for ${dateStr}: ${t.slice(0, 500)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return gunzipSync(buf).toString('utf8');
}

function parseTsv(tsv) {
  const lines = tsv.split('\n').filter(Boolean);
  const header = lines[0].split('\t');
  const idx = (name) => header.indexOf(name);
  const iCountry = idx('Country Code');
  const iUnits = idx('Units');
  const iPti = idx('Product Type Identifier');
  const iApple = idx('Apple Identifier');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    rows.push({
      country: c[iCountry],
      units: parseInt(c[iUnits] || '0', 10),
      pti: c[iPti],
      appleId: c[iApple],
    });
  }
  return rows;
}

// Product Type Identifiers para "first download" iOS:
//   1 = iPhone (Free/Paid), 1F = Universal, 1T = iPad, 1E = iPhone (subscription)
// Updates começam com 7.
// IAPs começam com IA. Excluir ambos.
const INSTALL_PTIS = new Set(['1', '1F', '1T', '1E', '1EP', '1EU', '1TP', '1FB', '1B']);

function summarizeBR(rows) {
  const summary = { downloads_br: 0, updates_br: 0, total_br_units: 0, by_pti: {}, sample_other_country: 0 };
  for (const r of rows) {
    if (r.appleId !== KINDAR_APPLE_ID) continue;
    if (r.country === 'BR') {
      summary.total_br_units += r.units;
      summary.by_pti[r.pti] = (summary.by_pti[r.pti] || 0) + r.units;
      if (INSTALL_PTIS.has(r.pti)) summary.downloads_br += r.units;
      else if (r.pti && r.pti.startsWith('7')) summary.updates_br += r.units;
    } else {
      summary.sample_other_country += r.units;
    }
  }
  return summary;
}

function* eachDay(start, end) {
  const d = new Date(start + 'T00:00:00Z');
  const stop = new Date(end + 'T00:00:00Z');
  while (d <= stop) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

async function main() {
  const start = process.env.START_DATE || '2026-04-28';
  const end = process.env.END_DATE || '2026-05-27'; // hoje (28) ainda nao disponivel
  console.log(`Vendor=${ASC_VENDOR} App=${KINDAR_APPLE_ID} ${start} -> ${end}\n`);
  console.log('Data       | downloads_BR | updates_BR | outros_BR | other_countries | PTIs');
  console.log('-----------|--------------|------------|-----------|-----------------|-----');
  const out = {};
  let totalDl = 0, totalUpd = 0, totalOther = 0;
  for (const day of eachDay(start, end)) {
    try {
      const tsv = await fetchSalesReportTsv(day);
      if (!tsv) {
        console.log(`${day} | (sem dados / 404)`);
        out[day] = { downloads_br: 0, _missing: true };
        continue;
      }
      const rows = parseTsv(tsv);
      const s = summarizeBR(rows);
      totalDl += s.downloads_br;
      totalUpd += s.updates_br;
      totalOther += s.sample_other_country;
      const other = s.total_br_units - s.downloads_br - s.updates_br;
      const ptis = Object.entries(s.by_pti).map(([k, v]) => `${k}:${v}`).join(',');
      console.log(`${day} | ${String(s.downloads_br).padStart(12)} | ${String(s.updates_br).padStart(10)} | ${String(other).padStart(9)} | ${String(s.sample_other_country).padStart(15)} | ${ptis}`);
      out[day] = s;
    } catch (e) {
      console.log(`${day} | ERR: ${e.message}`);
      out[day] = { _error: e.message };
    }
  }
  console.log(`-----------|--------------|------------|-----------|-----------------|`);
  console.log(`TOTAL      | ${String(totalDl).padStart(12)} | ${String(totalUpd).padStart(10)} |           | ${String(totalOther).padStart(15)} |`);
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
