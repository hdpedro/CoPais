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
//
// Bundle JS atual inclui:
//   - Soft prompt pre-permission iOS (anti-churn) — não viola native deps
//   - Tela /perfil/notificacoes com 4 groups, send test, reset, deep link
//   - Chat coalescing fix (threadId vs tag — preserva mensagens no Android)
//   - All deps usadas já existem nos binários (expo-notifications, expo-
//     secure-store, @react-native-community/datetimepicker, expo-haptics).
const TARGET_VERSIONS = ["1.0.7", "1.0.8", "1.0.9", "1.0.10", "1.0.11", "1.0.13"];

const args = process.argv.slice(2);
const messageIdx = args.indexOf("--message");
if (messageIdx === -1 || !args[messageIdx + 1]) {
  console.error("Uso: node publish-ota-all-versions.mjs --message \"<mensagem>\"");
  process.exit(1);
}
const baseMessage = args[messageIdx + 1];

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
    console.log(`\n=== Publishing OTA pra runtimeVersion ${v} ===`);
    setVersion(v);
    const msg = `${baseMessage} (${v})`;
    await runEas([
      "update",
      "--branch", "production",
      "--message", msg,
      "--non-interactive",
    ]);
  }
  console.log(`\nOK ${TARGET_VERSIONS.length} OTAs publicadas com sucesso.`);
} finally {
  restore();
}
