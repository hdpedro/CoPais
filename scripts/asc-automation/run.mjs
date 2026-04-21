#!/usr/bin/env node
// Kindar — App Store Connect automation
// Runs locally. Needs: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH env vars.

import { AscClient } from "./asc-client.mjs";
import { APP, SUBSCRIPTION_GROUP, SUBSCRIPTIONS, VERSION_METADATA, REVIEW_INFO } from "./config.mjs";
import { findApp, getAppRelationships } from "./modules/find-app.mjs";
import {
  listAppInfos,
  getAppInfoLocalizations,
  setAppCategories,
  updateAppInfoLocalization,
  createAppInfoLocalization,
} from "./modules/app-info.mjs";
import {
  listSubscriptionGroups,
  getSubscriptionsInGroup,
  createSubscriptionGroup,
  addGroupLocalization,
  createSubscription,
  addSubscriptionLocalization,
  getPricePointForTier,
} from "./modules/subscriptions.mjs";
import {
  getLatestVersion,
  getVersionLocalizations,
  updateVersionLocalization,
  createVersionLocalization,
  getReviewDetail,
  createReviewDetail,
  updateReviewDetail,
} from "./modules/version.mjs";

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function log(icon, msg, color = "reset") {
  console.log(`${C[color]}${icon}${C.reset} ${msg}`);
}

const ok = (msg) => log("✓", msg, "green");
const info = (msg) => log("→", msg, "blue");
const warn = (msg) => log("⚠", msg, "yellow");
const err = (msg) => log("✗", msg, "red");
const section = (msg) => console.log(`\n${C.bold}${C.blue}── ${msg} ──${C.reset}`);

// Dry-run support
const DRY_RUN = process.argv.includes("--dry-run");
if (DRY_RUN) warn("DRY RUN MODE — nao fara mudancas reais");

async function loadConfig() {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  let privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH;

  if (!privateKeyPath && keyId) {
    // Try default location relative to CWD
    privateKeyPath = `./AuthKey_${keyId}.p8`;
  }

  if (!keyId || !issuerId || !privateKeyPath) {
    err("Variaveis de ambiente faltando.");
    console.log("\nDefina:");
    console.log("  export ASC_KEY_ID=<seu_key_id>");
    console.log("  export ASC_ISSUER_ID=<seu_issuer_id>");
    console.log("  export ASC_PRIVATE_KEY_PATH=./AuthKey_<KEY_ID>.p8  (ou deixa default)");
    process.exit(1);
  }

  return { keyId, issuerId, privateKeyPath };
}

async function step1_findApp(client) {
  section("1. Encontrando app no ASC");
  info(`Buscando bundle ID: ${APP.bundleId}`);
  const app = await findApp(client, APP.bundleId);
  ok(`App encontrado: "${app.attributes.name}" (ID: ${app.id})`);
  return app;
}

async function step2_configureAppInfo(client, appId) {
  section("2. Configurando info do app (categoria, subtitulo)");

  const appInfos = await listAppInfos(client, appId);
  if (appInfos.length === 0) {
    warn("Nenhum AppInfo editavel encontrado. Pulando esta etapa.");
    return;
  }

  // Use the editable AppInfo (first one is usually the editable version)
  const editable = appInfos.find((ai) =>
    ["READY_FOR_SUBMISSION", "PREPARE_FOR_SUBMISSION"].includes(ai.attributes?.appStoreState)
  ) || appInfos[0];

  info(`Configurando categorias em AppInfo ${editable.id}`);
  if (!DRY_RUN) {
    try {
      await setAppCategories(client, editable.id, {
        primary: APP.primaryCategory,
        secondary: APP.secondaryCategory,
      });
      ok("Categorias: LIFESTYLE / PRODUCTIVITY");
    } catch (e) {
      warn(`Falha nas categorias: ${e.body?.errors?.[0]?.detail || e.message}`);
    }
  }

  info("Atualizando localizacoes do AppInfo");
  const localizations = await getAppInfoLocalizations(client, editable.id);
  const existingLocales = new Set(localizations.map((l) => l.attributes?.locale));

  for (const locale of ["pt-BR", "en-US"]) {
    const attrs = {
      privacyPolicyUrl: APP.privacyPolicyUrl,
      // subtitle is per-version, not per-appInfo
    };
    const existing = localizations.find((l) => l.attributes?.locale === locale);
    if (existing) {
      if (!DRY_RUN) {
        try {
          await updateAppInfoLocalization(client, existing.id, attrs);
          ok(`${locale}: privacy URL atualizada`);
        } catch (e) {
          warn(`${locale} falhou: ${e.body?.errors?.[0]?.detail || e.message}`);
        }
      }
    } else if (!existingLocales.has(locale)) {
      if (!DRY_RUN) {
        try {
          await createAppInfoLocalization(client, editable.id, locale, attrs);
          ok(`${locale}: localization criada`);
        } catch (e) {
          warn(`Criar ${locale} falhou: ${e.body?.errors?.[0]?.detail || e.message}`);
        }
      }
    }
  }
}

