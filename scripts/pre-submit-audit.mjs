#!/usr/bin/env node
// ============================================================================
// Kindar — Pre-Submit Audit
// Valida condições obrigatórias ANTES de gastar minutos de EAS build.
// Falha fast se algo crítico estiver fora do lugar (Apple rejeitaria depois).
//
// Checks:
//   A. Web PWA: /termos, /privacidade, /pricing 200 + disclosure Apple 3.1.2(c)
//   B. kindar-native/app.json: ITSAppUsesNonExemptEncryption=false, bundle ID
//   C. ASC API: app existe, ao menos 1 subscription configurada
//
// Uso:
//   node scripts/pre-submit-audit.mjs
//   WEB_URL=https://kindar.com.br node scripts/pre-submit-audit.mjs
//
// Env:
//   WEB_URL (default: https://kindar.com.br)
//   ASC_PRIVATE_KEY + ASC_KEY_ID + ASC_ISSUER_ID (for ASC checks, opcional em dev local)
//
// Zero dependências — Node 18+ built-in fetch/crypto.
// ============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const C = { r: "\x1b[0m", R: "\x1b[31m", G: "\x1b[32m", Y: "\x1b[33m", B: "\x1b[34m", b: "\x1b[1m" };
const ok = (m) => console.log(`${C.G}[PASS]${C.r} ${m}`);
const fail = (m) => console.log(`${C.R}[FAIL]${C.r} ${m}`);
const warn = (m) => console.log(`${C.Y}[WARN]${C.r} ${m}`);
const section = (m) => console.log(`\n${C.b}${C.B}── ${m} ──${C.r}`);

let FAILED = 0;
let WARNED = 0;

const WEB_URL = (process.env.WEB_URL || "https://kindar.com.br").replace(/\/$/, "");
const BUNDLE_ID = "com.kindar.app";
const KEY_ID = process.env.ASC_KEY_ID || "736GBBC4YY";
const ISSUER_ID = process.env.ASC_ISSUER_ID || "52e31db4-ca31-4a2c-b99d-86b8b599b29e";

// ── A. Web checks ──────────────────────────────────────────────────────────
async function checkWebRoute(pathOnly, expectedSubstring = null) {
  const url = `${WEB_URL}${pathOnly}`;
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) {
      fail(`${pathOnly} → HTTP ${r.status}`);
      FAILED++;
      return;
    }
    if (expectedSubstring) {
      const body = await r.text();
      if (!body.includes(expectedSubstring)) {
        fail(`${pathOnly} → 200 OK mas não contém "${expectedSubstring}"`);
        FAILED++;
        return;
      }
    }
    ok(`${pathOnly}${expectedSubstring ? ` (contém "${expectedSubstring}")` : ""}`);
  } catch (e) {
    fail(`${pathOnly} → ${e.message}`);
    FAILED++;
  }
}

async function runWebChecks() {
  section(`A. Web PWA (${WEB_URL})`);
  await checkWebRoute("/termos");
  await checkWebRoute("/privacidade");
  await checkWebRoute("/pricing", "autorrenovavel");
}

// ── B. app.json checks ─────────────────────────────────────────────────────
function runNativeChecks() {
  section("B. kindar-native/app.json");

  const appJsonCandidates = [
    path.join(process.cwd(), "kindar-native", "app.json"),
    path.join(process.cwd(), "..", "kindar-native", "app.json"),
    path.join(process.cwd(), "app.json"),
  ];

  let appJsonPath = null;
  for (const p of appJsonCandidates) {
    if (fs.existsSync(p)) { appJsonPath = p; break; }
  }

  if (!appJsonPath) {
    fail("app.json não encontrado — procurou em kindar-native/app.json");
    FAILED++;
    return;
  }

  const cfg = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const ios = cfg.expo?.ios ?? {};

  if (ios.bundleIdentifier !== BUNDLE_ID) {
    fail(`bundleIdentifier = "${ios.bundleIdentifier}" (esperado "${BUNDLE_ID}")`);
    FAILED++;
  } else {
    ok(`bundleIdentifier = ${BUNDLE_ID}`);
  }

  const enc = ios.infoPlist?.ITSAppUsesNonExemptEncryption;
  if (enc !== false) {
    fail(`ITSAppUsesNonExemptEncryption = ${enc} (esperado false)`);
    FAILED++;
  } else {
    ok("ITSAppUsesNonExemptEncryption = false (sem export compliance)");
  }

  if (cfg.expo?.version) {
    ok(`expo.version = ${cfg.expo.version}`);
  } else {
    warn("expo.version ausente em app.json");
    WARNED++;
  }

  if (ios.usesAppleSignIn) {
    ok("Apple Sign In configurado");
  } else {
    warn("Apple Sign In não configurado (guideline 4.8 se app tem login social)");
    WARNED++;
  }
}

