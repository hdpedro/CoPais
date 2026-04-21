#!/usr/bin/env node
// ============================================================================
// Kindar — App Store Connect Automation (SELF-CONTAINED)
// Zero dependencies. Requires only Node 18+ (built-in fetch + crypto).
// Save this file next to your AuthKey_736GBBC4YY.p8 and run:
//   node kindar-asc.mjs
// ============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  keyId: "736GBBC4YY",
  issuerId: "52e31db4-ca31-4a2c-b99d-86b8b599b29e",
  bundleId: "com.kindar.app",
  appName: "Kindar",
};

const KINDAR = {
  subtitle: "Dois lares, uma família",
  primaryCategory: "LIFESTYLE",
  secondaryCategory: "PRODUCTIVITY",
  privacyPolicyUrl: "https://kindar.com.br/privacidade",
  supportUrl: "https://kindar.com.br",
  marketingUrl: "https://kindar.com.br",
};

const SUBSCRIPTION_GROUP_NAME = "Kindar Premium";

const SUBSCRIPTIONS = [
  {
    productId: "com.kindar.elite.annual",
    referenceName: "Elite Annual",
    subscriptionPeriod: "ONE_YEAR",
    groupLevel: 1,
    localizations: {
      "pt-BR": { name: "Elite Anual", description: "Tudo do Elite por 12 meses. Economize R$ 101 por ano." },
      "en-US": { name: "Elite Annual", description: "Everything in Elite for 12 months. Save per year." },
    },
  },
  {
    productId: "com.kindar.elite.monthly",
    referenceName: "Elite Monthly",
    subscriptionPeriod: "ONE_MONTH",
    groupLevel: 2,
    localizations: {
      "pt-BR": { name: "Elite", description: "Tudo do Premium + suporte VIP, backup jurídico, relatórios detalhados e exportação PDF." },
      "en-US": { name: "Elite", description: "Everything in Premium + VIP support, legal backup, detailed reports and PDF export." },
    },
  },
  {
    productId: "com.kindar.premium.annual",
    referenceName: "Premium Annual",
    subscriptionPeriod: "ONE_YEAR",
    groupLevel: 3,
    localizations: {
      "pt-BR": { name: "Premium Anual", description: "Tudo do Premium por 12 meses. Economize R$ 61 por ano." },
      "en-US": { name: "Premium Annual", description: "Everything in Premium for 12 months. Save per year." },
    },
  },
  {
    productId: "com.kindar.premium.monthly",
    referenceName: "Premium Monthly",
    subscriptionPeriod: "ONE_MONTH",
    groupLevel: 4,
    localizations: {
      "pt-BR": { name: "Premium", description: "Calendário completo, chat, saúde, documentos ilimitados, assistente IA e suporte prioritário." },
      "en-US": { name: "Premium", description: "Full calendar, chat, health, unlimited documents, AI assistant and priority support." },
    },
  },
];

const VERSION_METADATA = {
  "pt-BR": {
    description: `Kindar é o app para famílias que precisam organizar a rotina das crianças entre várias pessoas — pais, mães, avós, padrastos, madrastas, cuidadores.

Funcionalidades principais:

• Calendário compartilhado com escala de guarda
• Chat em tempo real entre os responsáveis
• Registro de saúde completo — medicamentos, alergias, vacinas, consultas, crescimento
• Controle financeiro de despesas compartilhadas com aprovação
• Atividades e eventos das crianças
• Decisões em grupo com votação
• Documentos e acordos familiares compartilhados
• Check-in diário das crianças
• Informações escolares
• Notificações em tempo real

Kindar representa os dois lares da criança. Porque seus filhos merecem responsáveis organizados.`,
    keywords: "coparentalidade,guarda compartilhada,filhos,família,calendário,despesas,saúde,crianças,pais separados,organização familiar",
    promotionalText: "Organize a rotina dos seus filhos entre dois lares. Calendário, chat, despesas e saúde em um só lugar.",
    whatsNew: "Versão inicial do Kindar para iOS.",
    supportUrl: "https://kindar.com.br",
    marketingUrl: "https://kindar.com.br",
  },
  "en-US": {
    description: `Kindar is the app for families who need to organize children's routines among multiple people — parents, grandparents, stepparents, caregivers.

Key features:

• Shared calendar with custody schedule
• Real-time chat between guardians
• Complete health records — medications, allergies, vaccines, appointments, growth
• Shared expense tracking with approval workflow
• Children's activities and events
• Group decisions with voting
• Shared family documents and agreements
• Daily child check-in
• School information
• Real-time notifications

Kindar represents both of a child's homes. Because your children deserve organized caregivers.`,
    keywords: "co-parenting,shared custody,children,family,calendar,expenses,health,kids,separated parents,family organization",
    promotionalText: "Organize your children's routine between two homes. Calendar, chat, expenses and health in one place.",
    whatsNew: "Initial release of Kindar for iOS.",
    supportUrl: "https://kindar.com.br",
    marketingUrl: "https://kindar.com.br",
  },
};

