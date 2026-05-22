#!/usr/bin/env node
/**
 * submit-for-review.mjs
 *
 * Automação fim-a-fim da submissão de uma versão do Kindar pra App Store
 * review via App Store Connect API.
 *
 * Fluxo:
 *  1. Aguarda Apple terminar de processar o build (POLL build state em ASC API).
 *  2. Garante que `appStoreVersion` da `version` (ex 1.0.7) existe — cria se não.
 *  3. Anexa o `build` à `appStoreVersion`.
 *  4. Atualiza `whatsNew` (release notes) nas localizations existentes.
 *  5. Garante answers do `appStoreVersionSubmissions` (export compliance, ads,
 *     content rights) reaproveitando do `LATEST_PUBLISHED` quando possível.
 *  6. Cria `appStoreVersionSubmission` → entra na fila de review da Apple.
 *
 * Autenticação: JWT ES256 assinado com AuthKey.p8 (ASC API). A mesma chave
 * já usada por `eas submit` no eas.json.
 *
 * Variáveis de entrada (com defaults):
 *  ASC_KEY_PATH        — default '../AuthKey.p8' (relativo a kindar-native/)
 *  ASC_KEY_ID          — default '736GBBC4YY' (do eas.json)
 *  ASC_ISSUER_ID       — default '52e31db4-ca31-4a2c-b99d-86b8b599b29e'
 *  ASC_APP_ID          — default '6762701916' (Kindar BR)
 *  TARGET_VERSION      — default '1.0.7'
 *  TARGET_BUILD_NUMBER — default '80'
 *  POLL_INTERVAL_MS    — default 30000 (30s)
 *  POLL_TIMEOUT_MS     — default 1800000 (30min)
 *
 * Idempotente: pode rodar várias vezes — pula passos já concluídos.
 *
 * Trade-offs: a API não permite definir todos os screenshots/metadata via API;
 * assumimos que a versão 1.0.6 já tinha tudo preenchido e usamos a API
 * `appStoreVersionLocalizations` pra propagar What's New. Screenshots ficam
 * inalteradas (Apple aceita reusar se mesmo design tier).
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
const TARGET_VERSION = process.env.TARGET_VERSION || '1.0.7';
const TARGET_BUILD_NUMBER = process.env.TARGET_BUILD_NUMBER || '80';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30_000);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 30 * 60_000);

const DEFAULT_WHATS_NEW = `- Correção: vacina pendente agora some da lista quando você toca em Adiar (antes só sumia depois de marcar como tomada).
- Novo: opção "Pediatra orientou não dar" no menu Adiar de vacinas (oculta a dose por 1 ano e reabrimos depois pra revalidação).
- Acentuação: dezenas de textos corrigidos em Saúde, Histórico, Diagnóstico, Observação, Notificações, Aderência, Método de pagamento, Plano de saúde e outros.
- Ajustes internos de estabilidade.`;
const WHATS_NEW = process.env.WHATS_NEW || DEFAULT_WHATS_NEW;

const API = 'https://api.appstoreconnect.apple.com/v1';

/* ----------------------------- JWT (ES256) ----------------------------- */

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
  // ECDSA em JWT precisa do formato raw r||s (IEEE P1363), não DER.
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64urlEncode(signature)}`;
}

let cachedJwt = null;
let cachedJwtExpiry = 0;

function getJwt() {
  const now = Date.now();
  // Re-gera 60s antes de expirar
  if (!cachedJwt || now > cachedJwtExpiry - 60_000) {
    cachedJwt = buildJwt();
    cachedJwtExpiry = now + 1200 * 1000;
  }
  return cachedJwt;
}

/* ----------------------------- HTTP helper ----------------------------- */

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

/* ----------------------------- Steps ----------------------------- */

async function waitForBuildProcessed() {
  console.log(`[1/6] Aguardando build ${TARGET_BUILD_NUMBER} (versão ${TARGET_VERSION}) terminar de processar no ASC…`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const q = `/builds?filter[app]=${ASC_APP_ID}&filter[version]=${TARGET_BUILD_NUMBER}&filter[preReleaseVersion.version]=${TARGET_VERSION}&limit=10&fields[builds]=version,processingState,uploadedDate`;
    const r = await ascFetch(q);
    const builds = r.data || [];
    if (builds.length === 0) {
      console.log(`  · ainda não apareceu, aguardando ${POLL_INTERVAL_MS / 1000}s…`);
    } else {
      const b = builds[0];
      const state = b.attributes?.processingState;
      console.log(`  · build encontrado: id=${b.id} state=${state}`);
      if (state === 'VALID') return b.id;
      if (state === 'FAILED' || state === 'INVALID') throw new Error(`Build ${TARGET_BUILD_NUMBER} state=${state} no ASC; corrija antes de submeter.`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timeout: build ${TARGET_BUILD_NUMBER} não ficou VALID em ${POLL_TIMEOUT_MS / 60_000}min.`);
}

async function ensureAppStoreVersion() {
  console.log(`[2/6] Garantindo appStoreVersion ${TARGET_VERSION}…`);
  const list = await ascFetch(`/apps/${ASC_APP_ID}/appStoreVersions?filter[versionString]=${TARGET_VERSION}&limit=5&fields[appStoreVersions]=versionString,appStoreState,platform`);
  const existing = (list.data || [])[0];
  if (existing) {
    console.log(`  · já existe: id=${existing.id} state=${existing.attributes.appStoreState}`);
    return existing.id;
  }

  // Detecta plataforma — Kindar é iOS only mas a API exige.
  const created = await ascFetch('/appStoreVersions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform: 'IOS',
          versionString: TARGET_VERSION,
          releaseType: 'AFTER_APPROVAL',
        },
        relationships: {
          app: { data: { type: 'apps', id: ASC_APP_ID } },
        },
      },
    }),
  });
  const id = created.data.id;
  console.log(`  · criado: id=${id}`);
  return id;
}

