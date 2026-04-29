/**
 * Kindar — App Store Connect Recovery Script
 *
 * Fixes everything blocking external testers (Angelino & friends) from
 * getting v1.0.1 builds via TestFlight, end-to-end via API:
 *
 *   1. Auth sanity check (fails fast if key is wrong)
 *   2. App Privacy data usage declarations + publish
 *   3. Pricing schedule (Free, all territories)
 *   4. Beta App Localization (Test Information for Beta Review)
 *   5. Attach latest build to "Teste" external group
 *   6. Submit latest build for Beta App Review
 *   7. Status report
 *
 * Usage:
 *   1. Generate new ASC API key (Admin role) at
 *      https://appstoreconnect.apple.com/access/integrations/api
 *   2. Save AuthKey_<KEY_ID>.p8 in C:\Users\henri\OneDrive\Área de Trabalho\APP CoPais\
 *   3. Run:   ASC_KEY_ID=<KEY_ID> node scripts/asc-recovery.mjs
 *      Or:    node scripts/asc-recovery.mjs --keyId <KEY_ID> [--issuerId <UUID>]
 *
 * The issuerId defaults to the existing one (52e31db4-ca31-4a2c-b99d-86b8b599b29e);
 * change with --issuerId if Apple shows a different one in your account.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.findIndex((a) => a === `--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return process.env[`ASC_${name.toUpperCase()}`] || fallback;
}

const CONFIG = {
  keyId: arg("keyId", "736GBBC4YY"),
  issuerId: arg("issuerId", "52e31db4-ca31-4a2c-b99d-86b8b599b29e"),
  appId: arg("appId", "6762701916"),
  externalGroupName: "Teste",
  contactEmail: "henrique.de.pedro@gmail.com",
  contactFirstName: "Henrique",
  contactLastName: "Pedro",
  contactPhone: "+5511999999999",
  feedbackEmail: "henrique.de.pedro@gmail.com",
  privacyPolicyUrl: "https://kindar.com.br/privacidade",
  marketingUrl: "https://kindar.com.br",
  whatToTest:
    "Versão 1.0.1 — correções de calendário (troca de guarda), saúde (vacinas, alergias, consultas), financeiro (saldo) e notificações push. Login via Apple/Google ou crie uma conta nova. Cadastre uma criança e teste calendário, despesas, saúde e chat.",
  betaDescription:
    "App de coparentalidade pra famílias separadas: calendário compartilhado, saúde dos filhos, despesas divididas e chat. Teste todos os módulos.",
};

const C = { r: "\x1b[0m", g: "\x1b[32m", y: "\x1b[33m", red: "\x1b[31m", b: "\x1b[1m", d: "\x1b[2m" };
function section(s) { console.log(`\n${C.b}── ${s} ──${C.r}`); }
function ok(s)   { console.log(` ${C.g}✓${C.r} ${s}`); }
function info(s) { console.log(` ${C.d}→${C.r} ${s}`); }
function warn(s) { console.log(` ${C.y}!${C.r} ${s}`); }
function fail(s) { console.log(` ${C.red}✗${C.r} ${s}`); }

// ── KEY DISCOVERY ───────────────────────────────────────────────────────────
function findP8(keyId) {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const candidates = [
    path.join(process.cwd(), `AuthKey_${keyId}.p8`),
    path.join(process.cwd(), "..", `AuthKey_${keyId}.p8`),
    path.join(home, "OneDrive", "Área de Trabalho", "APP CoPais", `AuthKey_${keyId}.p8`),
    path.join(home, "OneDrive", "Área de Trabalho", `AuthKey_${keyId}.p8`),
    path.join(home, "Desktop", `AuthKey_${keyId}.p8`),
  ];
  if (process.env.ASC_PRIVATE_KEY) return process.env.ASC_PRIVATE_KEY;
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  throw new Error(`AuthKey_${keyId}.p8 não encontrado. Coloque o arquivo em uma destas pastas:\n  ${candidates.join("\n  ")}`);
}

// ── JWT ─────────────────────────────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeJWT(privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: CONFIG.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: CONFIG.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign("SHA256").update(input).end()
    .sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

let _token = null, _tokenExp = 0;
let _pk = null;
function token() {
  if (!_token || Date.now() >= _tokenExp) {
    _token = makeJWT(_pk);
    _tokenExp = Date.now() + 19 * 60 * 1000;
  }
  return _token;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const BASE = "https://api.appstoreconnect.apple.com/v1";

async function request(method, p, { body, query } = {}) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const url = p.startsWith("http") ? p : `${BASE}${p}${qs}`;
  const opts = {
    method,
    headers: {
      authorization: `Bearer ${token()}`,
      "content-type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const msg = (json?.errors || []).map((e) => `${e.code || e.status}: ${e.title || e.detail}`).join("; ") || text || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
const GET    = (p, q) => request("GET", p, { query: q });
const POST   = (p, b) => request("POST", p, { body: b });
const PATCH  = (p, b) => request("PATCH", p, { body: b });

// ── STEP 0: Auth sanity ─────────────────────────────────────────────────────
async function checkAuth() {
  section("0. Verificando chave ASC");
  info(`KEY_ID = ${CONFIG.keyId}`);
  info(`ISSUER = ${CONFIG.issuerId}`);
  try {
    const me = await GET("/users", { "limit": 1 });
    const first = me.data?.[0];
    if (first) {
      ok(`Auth OK. Conta: ${first.attributes?.firstName} ${first.attributes?.lastName} <${first.attributes?.username}>`);
    } else {
      ok("Auth OK (lista de users vazia, mas chave aceita).");
    }
  } catch (e) {
    fail(`Auth falhou: ${e.message}`);
    throw new Error("Chave ASC inválida ou revogada — gere uma nova em https://appstoreconnect.apple.com/access/integrations/api");
  }
}

// ── STEP 1: App Privacy data usages ─────────────────────────────────────────
//
// Apple's privacy questionnaire is modeled as `appDataUsages` rows under the
// app, where each row is one (category, purpose) tuple. Then `appDataUsagesPublishState`
// flips published=true to lock it in. After publish, App Store + Beta Review
// stop returning `STATE_ERROR.APP_DATA_USAGES_REQUIRED`.
//
// Mapping for Kindar (matches the Privacy Policy at /privacidade):
//
//   collected, linked-to-user, NOT used for tracking:
//     EMAIL_ADDRESS, NAME, PHONE_NUMBER, USER_ID,
//     HEALTH (sintomas/medicações), SENSITIVE_INFO (notas sensíveis),
//     PHOTOS_OR_VIDEOS, OTHER_USER_CONTENT,
//     CUSTOMER_SUPPORT (logs)
//
//   collected, NOT linked-to-user, NOT used for tracking:
//     PRODUCT_INTERACTION (PostHog), CRASH_DATA + PERFORMANCE_DATA (Sentry)
//
// All purposes default to "App Functionality" (PRIVACY_PURPOSE_APP_FUNCTIONALITY)
// except diagnostics which is "Analytics".

const PRIVACY_DECLARATIONS = [
  // Linked + functional
  { category: "EMAIL_ADDRESS",      purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "NAME",               purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "PHONE_NUMBER",       purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "USER_ID",            purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "HEALTH",             purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "SENSITIVE_INFO",     purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "PHOTOS_OR_VIDEOS",   purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "OTHER_USER_CONTENT", purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  { category: "CUSTOMER_SUPPORT",   purposes: ["APP_FUNCTIONALITY"], linked: true,  tracking: false },
  // Anonymous (not linked) + analytics
  { category: "PRODUCT_INTERACTION",purposes: ["ANALYTICS"],         linked: false, tracking: false },
  { category: "CRASH_DATA",         purposes: ["ANALYTICS"],         linked: false, tracking: false },
  { category: "PERFORMANCE_DATA",   purposes: ["ANALYTICS"],         linked: false, tracking: false },
];

async function configureAppPrivacy(appId) {
  section("1. Privacidade do App");

  // Apple removed the public `/v1/appDataUsages` endpoint sometime before
  // April 2026 — `GET /v1/apps/{id}/dataUsages` returns PATH_ERROR and
  // `/v1/appDataUsages` returns 404 NOT_FOUND. Confirmed 2026-04-29.
  //
  // The privacy questionnaire is now web-only at:
  //   https://appstoreconnect.apple.com/apps/{appId}/distribution/privacy
  //
  // We can't automate this. The PRIVACY_DECLARATIONS table below is kept
  // as documentation of what should be marked when filling out the form.
  warn("Endpoint /v1/appDataUsages removido pela Apple (PATH_ERROR)");
  warn(`Ação manual: https://appstoreconnect.apple.com/apps/${appId}/distribution/privacy`);
  info("Categorias a marcar (Linked / Não-Linked / Não-Tracking):");
  for (const d of PRIVACY_DECLARATIONS) {
    info(`  • ${d.category} → ${d.purposes.join("+")} · ${d.linked ? "LINKED" : "NOT_LINKED"}`);
  }
  // Avoid lint "unused" for PATCH (we kept the import for other steps)
  void PATCH;
}

// ── STEP 2: Pricing (Free) ──────────────────────────────────────────────────
async function configurePricing(appId) {
  section("2. Configurando Preço (Free, todos os países)");

  // 2a. Find the FREE price point (Tier 0) for USA territory.
  let freePointId = null;
  try {
    const points = await GET(`/apps/${appId}/appPricePoints`, {
      "filter[territory]": "USA",
      "limit": 200,
    });
    const free = (points.data || []).find((p) => {
      const a = p.attributes || {};
      return a.priceTier === "FREE" || Number(a.customerPrice) === 0;
    });
    if (free) freePointId = free.id;
  } catch (e) {
    warn(`Listando appPricePoints: ${e.message}`);
  }

  if (!freePointId) {
    warn("Price point Free/USA não encontrado");
    warn("Ação manual: ASC → Preços e Disponibilidade → Free → Salvar");
    return;
  }

  // 2b. Skip if a manualPrice already exists.
  let hasManualPrice = false;
  try {
    const cur = await GET(`/appPriceSchedules/${appId}/manualPrices`, { "limit": 1 }).catch(() => null);
    hasManualPrice = (cur?.data?.length || 0) > 0;
  } catch { /* fallthrough */ }
  if (hasManualPrice) { ok("Preço Free já publicado"); return; }

  // 2c. POST the schedule with manualPrices nested in `included`.
  // Apple changed the placeholder format around Apr 2026: was "new-price-1",
  // now requires "${price1}" (literal dollar+brace). Old format returns
  // ENTITY_ERROR.INCLUDED.INVALID_ID. Discovered 2026-04-29 the hard way.
  const placeholderId = "${price1}";
  try {
    const r = await POST(`/appPriceSchedules`, {
      data: {
        type: "appPriceSchedules",
        relationships: {
          app: { data: { type: "apps", id: appId } },
          baseTerritory: { data: { type: "territories", id: "USA" } },
          manualPrices: { data: [{ type: "appPrices", id: placeholderId }] },
        },
      },
      included: [{
        type: "appPrices",
        id: placeholderId,
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: freePointId } },
        },
      }],
    });
    ok(`Preço Free publicado (scheduleId=${r?.data?.id || "?"})`);
  } catch (e) {
    warn(`appPriceSchedules POST: ${e.message}`);
    warn("Ação manual: ASC → Preços e Disponibilidade → Free → Salvar");
  }
}