const REVIEW_INFO = {
  contactFirstName: "Henrique",
  contactLastName: "de Pedro",
  contactEmail: "henrique.de.pedro@gmail.com",
  contactPhone: "",
  demoAccountName: "henrique.pedros@hotmail.com",
  demoAccountPassword: "12345678Pedro",
  demoAccountRequired: true,
  notes: `After login, you'll see the dashboard with custody schedule, activities, health status, and pending items. Navigate using the 5 bottom tabs: Home, Calendar, Chat, Health, More.

The app manages co-parenting coordination for families. All features are functional with the demo account which has pre-populated data including children, custody schedule, health records, and expenses.

Key flows to test:
1. Dashboard: Shows greeting, custody status, recent activities, pending items
2. Calendar: Monthly grid with color-coded custody days, tap to see details
3. Chat: Real-time messaging between co-parents
4. Health: Per-child health records (medications, allergies, vaccines, appointments, growth)
5. More: All modules (expenses, activities, events, decisions, documents, agreements)

For IAP testing: Navigate to More > Pricing to see subscription options.`,
};

// ── JWT AUTH ─────────────────────────────────────────────────────────────────
const BASE = "https://api.appstoreconnect.apple.com/v1";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: CONFIG.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: CONFIG.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign("SHA256").update(input).end().sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

let _token = null;
let _tokenExp = 0;
let _pk = null;

function token() {
  if (!_token || Date.now() >= _tokenExp) {
    _token = makeJWT(_pk);
    _tokenExp = Date.now() + 18 * 60000;
  }
  return _token;
}

