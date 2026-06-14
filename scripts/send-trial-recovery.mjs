/**
 * Envio one-shot do e-mail de recuperação de degustação — pros grupos que o
 * bug de 11-22/mai deixou sem trial (corrigido + trials concedidos no banco).
 *
 * SEGURANÇA (e-mail pra cliente real é IRREVERSÍVEL):
 *   - Lê a lista do CSV FORA do repo (zero PII neste script / no Git).
 *   - Auto-exclui linhas marcadas "NAO ENVIAR" (teste + duplicata) e
 *     "FAMILIAR" (parentes do fundador) na coluna observacao.
 *   - Modo padrão = DRY-RUN (imprime a lista, NÃO envia).
 *   - `--test`  → envia UM e-mail só pro fundador (henrique.de.pedro@gmail.com).
 *   - `--send`  → envia o lote real (sequencial, com intervalo).
 *
 * Uso (rodar de dentro de DEV/):
 *   node scripts/send-trial-recovery.mjs            # dry-run (lista)
 *   node scripts/send-trial-recovery.mjs --test     # teste pro fundador
 *   node scripts/send-trial-recovery.mjs --send      # lote real
 *
 * On-brand: mesmo layout dos transacionais (welcome/signup-rescue) —
 * from "Kindar <suporte@kindar.com.br>", header Kindar, card branco, botão
 * terracota #C07055. Copy pt-BR (todos os 35 destinatários são locale pt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Resend } from "resend";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Config ----
const FROM = "Kindar <suporte@kindar.com.br>";
const REPLY_TO = "suporte@kindar.com.br";
const SUBJECT = "Seu Premium do Kindar está ativo — e a conta é nossa";
const APP_URL = "https://www.kindar.com.br";
const FOUNDER_TEST_EMAIL = "henrique.de.pedro@gmail.com";
const CSV_PATH = resolve(__dirname, "../../recuperacao-trial-40-contatos.csv");
const SEND_DELAY_MS = 700; // ~1,4 e-mails/s — folgado pro rate limit do Resend

// ---- Carrega RESEND_API_KEY do .env.production (não commitado) ----
function loadResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  for (const f of [".env.local", ".env", ".env.production"]) {
    try {
      const raw = readFileSync(resolve(__dirname, "..", f), "utf8");
      const m = raw.match(/^RESEND_API_KEY=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      /* arquivo não existe — segue */
    }
  }
  throw new Error("RESEND_API_KEY não encontrada (.env.production / .env.local / env)");
}

// ---- Lê + filtra a lista do CSV ----
function loadRecipients() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  lines.shift(); // header
  const out = [];
  for (const line of lines) {
    const fields = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (fields.length < 5) continue;
    const [nome, email, , , obs] = fields;
    // Auto-exclusão: teste/duplicata (NAO ENVIAR) + parentes (FAMILIAR).
    if (/NAO ENVIAR|FAMILIAR/i.test(obs)) continue;
    const firstRaw = (nome || "").trim().split(/\s+/)[0] || "";
    const firstName =
      firstRaw && !/^\(/.test(firstRaw)
        ? firstRaw.charAt(0).toUpperCase() + firstRaw.slice(1)
        : null;
    out.push({ email, firstName });
  }
  return out;
}

// ---- HTML on-brand ----
function buildHtml(firstName) {
  const greeting = firstName ? `Oi, ${firstName}!` : "Oi! 👋";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">A rotina de quem você cuida, num lugar só.</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 16px">${greeting}</h2>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 16px">
      Quando você criou seu espaço no Kindar, deveria ter recebido na hora
      <strong>2 meses de Premium, de graça</strong>. Por uma falha nossa, isso
      não aconteceu — e a responsabilidade é inteiramente nossa.
    </p>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 16px">
      Já corrigimos. E queremos fazer certo com você:
      <strong>seu Premium Jurídico está ativo agora, válido até 31 de julho.</strong>
      Sem cartão, sem pegadinha. É só abrir o app.
    </p>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
      Com ele, tudo o que importa na rotina das crianças fica num lugar só —
      calendário e guarda compartilhada, saúde e vacinas, despesas divididas com
      clareza — e você ainda conta com <strong>suporte jurídico</strong> quando
      precisar.
    </p>
    <a href="${APP_URL}/login"
       style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin:8px 0 24px">
      Abrir o Kindar
    </a>
    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0">
      Qualquer dúvida, é só responder este e-mail — eu leio pessoalmente.
    </p>
  </div>
  <div style="text-align:center;margin-top:24px">
    <p style="font-size:14px;color:#3E3933;margin:0 0 2px">Um abraço,</p>
    <p style="font-size:14px;color:#3E3933;font-weight:600;margin:0">Henrique — Kindar</p>
    <p style="font-size:11px;color:#C4BEB6;margin:16px 0 0">© 2024-2026 Kindar · kindar.com.br</p>
  </div>
</div>
</body>
</html>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mode = process.argv.includes("--send")
    ? "send"
    : process.argv.includes("--test")
      ? "test"
      : "dry";

  const recipients = loadRecipients();
  console.log(`\nCSV: ${CSV_PATH}`);
  console.log(`Destinatários após filtro (excluído teste/duplicata/família): ${recipients.length}\n`);

  // --export → gera o CSV de audiência pro Resend (header email,first_name,last_name).
  if (process.argv.includes("--export")) {
    const out = resolve(__dirname, "../../resend-audience-35.csv");
    const lines = ["email,first_name,last_name"];
    for (const r of recipients) lines.push(`${r.email},${r.firstName ?? ""},`);
    writeFileSync(out, lines.join("\n") + "\n");
    console.log(`✅ Exportado ${recipients.length} contatos → ${out}\n`);
    return;
  }

  if (mode === "dry") {
    recipients.forEach((r, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${r.firstName ?? "(sem nome)"} <${r.email}>`),
    );
    console.log(`\nDRY-RUN — nada enviado. Use --test (pro fundador) ou --send (lote).\n`);
    return;
  }

  const resend = new Resend(loadResendKey());

  if (mode === "test") {
    console.log(`Enviando TESTE pro fundador (${FOUNDER_TEST_EMAIL})...`);
    const { error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: FOUNDER_TEST_EMAIL,
      subject: `[TESTE] ${SUBJECT}`,
      html: buildHtml("Henrique"),
    });
    console.log(error ? `❌ Falhou: ${JSON.stringify(error)}` : `✅ Teste enviado. Confere a caixa.`);
    return;
  }

  // mode === "send"
  console.log(`🚀 Enviando lote real pra ${recipients.length} destinatários...\n`);
  let ok = 0;
  let fail = 0;
  for (const r of recipients) {
    const { error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: r.email,
      subject: SUBJECT,
      html: buildHtml(r.firstName),
    });
    if (error) {
      fail++;
      console.log(`  ❌ ${r.email}: ${JSON.stringify(error)}`);
    } else {
      ok++;
      console.log(`  ✅ ${r.email}`);
    }
    await sleep(SEND_DELAY_MS);
  }
  console.log(`\nFim: ${ok} enviados, ${fail} falharam.\n`);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
