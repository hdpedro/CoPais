#!/usr/bin/env node
/**
 * publish-ota-all-versions.mjs
 *
 * Publica uma OTA pra TODAS as runtimeVersions ativas em paralelo,
 * preservando o `version` original do `app.json` em qualquer cenario
 * (sucesso, falha, Ctrl+C). Substitui o workflow manual de
 * "trocar version no app.json, rodar eas update, restaurar" que era
 * propenso a deixar a version errada se o script abortar no meio.
 *
 * Uso:
 *   node scripts/publish-ota-all-versions.mjs --message "fix(...): ..."
 *   node scripts/publish-ota-all-versions.mjs --message "..." --platform android
 *   node scripts/publish-ota-all-versions.mjs --message "..." --platform ios
 *
 * --platform (Regra 19 — separação inteligente de plataforma):
 *   Sem --platform a OTA atinge iOS E Android no mesmo runtimeVersion. Use
 *   --platform android|ios pra publicar só num sistema (mudança que toca
 *   comportamento nativo de um SO). Sem a flag = ambos, reservado pra
 *   lógica/JS compartilhada e segura nos dois.
 *
 * Por que precisa de trocar version no app.json:
 *   `runtimeVersion.policy: "appVersion"` faz o EAS resolver a
 *   runtimeVersion a partir de `app.json:expo.version` no momento do
 *   bundle. O CLI `eas update` nao aceita flag `--runtime-version`
 *   diretamente, entao precisamos faze-lo escrevendo o valor temporario.
 *
 * Garantias:
 *   - app.json e' restaurado mesmo em erro (try/finally + SIGINT trap)
 *   - Cada publish chega ao seu canal/runtimeVersion certo
 *   - Logs claros pra cada step
 *
 * Premium pattern: idempotente, transactional-like, sem state vazado
 * (a "version" original e' sempre restaurada).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JSON = resolve(__dirname, "..", "app.json");
// Runtimes em produção que recebem OTA. Atualizar quando novo binário for
// promovido pra Play Store / App Store.
//
// Atualizado 2026-05-22:
//   - 1.0.5/1.0.6: removidos do alvo (instalações muito antigas, base
//     decrescente). Caso reapareçam reports, reincluir.
//   - 1.0.7: iOS legado mas ainda live em alguns devices.
//   - 1.0.8/1.0.9/1.0.10: aprovadas anteriores, ainda têm users.
//   - 1.0.11: Skia rebuild (cradle hands splash + constelação 124).
//   - 1.0.12: PULADA — cancelada (DEVELOPER_REJECTED), nunca chegou a users.
//   - 1.0.13: **CURRENT LIVE APP STORE** (release 22-may) — MAIS IMPORTANTE.
//   - 1.0.19: Android internal (vc35/vc36) — base atual dos testers Android
//     (add 2026-06-04). vc36 foi buildado ANTES dos fixes de Saúde, então
//     OTA pra este runtime é necessária pra eles receberem.
//
// Bundle JS atual inclui:
//   - Soft prompt pre-permission iOS (anti-churn) — não viola native deps
//   - Tela /perfil/notificacoes com 4 groups, send test, reset, deep link
//   - Chat coalescing fix (threadId vs tag — preserva mensagens no Android)
//   - Saúde: cards Sangue/Peso/Altura clicáveis + confirmação ao salvar med
//   - All deps usadas já existem nos binários (expo-notifications, expo-
//     secure-store, @react-native-community/datetimepicker, expo-haptics).
//   - 1.0.21: build de EQUALIZAÇÃO (vc38) — LIVE no internal+alpha (2026-06-04).
//     Runtime novo dos testers; OTA aqui entrega os fixes JS pós-build (#82 data
//     passada em Eventos, etc) ao binário vc38.
const TARGET_VERSIONS = ["1.0.7", "1.0.8", "1.0.9", "1.0.10", "1.0.11", "1.0.13", "1.0.19", "1.0.21"];

const args = process.argv.slice(2);
const messageIdx = args.indexOf("--message");
if (messageIdx === -1 || !args[messageIdx + 1]) {
  console.error("Uso: node publish-ota-all-versions.mjs --message \"<mensagem>\"");
  process.exit(1);
}
const baseMessage = args[messageIdx + 1];

// GUARD (incidente 2026-06-29): `eas update` inlina EXPO_PUBLIC_* SÓ de .env
// local (NÃO do bloco build.<profile>.env do eas.json — isso só vale pro
// `eas build`). Publicar sem .env => bundle com Supabase URL/key VAZIAS => app
// nativo serve cache stale em todas as telas + herói some + re-login não cura.
// Abortar AQUI é muito mais barato que descobrir no device. Ver memória
// feedback_eas_update_env_injection.
const ENV_FILE = resolve(__dirname, "..", ".env");
let envContent;
try {
  envContent = readFileSync(ENV_FILE, "utf8");
} catch {
  console.error(
    `\n❌ ABORTADO: ${ENV_FILE} não existe.\n` +
      `   eas update inlina EXPO_PUBLIC_* só de .env local; sem ele o bundle sai com\n` +
      `   Supabase URL/key VAZIAS (app stale, herói some). Gere o .env a partir de\n` +
      `   eas.json:build.production.env antes de publicar.\n`,
  );
  process.exit(1);
}
if (
  !/^EXPO_PUBLIC_SUPABASE_URL=\S/m.test(envContent) ||
  !/^EXPO_PUBLIC_SUPABASE_ANON_KEY=\S/m.test(envContent)
) {
  console.error(
    `\n❌ ABORTADO: ${ENV_FILE} existe mas EXPO_PUBLIC_SUPABASE_URL/ANON_KEY estão` +
      ` ausentes/vazias.\n   Sem elas o cliente Supabase nasce quebrado no bundle.\n`,
  );
  process.exit(1);
}
console.log(`[guard] .env OK (Supabase URL/key presentes) — seguro publicar.`);

// --platform (Regra 19): publica só num SO quando a mudança é de plataforma.
// Sem a flag, o EAS publica pra iOS E Android (default "all" do eas update).
const VALID_PLATFORMS = ["android", "ios", "all"];
const platformIdx = args.indexOf("--platform");
const platform = platformIdx !== -1 ? args[platformIdx + 1] : null;
if (platform && !VALID_PLATFORMS.includes(platform)) {
  console.error(`--platform inválido: "${platform}". Use android | ios | all.`);
  process.exit(1);
}
if (!platform || platform === "all") {
  console.warn(
    "\n⚠️  Sem --platform: a OTA vai pra iOS E Android (mesmo runtimeVersion).\n" +
    "   Use --platform android|ios se a mudança afeta só um sistema (Regra 19).\n"
  );
}

const original = JSON.parse(readFileSync(APP_JSON, "utf8"));
const originalVersion = original.expo.version;

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  const current = JSON.parse(readFileSync(APP_JSON, "utf8"));
  if (current.expo.version !== originalVersion) {
    current.expo.version = originalVersion;
    writeFileSync(APP_JSON, JSON.stringify(current, null, 2) + "\n", "utf8");
    console.log(`\n[restore] app.json version -> ${originalVersion}`);
  }
}

process.on("SIGINT", () => {
  console.log("\n[abort] SIGINT recebido — restaurando app.json...");
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => { restore(); process.exit(143); });
process.on("uncaughtException", (e) => { console.error(e); restore(); process.exit(1); });

function setVersion(v) {
  const j = JSON.parse(readFileSync(APP_JSON, "utf8"));
  j.expo.version = v;
  writeFileSync(APP_JSON, JSON.stringify(j, null, 2) + "\n", "utf8");
}

// Invoca `npx eas-cli update ...` cross-platform sem deixar a shell
// mexer com aspas/espaco nos args. No Windows, `npx` e' .cmd entao usa
// cmd.exe explicito; no POSIX, usa npx direto com shell:false.
function runEas(args) {
  const fullArgs = ["eas-cli", ...args];
  return new Promise((resolveP, rejectP) => {
    let p;
    if (process.platform === "win32") {
      p = spawn("cmd.exe", ["/c", "npx", ...fullArgs], { stdio: "inherit", shell: false });
    } else {
      p = spawn("npx", fullArgs, { stdio: "inherit", shell: false });
    }
    p.on("exit", (code) => code === 0 ? resolveP() : rejectP(new Error(`eas-cli exited ${code}`)));
    p.on("error", rejectP);
  });
}

try {
  for (const v of TARGET_VERSIONS) {
    console.log(`\n=== Publishing OTA [${platform || "all"}] pra runtimeVersion ${v} ===`);
    setVersion(v);
    const msg = platform && platform !== "all"
      ? `${baseMessage} (${v}, ${platform})`
      : `${baseMessage} (${v})`;
    await runEas([
      "update",
      "--branch", "production",
      ...(platform ? ["--platform", platform] : []),
      "--message", msg,
      "--non-interactive",
    ]);
  }
  console.log(`\nOK ${TARGET_VERSIONS.length} OTAs [${platform || "all"}] publicadas com sucesso.`);
} finally {
  restore();
}