async function step3_configureSubscriptions(client, appId) {
  section("3. Configurando subscriptions (IAP)");

  const existingGroups = await listSubscriptionGroups(client, appId);
  info(`${existingGroups.length} grupo(s) existente(s)`);

  // Find or create Kindar Premium group
  let kindarGroup = existingGroups.find(
    (g) => g.attributes?.referenceName === SUBSCRIPTION_GROUP.referenceName
  );

  if (!kindarGroup) {
    info(`Criando grupo "${SUBSCRIPTION_GROUP.referenceName}"...`);
    if (!DRY_RUN) {
      try {
        kindarGroup = await createSubscriptionGroup(client, appId, SUBSCRIPTION_GROUP.referenceName);
        ok(`Grupo criado: ${kindarGroup.id}`);

        // Add localizations
        for (const [locale, cfg] of Object.entries(SUBSCRIPTION_GROUP.localizations)) {
          try {
            await addGroupLocalization(client, kindarGroup.id, locale, cfg.name, cfg.customAppName);
            ok(`  ${locale}: ${cfg.name}`);
          } catch (e) {
            warn(`  ${locale} falhou: ${e.body?.errors?.[0]?.detail || e.message}`);
          }
        }
      } catch (e) {
        err(`Falha ao criar grupo: ${e.body?.errors?.[0]?.detail || e.message}`);
        return;
      }
    }
  } else {
    ok(`Grupo ja existe: ${kindarGroup.id}`);
  }

  if (!kindarGroup) return;

  // List existing subscriptions in group
  const existingSubs = await getSubscriptionsInGroup(client, kindarGroup.id);
  const existingProductIds = new Set(existingSubs.map((s) => s.attributes?.productId));
  info(`${existingSubs.length} subscription(s) no grupo`);
  if (existingSubs.length > 0) {
    for (const s of existingSubs) {
      console.log(`    · ${s.attributes?.productId} (${s.attributes?.state || "?"})`);
    }
  }

  // Create missing subscriptions
  for (const cfg of SUBSCRIPTIONS) {
    if (existingProductIds.has(cfg.productId)) {
      ok(`${cfg.productId} — ja existe`);
      continue;
    }

    info(`Criando ${cfg.productId}...`);
    if (!DRY_RUN) {
      try {
        const sub = await createSubscription(client, kindarGroup.id, cfg);
        ok(`  ID: ${sub.id}`);

        // Localizations
        for (const [locale, loc] of Object.entries(cfg.localizations)) {
          try {
            await addSubscriptionLocalization(client, sub.id, locale, loc.name, loc.description);
            ok(`  ${locale}: ${loc.name}`);
          } catch (e) {
            warn(`  ${locale} localization: ${e.body?.errors?.[0]?.detail || e.message}`);
          }
        }

        // Price point
        try {
          const pricePoint = await getPricePointForTier(client, sub.id, cfg.priceTier, "USA");
          if (pricePoint) {
            ok(`  Price point USA: $${pricePoint.attributes?.customerPrice}`);
            // Note: Actually setting the price requires creating subscriptionPrices with the pricePoint ID
            // This is complex; we leave it for manual review or a future iteration
            warn(`  (Precos precisam ser confirmados manualmente via ASC UI)`);
          }
        } catch (e) {
          warn(`  Price point: ${e.message}`);
        }
      } catch (e) {
        err(`  Falha: ${e.body?.errors?.[0]?.detail || e.message}`);
      }
    }
  }
}