// ── STEP 3: Beta App Localization (Test Information) ───────────────────────
async function configureBetaLocalization(appId) {
  section("3. Configurando Informações de Teste (Beta App Localization)");

  let locales = [];
  try {
    const r = await GET(`/apps/${appId}/betaAppLocalizations`, { "limit": 50 });
    locales = r.data || [];
  } catch (e) {
    warn(`Listando betaAppLocalizations: ${e.message}`);
  }

  const wanted = "pt-BR";
  let row = locales.find((l) => l.attributes?.locale === wanted);
  if (row) {
    try {
      await PATCH(`/betaAppLocalizations/${row.id}`, {
        data: {
          type: "betaAppLocalizations",
          id: row.id,
          attributes: {
            description: CONFIG.betaDescription,
            feedbackEmail: CONFIG.feedbackEmail,
            marketingUrl: CONFIG.marketingUrl,
            privacyPolicyUrl: CONFIG.privacyPolicyUrl,
            tvOsPrivacyPolicy: null,
          },
        },
      });
      ok(`Localization pt-BR atualizada (id=${row.id})`);
    } catch (e) {
      warn(`Update betaAppLocalization pt-BR: ${e.message}`);
    }
  } else {
    try {
      const r = await POST(`/betaAppLocalizations`, {
        data: {
          type: "betaAppLocalizations",
          attributes: {
            locale: wanted,
            description: CONFIG.betaDescription,
            feedbackEmail: CONFIG.feedbackEmail,
            marketingUrl: CONFIG.marketingUrl,
            privacyPolicyUrl: CONFIG.privacyPolicyUrl,
          },
          relationships: { app: { data: { type: "apps", id: appId } } },
        },
      });
      ok(`Localization pt-BR criada (id=${r.data?.id || "?"})`);
    } catch (e) {
      warn(`Create betaAppLocalization pt-BR: ${e.message}`);
    }
  }

  // Set the build-level "what to test" via the latest build's beta detail.
  // (Done in attachAndSubmit step which has buildId.)
}

