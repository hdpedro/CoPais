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
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JSON = resolve(__dirname, "..", "app.json");
const TARGET_VERSIONS = ["1.0.2", "1.0.3", "1.0.4"];

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

function run(cmd, args) {
  return new Promise((resolveP, rejectP) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    p.on("exit", (code) => code === 0 ? resolveP() : rejectP(new Error(`${cmd} exited ${code}`)));
    p.on("error", rejectP);
  });
}

try {
  for (const v of TARGET_VERSIONS) {
    console.log(`\n=== Publishing OTA pra runtimeVersion ${v} ===`);
    setVersion(v);
    const msg = `${baseMessage} (${v})`;
    await run("npx", [
      "eas-cli", "update",
      "--branch", "production",
      "--message", msg,
      "--non-interactive",
    ]);
  }
  console.log(`\nOK ${TARGET_VERSIONS.length} OTAs publicadas com sucesso.`);
} finally {
  restore();
}