async function step4_configureVersion(client, appId) {
  section("4. Configurando versao atual");

  const version = await getLatestVersion(client, appId);
  if (!version) {
    warn("Nenhuma versao encontrada. Crie uma versao primeiro.");
    return null;
  }

  const state = version.attributes?.appStoreState;
  info(`Versao: ${version.attributes?.versionString} (${state})`);

  const editable = ["PREPARE_FOR_SUBMISSION", "METADATA_REJECTED", "DEVELOPER_REJECTED", "REJECTED", "INVALID_BINARY"].includes(state);
  if (!editable) {
    warn(`Estado "${state}" nao permite edicoes de metadados.`);
    return version;
  }

  // Update localizations
  const localizations = await getVersionLocalizations(client, version.id);
  const byLocale = new Map(localizations.map((l) => [l.attributes?.locale, l]));

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
      if (!DRY_RUN) {
        try {
          await updateVersionLocalization(client, existing.id, attrs);
          ok(`${locale}: metadados atualizados`);
        } catch (e) {
          warn(`${locale} falhou: ${e.body?.errors?.[0]?.detail || e.message}`);
        }
      }
    } else {
      if (!DRY_RUN) {
        try {
          await createVersionLocalization(client, version.id, locale, attrs);
          ok(`${locale}: criado`);
        } catch (e) {
          warn(`Criar ${locale} falhou: ${e.body?.errors?.[0]?.detail || e.message}`);
        }
      }
    }
  }

  return version;
}

async function step5_configureReview(client, versionId) {
  section("5. Configurando Review Information");

  let detail = await getReviewDetail(client, versionId);
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

  if (detail) {
    info(`Atualizando ReviewDetail ${detail.id}...`);
    if (!DRY_RUN) {
      try {
        await updateReviewDetail(client, detail.id, attrs);
        ok("Review details atualizados (conta demo, notas)");
      } catch (e) {
        warn(`Falha: ${e.body?.errors?.[0]?.detail || e.message}`);
      }
    }
  } else {
    info("Criando ReviewDetail...");
    if (!DRY_RUN) {
      try {
        await createReviewDetail(client, versionId, attrs);
        ok("Review details criados");
      } catch (e) {
        warn(`Falha: ${e.body?.errors?.[0]?.detail || e.message}`);
      }
    }
  }
}

async function main() {
  console.log(`\n${C.bold}Kindar — App Store Connect Automation${C.reset}`);
  console.log(`${C.gray}${new Date().toLocaleString()}${C.reset}`);

  const config = await loadConfig();
  ok(`Key ID: ${config.keyId}`);
  ok(`Issuer: ${config.issuerId}`);
  ok(`Key file: ${config.privateKeyPath}`);

  const client = new AscClient(config);

  try {
    const app = await step1_findApp(client);
    await step2_configureAppInfo(client, app.id);
    await step3_configureSubscriptions(client, app.id);
    const version = await step4_configureVersion(client, app.id);
    if (version) {
      await step5_configureReview(client, version.id);
    }

    section("Concluido");
    ok("Execucao finalizada. Verifique no ASC.");
    console.log(`\n  https://appstoreconnect.apple.com/apps`);

    console.log(`\n${C.yellow}Itens que precisam de acao manual (API nao cobre):${C.reset}`);
    console.log("  1. Precos das subscriptions — confirmar no ASC UI");
    console.log("  2. App Review Screenshots — upload de PNG/JPG da tela de pricing");
    console.log("  3. Privacy Nutrition Labels — configurar em App Privacy");
    console.log("  4. Screenshots do app (6.7\", 6.5\") — capturar do simulador");
    console.log("  5. Submit for Review — clicar manualmente apos tudo validado");
  } catch (e) {
    err(`FALHOU: ${e.message}`);
    if (e.body) {
      console.error(JSON.stringify(e.body, null, 2));
    }
    process.exit(1);
  }
}

main();