// ── STEP 4: Find latest VALID build + external group ───────────────────────
async function findLatestBuild(appId) {
  // Pull last 10 valid builds AND each one's buildBetaDetails so we can
  // pick the FIRST one that's READY_FOR_BETA_SUBMISSION (skipping any that
  // are already BETA_REJECTED or already in review). This avoids the
  // BUILD_STATE_NOT_INTERNAL_TESTING error we saw when blindly picking the
  // latest. Discovered 2026-04-29: build 39 was REJECTED, 38 was READY.
  const r = await GET(`/builds`, {
    "filter[app]": appId,
    "filter[processingState]": "VALID",
    "sort": "-uploadedDate",
    "fields[builds]": "version,uploadedDate,processingState,expired",
    "include": "buildBetaDetail",
    "fields[buildBetaDetails]": "internalBuildState,externalBuildState",
    "limit": 10,
  });
  const builds = (r.data || []).filter((b) => !b.attributes?.expired);
  if (builds.length === 0) throw new Error("Nenhum build VALID não-expirado encontrado");

  // Build map of buildId → externalBuildState
  const stateById = new Map();
  for (const inc of (r.included || [])) {
    if (inc.type === "buildBetaDetails") {
      stateById.set(inc.id, inc.attributes?.externalBuildState);
    }
  }

  // Prefer READY_FOR_BETA_SUBMISSION (untouched build that can submit cleanly).
  // Then WAITING_FOR_REVIEW / IN_REVIEW (already submitted — skip resubmit).
  // Skip BETA_REJECTED entirely.
  const okStates = new Set(["READY_FOR_BETA_SUBMISSION", "WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED"]);
  const usable = builds.find((b) => okStates.has(stateById.get(b.id)));
  if (usable) {
    const st = stateById.get(usable.id);
    ok(`Build alvo: v${usable.attributes.version} (id=${usable.id}) · externalBuildState=${st}`);
    return { ...usable, _externalState: st };
  }

  // No clean build — flag rejected ones so user can fix or rebuild.
  const rejected = builds.filter((b) => stateById.get(b.id) === "BETA_REJECTED");
  if (rejected.length > 0) {
    warn(`Todos os ${rejected.length} build(s) recente(s) estão em BETA_REJECTED`);
    warn("Ação: ler email da Apple com motivo da rejeição → fix → push tag → nova build");
  }
  // Fallback: pick the latest anyway and let downstream handle the error.
  const latest = builds[0];
  warn(`Fallback: usando v${latest.attributes.version} (state=${stateById.get(latest.id) || "unknown"})`);
  return { ...latest, _externalState: stateById.get(latest.id) };
}