async function api(method, path, body) {
  const url = path.startsWith("http") ? path : BASE + path;
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || res.statusText;
    const err = new Error(`${method} ${path} → ${res.status}: ${detail}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const GET = (p, q) => {
  if (q) {
    const u = new URL(BASE + p);
    for (const [k, v] of Object.entries(q)) if (v != null) u.searchParams.set(k, String(v));
    return api("GET", u.toString());
  }
  return api("GET", p);
};
const POST = (p, b) => api("POST", p, b);
const PATCH = (p, b) => api("PATCH", p, b);

// ── COLORS ──────────────────────────────────────────────────────────────────
const C = { r: "\x1b[0m", R: "\x1b[31m", G: "\x1b[32m", Y: "\x1b[33m", B: "\x1b[34m", b: "\x1b[1m", g: "\x1b[90m" };
const ok = (m) => console.log(`${C.G}✓${C.r} ${m}`);
const info = (m) => console.log(`${C.B}→${C.r} ${m}`);
const warn = (m) => console.log(`${C.Y}⚠${C.r} ${m}`);
const fail = (m) => console.log(`${C.R}✗${C.r} ${m}`);
const section = (m) => console.log(`\n${C.b}${C.B}── ${m} ──${C.r}`);

// ── STEP 1: Find app ────────────────────────────────────────────────────────
async function findApp() {
  section("1. Buscando app Kindar no ASC");
  info(`Bundle ID: ${CONFIG.bundleId}`);

  const resp = await GET("/apps", { "filter[bundleId]": CONFIG.bundleId, "fields[apps]": "name,bundleId,sku", limit: 1 });
  if (!resp.data?.length) throw new Error(`App com bundle ID "${CONFIG.bundleId}" não encontrado. Crie primeiro no ASC.`);

  const app = resp.data[0];
  ok(`App: "${app.attributes.name}" (ID: ${app.id})`);
  return app.id;
}

// ── STEP 2: Read GripFlow for reference ─────────────────────────────────────
async function readGripFlowReference() {
  section("2. Lendo GripFlow como referência");

  // Find GripFlow by looking at all apps
  try {
    const resp = await GET("/apps", { "fields[apps]": "name,bundleId", limit: 50 });
    const apps = resp.data || [];
    for (const a of apps) {
      console.log(`  ${C.g}· ${a.attributes.name} (${a.attributes.bundleId})${C.r}`);
    }
    const gripflow = apps.find((a) => a.attributes.name?.toLowerCase().includes("gripflow"));
    if (gripflow) {
      ok(`GripFlow encontrado: ${gripflow.id}`);

      // Read its subscription groups
      try {
        const groups = await GET(`/apps/${gripflow.id}/subscriptionGroups`, { limit: 20 });
        if (groups.data?.length) {
          for (const g of groups.data) {
            console.log(`  ${C.g}  Grupo: ${g.attributes.referenceName}${C.r}`);
            const subs = await GET(`/subscriptionGroups/${g.id}/subscriptions`, { limit: 20 });
            for (const s of (subs.data || [])) {
              console.log(`  ${C.g}    · ${s.attributes.productId} (${s.attributes.name}) state=${s.attributes.state}${C.r}`);
            }
          }
        }
      } catch (e) {
        warn(`Não consegui ler subs do GripFlow: ${e.message}`);
      }
    } else {
      warn("GripFlow não encontrado nos apps. Continuando com config padrão.");
    }
  } catch (e) {
    warn(`Erro ao listar apps: ${e.message}`);
  }
}

// ── STEP 3: App Info (categories, privacy URL) ──────────────────────────────
async function configureAppInfo(appId) {
  section("3. Configurando App Info");

  const resp = await GET(`/apps/${appId}/appInfos`, { limit: 5 });
  const infos = resp.data || [];
  if (!infos.length) { warn("Nenhum AppInfo encontrado."); return; }

  const appInfo = infos[0];
  info(`AppInfo ID: ${appInfo.id} (state: ${appInfo.attributes?.appStoreState || "?"})`);

  // Categories
  try {
    await PATCH(`/appInfos/${appInfo.id}`, {
      data: {
        type: "appInfos",
        id: appInfo.id,
        relationships: {
          primaryCategory: { data: { type: "appCategories", id: KINDAR.primaryCategory } },
          secondaryCategory: { data: { type: "appCategories", id: KINDAR.secondaryCategory } },
        },
      },
    });
    ok("Categorias: LIFESTYLE / PRODUCTIVITY");
  } catch (e) {
    warn(`Categorias: ${e.message}`);
  }

  // Localizations (privacy URL)
  try {
    const locs = await GET(`/appInfos/${appInfo.id}/appInfoLocalizations`);
    for (const loc of (locs.data || [])) {
      const locale = loc.attributes?.locale;
      try {
        await PATCH(`/appInfoLocalizations/${loc.id}`, {
          data: { type: "appInfoLocalizations", id: loc.id, attributes: { privacyPolicyUrl: KINDAR.privacyPolicyUrl } },
        });
        ok(`${locale}: privacy URL → ${KINDAR.privacyPolicyUrl}`);
      } catch (e) {
        warn(`${locale} privacy: ${e.message}`);
      }
    }
  } catch (e) {
    warn(`Localizations: ${e.message}`);
  }
}

// ── STEP 4: Subscriptions ───────────────────────────────────────────────────
async function configureSubscriptions(appId) {
  section("4. Configurando Subscriptions (IAP)");

  // List existing groups
  const groupsResp = await GET(`/apps/${appId}/subscriptionGroups`, { limit: 20 });
  const groups = groupsResp.data || [];
  info(`${groups.length} grupo(s) existente(s)`);

  let targetGroup = groups.find((g) => g.attributes?.referenceName === SUBSCRIPTION_GROUP_NAME);

  // Create group if not exists
  if (!targetGroup) {
    info(`Criando grupo "${SUBSCRIPTION_GROUP_NAME}"...`);
    try {
      const resp = await POST("/subscriptionGroups", {
        data: {
          type: "subscriptionGroups",
          attributes: { referenceName: SUBSCRIPTION_GROUP_NAME },
          relationships: { app: { data: { type: "apps", id: appId } } },
        },
      });
      targetGroup = resp.data;
      ok(`Grupo criado: ${targetGroup.id}`);

      // Add localizations
      for (const locale of ["pt-BR", "en-US"]) {
        try {
          await POST("/subscriptionGroupLocalizations", {
            data: {
              type: "subscriptionGroupLocalizations",
              attributes: { locale, name: SUBSCRIPTION_GROUP_NAME, customAppName: "Kindar" },
              relationships: { subscriptionGroup: { data: { type: "subscriptionGroups", id: targetGroup.id } } },
            },
          });
          ok(`  ${locale}: localização criada`);
        } catch (e) {
          warn(`  ${locale}: ${e.message}`);
        }
      }
    } catch (e) {
      fail(`Criar grupo: ${e.message}`);
      return;
    }
  } else {
    ok(`Grupo já existe: "${SUBSCRIPTION_GROUP_NAME}" (${targetGroup.id})`);
  }

  // List existing subs
  const existingSubs = await GET(`/subscriptionGroups/${targetGroup.id}/subscriptions`, { limit: 50 });
  const existingIds = new Set((existingSubs.data || []).map((s) => s.attributes?.productId));
  info(`${existingSubs.data?.length || 0} subscription(s) no grupo`);
  for (const s of (existingSubs.data || [])) {
    console.log(`  ${C.g}· ${s.attributes.productId} (${s.attributes.state})${C.r}`);
  }

  // Create missing subscriptions
  for (const cfg of SUBSCRIPTIONS) {
    if (existingIds.has(cfg.productId)) {
      ok(`${cfg.productId} — já existe`);
      continue;
    }

    info(`Criando ${cfg.productId}...`);
    try {
      const resp = await POST("/subscriptions", {
        data: {
          type: "subscriptions",
          attributes: {
            name: cfg.referenceName,
            productId: cfg.productId,
            subscriptionPeriod: cfg.subscriptionPeriod,
            groupLevel: cfg.groupLevel,
            familySharable: false,
          },
          relationships: {
            group: { data: { type: "subscriptionGroups", id: targetGroup.id } },
          },
        },
      });
      const subId = resp.data.id;
      ok(`  Criado: ${subId}`);

      // Localizations
      for (const [locale, loc] of Object.entries(cfg.localizations)) {
        try {
          await POST("/subscriptionLocalizations", {
            data: {
              type: "subscriptionLocalizations",
              attributes: { locale, name: loc.name, description: loc.description },
              relationships: { subscription: { data: { type: "subscriptions", id: subId } } },
            },
          });
          ok(`  ${locale}: "${loc.name}"`);
        } catch (e) {
          warn(`  ${locale}: ${e.message}`);
        }
      }
    } catch (e) {
      fail(`  ${cfg.productId}: ${e.message}`);
    }
  }
}

// ── STEP 5: Version metadata ────────────────────────────────────────────────
async function configureVersion(appId) {
  section("5. Configurando metadados da versão");

  const resp = await GET(`/apps/${appId}/appStoreVersions`, { limit: 5, sort: "-createdDate" });
  const versions = resp.data || [];
  const version = versions.find((v) =>
    ["PREPARE_FOR_SUBMISSION", "METADATA_REJECTED", "DEVELOPER_REJECTED", "REJECTED", "INVALID_BINARY"].includes(v.attributes?.appStoreState)
  ) || versions[0];

  if (!version) { warn("Nenhuma versão encontrada."); return null; }

  const state = version.attributes?.appStoreState;
  info(`Versão: ${version.attributes?.versionString} (${state})`);

  if (!["PREPARE_FOR_SUBMISSION", "METADATA_REJECTED", "DEVELOPER_REJECTED", "REJECTED", "INVALID_BINARY"].includes(state)) {
    warn(`Estado "${state}" não permite edições.`);
    return version.id;
  }

  // Get existing localizations
  const locsResp = await GET(`/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const locs = locsResp.data || [];
  const byLocale = new Map(locs.map((l) => [l.attributes?.locale, l]));

  for (const [locale, meta] of Object.entries(VERSION_METADATA)) {
    const existing = byLocale.get(locale);
    const attrs = {
      description: meta.description,
      keywords: meta.keywords,
      promotionalText: meta.promotionalText,
      whatsNew: meta.whatsNew,
      marketingUrl: meta.marketingUrl,
      supportUrl: meta.supportUrl,
    };

    if (existing) {
      try {
        await PATCH(`/appStoreVersionLocalizations/${existing.id}`, {
          data: { type: "appStoreVersionLocalizations", id: existing.id, attributes: attrs },
        });
        ok(`${locale}: metadados atualizados`);
      } catch (e) {
        warn(`${locale}: ${e.message}`);
      }
    } else {
      try {
        await POST("/appStoreVersionLocalizations", {
          data: {
            type: "appStoreVersionLocalizations",
            attributes: { locale, ...attrs },
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } },
          },
        });
        ok(`${locale}: criado`);
      } catch (e) {
        warn(`${locale} criar: ${e.message}`);
      }
    }
  }

  return version.id;
}