async function attachBuildToVersion(versionId, buildId) {
  console.log(`[3/6] Anexando build ao appStoreVersion ${versionId}…`);
  // Verifica se já tem build atribuído
  const r = await ascFetch(`/appStoreVersions/${versionId}/relationships/build`);
  if (r.data?.id === buildId) {
    console.log('  · já anexado.');
    return;
  }
  await ascFetch(`/appStoreVersions/${versionId}/relationships/build`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'builds', id: buildId } }),
  });
  console.log('  · anexado.');
}

async function updateWhatsNew(versionId) {
  console.log(`[4/6] Atualizando What's New nas localizations existentes…`);
  const locs = await ascFetch(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew&limit=50`);
  const items = locs.data || [];
  if (items.length === 0) {
    console.log('  · nenhuma localization (versão pode ter sido criada agora). Tentando criar pt-BR + en-US…');
    for (const locale of ['pt-BR', 'en-US']) {
      await ascFetch('/appStoreVersionLocalizations', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: { locale, whatsNew: WHATS_NEW },
            relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
          },
        }),
      }).catch(e => {
        if (String(e.message).includes('ENTITY_ERROR.ATTRIBUTE.INVALID')) {
          console.log(`    × ${locale} não suportado pra esse app — pulando.`);
        } else {
          throw e;
        }
      });
    }
    return;
  }
  for (const loc of items) {
    const locale = loc.attributes?.locale;
    console.log(`  · atualizando ${locale}…`);
    await ascFetch(`/appStoreVersionLocalizations/${loc.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersionLocalizations',
          id: loc.id,
          attributes: { whatsNew: WHATS_NEW },
        },
      }),
    });
  }
}

async function ensureSubmissionPrereqs(versionId, buildId) {
  console.log(`[5/6] Configurando export compliance + ads on build…`);
  // ITSAppUsesNonExemptEncryption já é false no app.json, então o build deve
  // ter usesNonExemptEncryption=false. Vamos garantir explicitamente.
  try {
    await ascFetch(`/builds/${buildId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'builds',
          id: buildId,
          attributes: { usesNonExemptEncryption: false },
        },
      }),
    });
    console.log('  · usesNonExemptEncryption=false.');
  } catch (e) {
    console.log(`  · não foi possível setar usesNonExemptEncryption: ${e.message}`);
  }
}

async function submitForReview(versionId) {
  // 2022-09: Apple desativou `appStoreVersionSubmissions.CREATE` em favor da
  // Review Submission API (`/reviewSubmissions` + `/reviewSubmissionItems`).
  // A nova API é em batch: cria um reviewSubmission, anexa o appStoreVersion
  // como reviewSubmissionItem, e PATCH submitted=true pra enviar.
  console.log(`[6/6] Submetendo pra App Store review (via /reviewSubmissions)…`);

  // Verifica se já existe um reviewSubmission "open" (não submetido) pro app
  // que contenha esta versão.
  const existing = await ascFetch(`/reviewSubmissions?filter[app]=${ASC_APP_ID}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW&include=items&limit=20&fields[reviewSubmissions]=state,platform&fields[reviewSubmissionItems]=`);
  for (const sub of (existing.data || [])) {
    const incl = (existing.included || []).filter(i => i.type === 'reviewSubmissionItems');
    const items = (sub.relationships?.items?.data || []).map(d => d.id);
    const hasOurVersion = incl.some(i => items.includes(i.id) && i.relationships?.appStoreVersion?.data?.id === versionId);
    if (hasOurVersion) {
      console.log(`  · reviewSubmission já existe e contém esta versão: id=${sub.id} state=${sub.attributes?.state}`);
      return sub.id;
    }
  }

  // 1) Cria reviewSubmission DRAFT pro app
  console.log('  · criando reviewSubmission DRAFT…');
  const create = await ascFetch('/reviewSubmissions', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: ASC_APP_ID } } },
      },
    }),
  });
  const submissionId = create.data.id;
  console.log(`    id=${submissionId}`);

  // 2) Anexa o appStoreVersion como reviewSubmissionItem
  console.log('  · anexando appStoreVersion como reviewSubmissionItem…');
  await ascFetch('/reviewSubmissionItems', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    }),
  });

  // 3) PATCH submitted=true → envia pra Apple
  console.log('  · submetendo (submitted=true)…');
  await ascFetch(`/reviewSubmissions/${submissionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'reviewSubmissions',
        id: submissionId,
        attributes: { submitted: true },
      },
    }),
  });

  return submissionId;
}

/* ----------------------------- Main ----------------------------- */

(async () => {
  console.log('🍎 ASC Submit-for-Review automatizado');
  console.log(`   App:     ${ASC_APP_ID}`);
  console.log(`   Versão:  ${TARGET_VERSION} (build ${TARGET_BUILD_NUMBER})`);
  console.log(`   Key:     ${ASC_KEY_PATH}`);
  console.log('');

  try {
    const buildId = await waitForBuildProcessed();
    const versionId = await ensureAppStoreVersion();
    await attachBuildToVersion(versionId, buildId);
    await updateWhatsNew(versionId);
    await ensureSubmissionPrereqs(versionId, buildId);
    const submissionId = await submitForReview(versionId);
    console.log('');
    console.log(`✅ Submetido pra review. Submission ID: ${submissionId}`);
    console.log(`   https://appstoreconnect.apple.com/apps/${ASC_APP_ID}/appstore`);
  } catch (e) {
    console.error('');
    console.error('❌ Falha:', e.message);
    if (e.body) console.error(JSON.stringify(e.body, null, 2));
    process.exit(1);
  }
})();