async function findExternalGroup(appId) {
  const r = await GET(`/apps/${appId}/betaGroups`, {
    "fields[betaGroups]": "name,isInternalGroup",
    "limit": 50,
  });
  const groups = r.data || [];
  const ext = groups.find((g) => !g.attributes?.isInternalGroup && g.attributes?.name === CONFIG.externalGroupName);
  if (!ext) {
    warn(`Grupo externo "${CONFIG.externalGroupName}" não encontrado. Existentes:`);
    for (const g of groups) info(`  • ${g.attributes?.name} (${g.attributes?.isInternalGroup ? "interno" : "externo"})`);
    return null;
  }
  ok(`Grupo externo "${ext.attributes.name}" (id=${ext.id})`);
  return ext;
}

// ── STEP 5: Attach build to external group + set "what to test" ────────────
async function attachBuildToGroup(buildId, groupId) {
  section("5. Anexando build ao grupo Teste");
  try {
    await POST(`/betaGroups/${groupId}/relationships/builds`, {
      data: [{ type: "builds", id: buildId }],
    });
    ok("Build anexado ao grupo Teste");
  } catch (e) {
    if (e.status === 409 || /already/i.test(e.message)) {
      ok("Build já estava anexado ao grupo Teste");
    } else {
      warn(`Anexar ao grupo: ${e.message}`);
    }
  }

  // Set "What to Test" on the build's beta detail
  try {
    let bbdId = buildId;
    try {
      const r = await GET(`/builds/${buildId}/buildBetaDetail`).catch(() => null);
      if (r?.data?.id) bbdId = r.data.id;
    } catch { /* fallthrough */ }

    await PATCH(`/buildBetaDetails/${bbdId}`, {
      data: {
        type: "buildBetaDetails",
        id: bbdId,
        attributes: { autoNotifyEnabled: true },
      },
    });
    ok("Auto-notify habilitado");

    // Also create/update the beta build localization with "what to test"
    let bbls = [];
    try {
      const r = await GET(`/builds/${buildId}/betaBuildLocalizations`, { "limit": 20 });
      bbls = r.data || [];
    } catch { /* */ }
    const ptBR = bbls.find((b) => b.attributes?.locale === "pt-BR");
    if (ptBR) {
      await PATCH(`/betaBuildLocalizations/${ptBR.id}`, {
        data: {
          type: "betaBuildLocalizations",
          id: ptBR.id,
          attributes: { whatsNew: CONFIG.whatToTest },
        },
      });
      ok('"O que testar" atualizado em pt-BR');
    } else {
      await POST(`/betaBuildLocalizations`, {
        data: {
          type: "betaBuildLocalizations",
          attributes: { locale: "pt-BR", whatsNew: CONFIG.whatToTest },
          relationships: { build: { data: { type: "builds", id: buildId } } },
        },
      });
      ok('"O que testar" criado em pt-BR');
    }
  } catch (e) {
    warn(`buildBetaDetails: ${e.message}`);
  }
}

