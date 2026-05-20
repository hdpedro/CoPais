#!/usr/bin/env node
/**
 * One-shot script — dispara o email de rescue (causa raiz PKCE) pras 5
 * testers que travaram antes do fix.
 *
 * Os 5 usuários JÁ foram auto-confirmados no banco (UPDATE em auth.users).
 * Este script só envia o email humanizado avisando.
 *
 * Rode uma única vez:
 *   node scripts/dispatch-rescue-now.mjs
 *
 * Lê RESEND_API_KEY de .env.local automaticamente.
 *
 * Idempotente no sentido prático: se rodar duas vezes, manda dois e-mails
 * idênticos pros mesmos usuários (sem proteção). Não rode duas vezes a
 * menos que seja necessário.
 *
 * Pra users novos que travarem depois deste momento, o cron hourly
 * `/api/cron/signup-rescue` toma conta automaticamente.
 */
import { config as loadEnv } from "dotenv";
import { Resend } from "resend";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// Tenta .env.local primeiro (dev), fallback .env.production (deploy).
loadEnv({ path: resolve(ROOT, ".env.local") });
if (!process.env.RESEND_API_KEY) {
  loadEnv({ path: resolve(ROOT, ".env.production") });
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.kindar.com.br";
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("ERROR: RESEND_API_KEY not found in .env.local or .env.production");
  console.error("       Set it in one of those files and rerun.");
  process.exit(1);
}

const resend = new Resend(apiKey);

// Os 5 usuários que foram auto-confirmados às 02:13 UTC de 2026-05-20
// via SQL: UPDATE auth.users SET email_confirmed_at = now()
// WHERE lower(email) IN (...).
const RECIPIENTS = [
  { email: "hlustosa.fono@gmail.com", fullName: "Heloisa Lustosa" },
  { email: "andreiacorquiola@gmail.com", fullName: "Andreia Pereira" },
  { email: "barbararitto@gmail.com", fullName: "Bárbara Ritto" },
  { email: "crikacast@gmail.com", fullName: "Cristiane Maria da Silva" },
  { email: "fcaraujo@gmail.com", fullName: "Felipe Costa Araujo" },
];

function firstName(full) {
  if (!full) return "olá";
  const parts = full.trim().split(/\s+/);
  const fn = parts[0] || "olá";
  // Normaliza CAPS LOCK pra Title Case se vier tudo maiúsculo
  if (fn === fn.toUpperCase() && fn.length > 1) {
    return fn[0] + fn.slice(1).toLowerCase();
  }
  return fn;
}

function buildHtml(name) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:24px;font-weight:700;color:#0E0C0A;margin:0">Kindar</h1>
    <p style="font-size:13px;color:#9A8878;margin:4px 0 0">a rotina organizada · para toda a família</p>
  </div>
  <div style="background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid rgba(0,0,0,0.04)">
    <h2 style="font-size:20px;font-weight:700;color:#0E0C0A;margin:0 0 16px">Olá, ${name}</h2>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 16px">
      Identificamos um problema técnico no nosso sistema de confirmação por e-mail que travou seu acesso. Não foi você — foi a gente, e pedimos desculpas pela demora.
    </p>
    <p style="font-size:15px;color:#3E3933;line-height:1.65;margin:0 0 24px">
      <strong>Já corrigimos.</strong> Sua conta está ativa. É só entrar direto — sem precisar reconfirmar nada.
    </p>
    <a href="${APP_URL}/login"
       style="display:block;text-align:center;background:#C07055;color:white;font-size:15px;font-weight:600;padding:14px 24px;border-radius:12px;text-decoration:none;margin:8px 0 24px">
      Entrar agora
    </a>
    <p style="font-size:14px;color:#6B6560;line-height:1.6;margin:0">
      Se algo não funcionar, responda este e-mail. Lemos pessoalmente.
    </p>
  </div>
  <div style="text-align:center;margin-top:24px">
    <p style="font-size:14px;color:#3E3933;margin:0 0 4px">Time Kindar</p>
    <p style="font-size:11px;color:#C4BEB6;margin:16px 0 0">© 2024-2026 Kindar</p>
  </div>
</div>
</body>
</html>`;
}

(async () => {
  const results = [];
  for (const r of RECIPIENTS) {
    const name = firstName(r.fullName);
    try {
      const result = await resend.emails.send({
        from: "Kindar <suporte@kindar.com.br>",
        replyTo: "suporte@kindar.com.br",
        to: r.email,
        subject: "Seu acesso ao Kindar está liberado",
        html: buildHtml(name),
      });
      const id = result?.data?.id;
      const error = result?.error;
      results.push({ email: r.email, name, ok: !error, id, error: error?.message });
      console.log(error ? `✖ ${r.email}: ${error.message}` : `✓ ${r.email} (${id})`);
      // Espaça 250ms entre envios pra não bater rate limit do Resend
      await new Promise((res) => setTimeout(res, 250));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ email: r.email, name, ok: false, error: message });
      console.error(`✖ ${r.email}: ${message}`);
    }
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} sent.`);
  process.exit(ok === results.length ? 0 : 1);
})();