// ── STEP 6: Review Info ─────────────────────────────────────────────────────
async function configureReview(versionId) {
  if (!versionId) return;
  section("6. Configurando Review Information");

  const attrs = {
    contactFirstName: REVIEW_INFO.contactFirstName,
    contactLastName: REVIEW_INFO.contactLastName,
    contactEmail: REVIEW_INFO.contactEmail,
    contactPhone: REVIEW_INFO.contactPhone,
    demoAccountName: REVIEW_INFO.demoAccountName,
    demoAccountPassword: REVIEW_INFO.demoAccountPassword,
    demoAccountRequired: REVIEW_INFO.demoAccountRequired,
    notes: REVIEW_INFO.notes,
  };

  // Try update first (GET existing)
  try {
    const existing = await GET(`/appStoreVersions/${versionId}/appStoreReviewDetail`);
    if (existing?.data) {
      await PATCH(`/appStoreReviewDetails/${existing.data.id}`, {
        data: { type: "appStoreReviewDetails", id: existing.data.id, attributes: attrs },
      });
      ok("Review detail atualizado (conta demo + notas)");
      return;
    }
  } catch { /* not found, create */ }

  try {
    await POST("/appStoreReviewDetails", {
      data: {
        type: "appStoreReviewDetails",
        attributes: attrs,
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
      },
    });
    ok("Review detail criado");
  } catch (e) {
    warn(`Review detail: ${e.message}`);
  }
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.b}Kindar — App Store Connect Automation${C.r}`);
  console.log(`${C.g}${new Date().toLocaleString()}${C.r}\n`);

  // Find .p8 file
  const p8Name = `AuthKey_${CONFIG.keyId}.p8`;
  const candidates = [
    path.join(process.cwd(), p8Name),
    path.join(process.cwd(), "..", p8Name),
    path.join(process.env.HOME || process.env.USERPROFILE || ".", p8Name),
    path.join(process.env.HOME || process.env.USERPROFILE || ".", "Desktop", p8Name),
    path.join(process.env.HOME || process.env.USERPROFILE || ".", "OneDrive", "Área de Trabalho", p8Name),
    path.join(process.env.HOME || process.env.USERPROFILE || ".", "OneDrive", "Área de Trabalho", "APP CoPais", p8Name),
    path.join(process.env.HOME || process.env.USERPROFILE || ".", "OneDrive", "Área de Trabalho", "APP GripFlow", p8Name),
  ];

  let p8Path = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { p8Path = c; break; }
  }

  if (!p8Path) {
    fail(`${p8Name} não encontrado em nenhum local esperado.`);
    console.log("  Tentei:");
    for (const c of candidates) console.log(`    ${c}`);
    console.log(`\n  Coloque ${p8Name} na mesma pasta deste script e rode de novo.`);
    process.exit(1);
  }

  ok(`Chave: ${p8Path}`);
  _pk = fs.readFileSync(p8Path, "utf8");

  // Test auth
  info("Testando autenticação...");
  try {
    await GET("/apps", { limit: 1 });
    ok("Autenticação OK");
  } catch (e) {
    fail(`Autenticação falhou: ${e.message}`);
    process.exit(1);
  }

  const DRY = process.argv.includes("--dry-run");
  if (DRY) {
    warn("DRY RUN — não fará mudanças\n");
    const appId = await findApp();
    await readGripFlowReference();
    info("Dry run concluído. Rode sem --dry-run para executar.");
    return;
  }

  try {
    const appId = await findApp();
    await readGripFlowReference();
    await configureAppInfo(appId);
    await configureSubscriptions(appId);
    const versionId = await configureVersion(appId);
    await configureReview(versionId);

    section("CONCLUÍDO");
    ok("Automação finalizada. Verifique no ASC:");
    console.log(`\n  https://appstoreconnect.apple.com/apps\n`);
    console.log(`${C.Y}Ações manuais restantes:${C.r}`);
    console.log("  1. Preços de cada subscription (selecionar tier no ASC UI)");
    console.log("  2. App Review Screenshots (upload PNG da tela de pricing)");
    console.log("  3. Privacy Nutrition Labels (questionário no ASC)");
    console.log("  4. Screenshots do app (6.7\", 5.5\")");
    console.log("  5. Submit for Review (botão no ASC)\n");
  } catch (e) {
    fail(`FALHOU: ${e.message}`);
    if (e.body) console.error(JSON.stringify(e.body, null, 2));
    process.exit(1);
  }
}

main();