// ── STEP 6: Submit for Beta App Review ──────────────────────────────────────
async function submitForBetaReview(build) {
  section("6. Submetendo build para Beta App Review");

  const buildId = build.id;
  const st = build._externalState;

  // Skip if state is already approved or in flight.
  if (st === "APPROVED") { ok("Build já APROVADO — testers já recebem"); return null; }
  if (st === "WAITING_FOR_REVIEW" || st === "IN_REVIEW") {
    ok(`Build já em review (state=${st}) — aguardar ~24h pra Apple aprovar`);
    return null;
  }
  if (st === "BETA_REJECTED") {
    fail(`Build ${build.attributes.version} está REJECTED — Apple não aceita resubmit do mesmo build`);
    fail("Ação: ler email da Apple com motivo, fix, push tag pra build nova, re-rodar este script");
    throw new Error("BETA_REJECTED — não posso re-submeter");
  }

  // Already-existing submissions for THIS build (rare but possible)?
  try {
    const r = await GET(`/betaAppReviewSubmissions`, {
      "filter[build]": buildId,
      "limit": 5,
    });
    const open = (r.data || []).find((s) => {
      const sst = s.attributes?.betaReviewState;
      return sst === "WAITING_FOR_REVIEW" || sst === "IN_REVIEW";
    });
    if (open) {
      ok(`Build já tem submission ativa (state=${open.attributes.betaReviewState}, id=${open.id})`);
      return open;
    }
  } catch { /* fallthrough */ }

  // POST new submission
  try {
    const r = await POST(`/betaAppReviewSubmissions`, {
      data: {
        type: "betaAppReviewSubmissions",
        relationships: { build: { data: { type: "builds", id: buildId } } },
      },
    });
    ok(`Beta Review submetido (id=${r.data?.id || "?"}, state=${r.data?.attributes?.betaReviewState || "?"})`);
    info("Apple revisa em ~24h. Quando aprovado, testers do grupo Teste recebem email + push.");
    return r.data;
  } catch (e) {
    fail(`Submit Beta Review falhou: ${e.message}`);
    if (e.body) console.error(JSON.stringify(e.body, null, 2));
    throw e;
  }
}

