#!/usr/bin/env node
/**
 * status-check.mjs
 *
 * Snapshot do estado atual do app no App Store Connect:
 *  - Review submissions (todas + estado)
 *  - App Store versions (todas + estado)
 *  - Builds recentes + processingState + validation issues
 *  - App Info issues
 *
 * Read-only — só GETs.
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
  const signingInput = `${base64urlEncode(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))}.${base64urlEncode(JSON.stringify({ iss: ASC_ISSUER_ID, exp: now + 1200, aud: 'appstoreconnect-v1' }))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64urlEncode(signer.sign({ key: readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' }))}`;
}
let jwt; function getJwt() { return jwt ||= buildJwt(); }
async function ascFetch(path) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${getJwt()}`, Accept: 'application/json' } });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    return { error: body, status: r.status };
  }
  return body;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   📦 Kindar (com.kindar.app) — Status no App Store Connect');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Review submissions
  console.log('▼ REVIEW SUBMISSIONS (últimas 10)');
  const subs = await ascFetch(`/reviewSubmissions?filter[app]=${ASC_APP_ID}&limit=10`);
  for (const s of (subs.data || []).slice(0, 10)) {
    const state = s.attributes?.state || '?';
    const submitted = fmtDate(s.attributes?.submittedDate);
    console.log(`  ${state.padEnd(22)} submitted=${submitted}  id=${s.id}`);
  }

  // 2. App Store Versions
  console.log('\n▼ APP STORE VERSIONS (recentes)');
  const versions = await ascFetch(`/apps/${ASC_APP_ID}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate`);
  for (const v of (versions.data || [])) {
    const state = v.attributes?.appStoreState || '?';
    console.log(`  ${v.attributes.versionString.padEnd(8)} ${state.padEnd(28)} id=${v.id}`);
  }

  // 3. Builds recentes (filter por preReleaseVersion pra Kindar mais recente)
  console.log('\n▼ BUILDS RECENTES');
  const builds = await ascFetch(`/builds?filter[app]=${ASC_APP_ID}&limit=10&fields[builds]=version,processingState,uploadedDate,expired,expirationDate`);
  for (const b of (builds.data || [])) {
    const state = b.attributes?.processingState || '?';
    const uploaded = fmtDate(b.attributes?.uploadedDate);
    const expired = b.attributes?.expired ? ' [EXPIRED]' : '';
    console.log(`  build ${String(b.attributes.version).padEnd(4)} ${state.padEnd(12)} uploaded=${uploaded}${expired}`);
  }

  // 4. Itens da reviewSubmission ativa
  console.log('\n▼ ITENS DA REVIEW SUBMISSION ATIVA');
  const activeSub = (subs.data || []).find(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(s.attributes?.state));
  if (!activeSub) {
    console.log('  (nenhuma submission ativa)');
  } else {
    console.log(`  Submission: ${activeSub.id} (${activeSub.attributes.state})`);
    const items = await ascFetch(`/reviewSubmissions/${activeSub.id}/items`);
    for (const it of (items.data || [])) {
      console.log(`    item type=${it.type} id=${it.id}`);
    }
    const itemsExpanded = await ascFetch(`/reviewSubmissions/${activeSub.id}/items?include=appStoreVersion`);
    for (const inc of (itemsExpanded.included || [])) {
      if (inc.type === 'appStoreVersions') {
        console.log(`    → version: ${inc.attributes?.versionString} (state=${inc.attributes?.appStoreState})`);
      }
    }
  }

  // 5. App info issues / metadata
  console.log('\n▼ APP INFO (problemas potenciais)');
  const info = await ascFetch(`/apps/${ASC_APP_ID}?fields[apps]=bundleId,name,sku,primaryLocale`);
  if (info.data) {
    console.log(`  Bundle: ${info.data.attributes?.bundleId}`);
    console.log(`  Locale: ${info.data.attributes?.primaryLocale}`);
  }

  // 6. Last build VALID e pendências
  console.log('\n▼ BUILD MAIS RECENTE — INFO DETALHADA');
  const latestBuild = (builds.data || [])[0];
  if (latestBuild) {
    console.log(`  build ${latestBuild.attributes.version} id=${latestBuild.id} state=${latestBuild.attributes.processingState}`);
    // Issues / app encryption
    const beta = await ascFetch(`/builds/${latestBuild.id}?fields[builds]=usesNonExemptEncryption,iconAssetToken,minOsVersion&include=buildBundles`);
    if (beta.data) {
      console.log(`  usesNonExemptEncryption=${beta.data.attributes?.usesNonExemptEncryption}`);
      console.log(`  minOsVersion=${beta.data.attributes?.minOsVersion}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