// ── C. ASC API checks ──────────────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign("SHA256").update(input).end().sign({ key: pem, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

async function ascGET(token, urlPath, query) {
  const url = new URL(`https://api.appstoreconnect.apple.com${urlPath}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || r.statusText;
    throw new Error(`${urlPath} → ${r.status}: ${msg}`);
  }
  return data;
}

async function runAscChecks() {
  section("C. App Store Connect API");

  let pem = process.env.ASC_PRIVATE_KEY;
  if (!pem) {
    const p8Name = `AuthKey_${KEY_ID}.p8`;
    const candidates = [
      path.join(process.cwd(), p8Name),
      path.join(process.cwd(), "..", p8Name),
      path.join(process.env.HOME || process.env.USERPROFILE || ".", p8Name),
    ];
    for (const c of candidates) if (fs.existsSync(c)) { pem = fs.readFileSync(c, "utf8"); break; }
  }

  if (!pem) {
    warn("ASC_PRIVATE_KEY ausente — pulando checks ASC (ok em dev local)");
    WARNED++;
    return;
  }

  const token = makeJWT(pem);

  // Find app
  let app;
  try {
    const apps = await ascGET(token, "/v1/apps", {
      "filter[bundleId]": BUNDLE_ID,
      "fields[apps]": "name,bundleId,sku",
      "limit": 1,
    });
    app = apps.data?.[0];
  } catch (e) {
    fail(`Autenticação ASC falhou: ${e.message}`);
    FAILED++;
    return;
  }

  if (!app) {
    fail(`App ${BUNDLE_ID} não encontrado no ASC — crie manualmente antes do primeiro release`);
    FAILED++;
    return;
  }
  ok(`App encontrado: "${app.attributes.name}" id=${app.id}`);

  // Subscriptions present?
  try {
    const groups = await ascGET(token, `/v1/apps/${app.id}/subscriptionGroups`, { limit: 10 });
    if (!groups.data?.length) {
      fail("Nenhum subscription group configurado — rode `node kindar-asc.mjs` primeiro");
      FAILED++;
    } else {
      let subCount = 0;
      for (const g of groups.data) {
        const subs = await ascGET(token, `/v1/subscriptionGroups/${g.id}/subscriptions`, { limit: 20 });
        subCount += subs.data?.length || 0;
      }
      if (subCount === 0) {
        fail("Nenhuma subscription dentro dos grupos — rode `node kindar-asc.mjs` primeiro");
        FAILED++;
      } else {
        ok(`${subCount} subscription(s) configurada(s)`);
      }
    }
  } catch (e) {
    warn(`Não consegui ler subscriptions: ${e.message}`);
    WARNED++;
  }

  // Agreement check (best effort — ASC API não expõe status do Paid Apps Agreement
  // diretamente, mas se o app retornar erro CONTRACT_NEEDED ao listar pricing, avisa)
  try {
    await ascGET(token, `/v1/apps/${app.id}/appPricePoints`, { limit: 1 });
    ok("App pricing acessível (agreement provavelmente OK)");
  } catch (e) {
    if (/contract|agreement/i.test(e.message)) {
      fail(`Paid Apps Agreement não ativo: ${e.message}`);
      FAILED++;
    } else {
      warn(`Agreement check inconclusivo: ${e.message}`);
      WARNED++;
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.b}Kindar — Pre-Submit Audit${C.r}`);

  await runWebChecks();
  runNativeChecks();
  await runAscChecks();

  section("RESULTADO");
  if (FAILED === 0 && WARNED === 0) {
    ok("Todos os checks passaram. Safe to ship.");
  } else {
    console.log(`${FAILED > 0 ? C.R : C.Y}${FAILED} falha(s), ${WARNED} aviso(s)${C.r}`);
  }

  if (FAILED > 0) {
    console.log(`\n${C.R}ABORTANDO — resolva as falhas antes de rodar o release.${C.r}\n`);
    process.exit(1);
  }
  console.log();
}

main().catch((e) => {
  fail(`AUDIT CRASH: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