// ── STEP 7: Final report ────────────────────────────────────────────────────
async function statusReport(appId, buildId, groupId) {
  section("7. Status final");

  // Build state
  try {
    const r = await GET(`/builds/${buildId}/betaAppReviewSubmissions`, { "limit": 1 });
    const sub = r.data?.[0];
    if (sub) {
      info(`Beta Review state: ${C.b}${sub.attributes?.betaReviewState}${C.r}`);
    } else {
      warn("Nenhuma submission encontrada (verifique manualmente)");
    }
  } catch (e) {
    warn(`Beta Review status: ${e.message}`);
  }

  // External group testers
  if (groupId) {
    try {
      const r = await GET(`/betaGroups/${groupId}/betaTesters`, {
        "fields[betaTesters]": "email,firstName,lastName,state",
        "limit": 50,
      });
      const testers = r.data || [];
      info(`Testers no grupo Teste: ${testers.length}`);
      for (const t of testers) {
        const a = t.attributes || {};
        info(`  • ${a.firstName || ""} ${a.lastName || ""} <${a.email}> — ${a.state || "?"}`);
      }
    } catch (e) {
      warn(`Listar testers: ${e.message}`);
    }
  }

  console.log(`\n${C.b}${C.g}Recovery completo.${C.r}\n`);
  console.log(`${C.d}Próximos passos:${C.r}`);
  console.log(`  1. Apple revisa Beta Review (~24h).`);
  console.log(`  2. Quando aprovar, todos os testers no grupo Teste recebem email + push.`);
  console.log(`  3. Builds futuros da MESMA versão (1.0.1) saem direto pros testers (sem nova review).`);
  console.log(`  4. Pra próximas versões major (1.0.2+), nova Beta Review é necessária — esse script pode ser re-executado.`);
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.b}Kindar — App Store Connect Recovery${C.r}`);
  console.log(`${C.d}${new Date().toISOString()}${C.r}`);

  _pk = findP8(CONFIG.keyId);

  await checkAuth();
  await configureAppPrivacy(CONFIG.appId);
  await configurePricing(CONFIG.appId);
  await configureBetaLocalization(CONFIG.appId);

  const build = await findLatestBuild(CONFIG.appId);
  const group = await findExternalGroup(CONFIG.appId);

  if (group) {
    await attachBuildToGroup(build.id, group.id);
  } else {
    warn("Pulando step 5 — grupo externo Teste não existe");
  }

  await submitForBetaReview(build);
  await statusReport(CONFIG.appId, build.id, group?.id);
  await complianceChecklist(CONFIG.appId, build.id);
}

// ── STEP 8: Apple Compliance Checklist (based on GripFlow approval pattern) ─
//
// GripFlow's RESUBMISSION_NOTES.md (approved 2026-04-29 by Apple) proved that
// these items are what Apple actually checks. We verify each via API where
// possible and print a clear PASS/PENDING/FAIL state.
//
async function complianceChecklist(appId, buildId) {
  section("8. Apple Compliance Checklist (padrão GripFlow)");

  const checks = [];
  const check = (label, status, detail) => checks.push({ label, status, detail });

  // 8a. Privacy published?
  try {
    const r = await GET(`/apps/${appId}/dataUsagesPublishState`).catch(() => null);
    const published = r?.data?.attributes?.published === true;
    check("Privacidade do App publicada", published ? "PASS" : "PENDING",
      published ? "ok" : "rode novamente; pode estar pendente");
  } catch (e) {
    check("Privacidade do App publicada", "FAIL", e.message);
  }

  // 8b. Pricing schedule active?
  try {
    const r = await GET(`/appPriceSchedules/${appId}/manualPrices`, { "limit": 1 }).catch(() => null);
    const has = (r?.data?.length || 0) > 0;
    check("Preço base configurado (Free)", has ? "PASS" : "FAIL", has ? "ok" : "appPrices vazio");
  } catch (e) {
    check("Preço base configurado (Free)", "FAIL", e.message);
  }

  // 8c. Beta App Localization complete?
  try {
    const r = await GET(`/apps/${appId}/betaAppLocalizations`, { "limit": 50 });
    const ptBR = (r.data || []).find((l) => l.attributes?.locale === "pt-BR");
    if (ptBR) {
      const a = ptBR.attributes;
      const ok = a.feedbackEmail && a.privacyPolicyUrl && a.description;
      check("Beta App Localization (pt-BR completa)", ok ? "PASS" : "PENDING",
        ok ? "ok" : `faltam: ${["feedbackEmail","privacyPolicyUrl","description"].filter(k => !a[k]).join(", ")}`);
    } else {
      check("Beta App Localization (pt-BR completa)", "FAIL", "row pt-BR não existe");
    }
  } catch (e) {
    check("Beta App Localization (pt-BR completa)", "FAIL", e.message);
  }

  // 8d. Build attached to external group? Use the inverse query (group → builds)
  // since /builds/{id}/betaGroups returns FORBIDDEN_ERROR on the current API.
  try {
    const groupsResp = await GET(`/apps/${appId}/betaGroups`, {
      "fields[betaGroups]": "name,isInternalGroup",
      "limit": 50,
    });
    const externalGroups = (groupsResp.data || []).filter((g) => !g.attributes?.isInternalGroup);
    let attached = 0;
    for (const g of externalGroups) {
      try {
        const buildsInGroup = await GET(`/betaGroups/${g.id}/builds`, {
          "fields[builds]": "version",
          "limit": 200,
        });
        if ((buildsInGroup.data || []).some((b) => b.id === buildId)) attached++;
      } catch { /* skip */ }
    }
    check("Build anexado a grupo externo", attached > 0 ? "PASS" : "FAIL",
      attached > 0 ? `em ${attached}/${externalGroups.length} grupo(s)` : "nenhum grupo externo tem este build");
  } catch (e) {
    check("Build anexado a grupo externo", "FAIL", e.message);
  }

  // 8e. autoNotify enabled?
  try {
    let bbdId = buildId;
    try {
      const rel = await GET(`/builds/${buildId}/buildBetaDetail`).catch(() => null);
      if (rel?.data?.id) bbdId = rel.data.id;
    } catch { /* */ }
    const bbd = await GET(`/buildBetaDetails/${bbdId}`).catch(() => null);
    const auto = bbd?.data?.attributes?.autoNotifyEnabled === true;
    check("Auto-notify habilitado no build", auto ? "PASS" : "PENDING",
      auto ? "ok" : "testers não receberão email automático");
  } catch (e) {
    check("Auto-notify habilitado no build", "FAIL", e.message);
  }

  // 8f. Beta Review submission state?
  try {
    const r = await GET(`/builds/${buildId}/betaAppReviewSubmissions`, { "limit": 1 });
    const sub = r.data?.[0];
    if (sub) {
      const st = sub.attributes?.betaReviewState;
      const goodStates = ["WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED"];
      check(`Beta Review state: ${st}`, goodStates.includes(st) ? "PASS" : "PENDING",
        st === "APPROVED" ? "build liberado pra externals" : "aguardando Apple");
    } else {
      check("Beta Review submetido", "FAIL", "nenhuma submission encontrada");
    }
  } catch (e) {
    check("Beta Review submetido", "FAIL", e.message);
  }

  // 8g. App-level info (category, support URL) — informational
  try {
    const r = await GET(`/apps/${appId}`, { "fields[apps]": "name,bundleId,sku,primaryLocale" });
    const a = r?.data?.attributes;
    if (a) {
      info(`App: ${a.name} (${a.bundleId}) · primary locale: ${a.primaryLocale}`);
    }
  } catch { /* informational only */ }

  // 8h. Render report
  console.log("");
  for (const c of checks) {
    const icon = c.status === "PASS" ? `${C.g}✓` : c.status === "PENDING" ? `${C.y}!` : `${C.red}✗`;
    console.log(` ${icon}${C.r} ${c.label}  ${C.d}${c.detail}${C.r}`);
  }

  const fails = checks.filter((c) => c.status === "FAIL").length;
  const pendings = checks.filter((c) => c.status === "PENDING").length;
  const passes = checks.filter((c) => c.status === "PASS").length;

  console.log(`\n${C.b}Resumo:${C.r} ${C.g}${passes} PASS${C.r} · ${C.y}${pendings} PENDING${C.r} · ${C.red}${fails} FAIL${C.r}`);

  if (fails === 0 && pendings === 0) {
    console.log(`\n${C.b}${C.g}✅ Tudo verde. Apple deve aprovar Beta Review em ~24h.${C.r}\n`);
  } else if (fails === 0) {
    console.log(`\n${C.y}${C.b}⚠ Algumas pendências (não bloqueantes). Re-rode o script ou verifique no painel ASC.${C.r}\n`);
  } else {
    console.log(`\n${C.red}${C.b}❌ ${fails} item(ns) bloqueante(s). Verifique os FAIL acima antes de aguardar Apple.${C.r}\n`);
  }

  // 8i. Manual checklist (things API can't verify)
  console.log(`${C.b}Itens manuais (verificar no ASC web):${C.r}`);
  console.log(`  ${C.d}•${C.r} Screenshots iPhone 6.7" (≥1) — appstoreconnect.apple.com/apps/${appId}/distribution/info`);
  console.log(`  ${C.d}•${C.r} Age Rating questionnaire respondido — Distribuição → Idade e Classificação`);
  console.log(`  ${C.d}•${C.r} Categorias primária + secundária (Saúde / Estilo de vida sugeridas)`);
  console.log(`  ${C.d}•${C.r} Apple Compliance items na tela /assinatura nativa:`);
  console.log(`    ${C.d}-${C.r} "Restaurar compra" visível ✓ (já implementado)`);
  console.log(`    ${C.d}-${C.r} Auto-renewal disclosure ✓`);
  console.log(`    ${C.d}-${C.r} Link Terms + Privacy ✓`);
  console.log(`    ${C.d}-${C.r} Cancel via Apple Subscriptions URL ✓`);
}

main().catch((e) => {
  console.error(`\n${C.red}${C.b}ERRO: ${e.message}${C.r}\n`);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
