/**
 * One-shot WhatsApp setup. Run with:
 *   vercel login          # se token CLI expirou
 *   node scripts/whatsapp-setup.mjs
 *
 * Lê 3 valores do Meta App Dashboard (Phone Number ID, Access Token,
 * App Secret), valida cada um via Graph API, seta os 4 env vars no
 * Vercel (incluindo o WHATSAPP_VERIFY_TOKEN gerado por crypto.randomBytes
 * se ainda não existir), e dispara um redeploy de produção via API.
 *
 * Quando termina, imprime o callback URL + verify token pra colar
 * no Meta App Dashboard → WhatsApp → Configuration → Webhook.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import crypto from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';

const PROJECT_ID = 'prj_iBHn3lRaqyameOBlF27tDyb0k9CI';
const TEAM_ID = 'team_GdjnEujt1G4NjAxcYEhJF0TA';
const APP_ID = '1172044754933319';
const VERIFY_TOKEN_NEW = '4c25f6672bc1bfab437edd8da7af864ae522954534a5af7da1dceacb594c159b';
const CALLBACK_URL = 'https://kindar.com.br/api/whatsapp/webhook';

function readVercelToken() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'AppData', 'Roaming', 'com.vercel.cli', 'Data', 'auth.json'),
    path.join(home, '.local', 'share', 'com.vercel.cli', 'auth.json'),
    path.join(home, 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
  ];
  for (const c of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (j.token) return j.token;
    } catch {}
  }
  return null;
}

async function vercelApi(path, opts = {}) {
  const token = readVercelToken();
  if (!token) throw new Error('Vercel CLI não autenticado. Rode `vercel login` primeiro.');
  const r = await fetch(`https://api.vercel.com${path}`, {
    ...opts,
    headers: {
      authorization: 'Bearer ' + token,
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Vercel ${path}: ${j.error?.message || JSON.stringify(j)}`);
  return j;
}

async function ensureVerifyToken() {
  const env = await vercelApi(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`);
  const existing = (env.envs || []).find((e) => e.key === 'WHATSAPP_VERIFY_TOKEN' && e.target?.includes('production'));
  if (existing) {
    console.log(`  ℹ WHATSAPP_VERIFY_TOKEN ja existe em prod (${existing.id})`);
    return existing.id;
  }
  console.log(`  + criando WHATSAPP_VERIFY_TOKEN`);
  const r = await vercelApi(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    method: 'POST',
    body: JSON.stringify({
      key: 'WHATSAPP_VERIFY_TOKEN',
      value: VERIFY_TOKEN_NEW,
      type: 'encrypted',
      target: ['production'],
    }),
  });
  return r.id;
}

async function upsertEnv(key, value) {
  const env = await vercelApi(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`);
  const matches = (env.envs || []).filter(
    (e) => e.key === key && e.target?.includes('production'),
  );
  for (const m of matches) {
    await vercelApi(`/v9/projects/${PROJECT_ID}/env/${m.id}?teamId=${TEAM_ID}`, {
      method: 'DELETE',
    });
    console.log(`  – removido ${key} antigo (${m.id})`);
  }
  await vercelApi(`/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: ['production'],
    }),
  });
  console.log(`  ✓ ${key} setado (${value.length} chars)`);
}

async function validateAccessToken(token) {
  const r = await fetch(`https://graph.facebook.com/v22.0/debug_token?input_token=${token}&access_token=${token}`);
  const j = await r.json();
  if (j.error) throw new Error(`Token invalido: ${j.error.message}`);
  if (!j.data?.is_valid) throw new Error(`Token nao e valido: ${JSON.stringify(j.data)}`);
  return j.data;
}

async function validatePhoneNumberId(phoneNumberId, token) {
  const r = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}?access_token=${token}`);
  const j = await r.json();
  if (j.error) throw new Error(`Phone Number ID invalido: ${j.error.message}`);
  return j;
}

async function subscribeAppToWaba(wabaId, token) {
  // Subscribe app to receive messages from this WABA.
  const r = await fetch(`https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
  });
  const j = await r.json();
  if (j.error) throw new Error(`Subscribe app falhou: ${j.error.message}`);
  return j;
}

async function configureWebhook(token, verifyToken) {
  // Set callback URL + verify token + subscribed fields on the App.
  const fields = ['messages', 'message_status', 'message_template_status_update'];
  const r = await fetch(
    `https://graph.facebook.com/v22.0/${APP_ID}/subscriptions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        access_token: token,
        object: 'whatsapp_business_account',
        callback_url: CALLBACK_URL,
        verify_token: verifyToken,
        fields: fields.join(','),
      }),
    },
  );
  const j = await r.json();
  if (j.error) throw new Error(`Webhook subscribe falhou: ${j.error.message}`);
  return j;
}

async function triggerRedeploy() {
  // Find the latest production deployment and create a new one from same commit.
  const list = await vercelApi(
    `/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&target=production&limit=1`,
  );
  const last = list.deployments?.[0];
  if (!last) throw new Error('Sem deploy de producao para redeploy');
  console.log(`  ℹ ultimo deploy prod: ${last.uid} (sha ${last.meta?.githubCommitSha?.slice(0, 7)})`);

  const r = await vercelApi(`/v13/deployments?teamId=${TEAM_ID}&forceNew=1`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'kindar',
      target: 'production',
      gitSource: {
        type: 'github',
        repoId: '1184403452',
        ref: 'main',
      },
      project: PROJECT_ID,
    }),
  });
  console.log(`  ✓ redeploy iniciado: ${r.url}`);
  return r;
}

(async () => {
  console.log('\n=== WhatsApp setup automatico ===\n');

  console.log('Cole os 3 valores que voce ve no Meta App Dashboard.');
  console.log('Acesse: https://developers.facebook.com/apps/' + APP_ID + '/whatsapp-business/wa-dev-console/');
  console.log('  1. Phone Number ID (na aba "API Setup", embaixo de "From")');
  console.log('  2. Access Token (System User token permanente, ou temporario de 24h)');
  console.log('  3. App Secret (Configuracoes do app -> Basico -> "Chave secreta do app", clica Mostrar)');
  console.log('');

  const rl = readline.createInterface({ input, output, terminal: true });
  const phoneNumberId = (await rl.question('  Phone Number ID: ')).trim();
  const accessToken = (await rl.question('  Access Token: ')).trim();
  const appSecret = (await rl.question('  App Secret: ')).trim();
  rl.close();

  if (!phoneNumberId || !accessToken || !appSecret) {
    throw new Error('Os 3 valores sao obrigatorios');
  }

  console.log('\n[1/5] Validando Access Token via Graph API...');
  const tokenInfo = await validateAccessToken(accessToken);
  console.log(`  ✓ token valido. App ID: ${tokenInfo.app_id}, type: ${tokenInfo.type}, expires: ${tokenInfo.expires_at === 0 ? 'never' : new Date(tokenInfo.expires_at * 1000).toISOString()}`);
  if (String(tokenInfo.app_id) !== APP_ID) {
    throw new Error(`Token e de outro app (${tokenInfo.app_id}), esperado ${APP_ID}`);
  }

  console.log('\n[2/5] Validando Phone Number ID...');
  const phoneInfo = await validatePhoneNumberId(phoneNumberId, accessToken);
  console.log(`  ✓ numero: ${phoneInfo.display_phone_number} (${phoneInfo.verified_name || 'sem nome verificado'})`);

  console.log('\n[3/5] Setando 4 env vars na Vercel...');
  await ensureVerifyToken();
  await upsertEnv('WHATSAPP_PHONE_NUMBER_ID', phoneNumberId);
  await upsertEnv('WHATSAPP_ACCESS_TOKEN', accessToken);
  await upsertEnv('WHATSAPP_APP_SECRET', appSecret);

  console.log('\n[4/5] Configurando webhook na Meta...');
  await configureWebhook(accessToken, VERIFY_TOKEN_NEW);
  console.log(`  ✓ webhook subscrito: ${CALLBACK_URL}`);

  console.log('\n[5/5] Disparando redeploy de producao na Vercel...');
  await triggerRedeploy();

  console.log('\n=== Pronto ===');
  console.log('Apos o redeploy ficar READY (~1-2min):');
  console.log('  1. Mande qualquer mensagem WhatsApp pro numero Meta-test');
  console.log('  2. Verifique whatsapp_message_logs no Supabase');
  console.log('  3. Lembre de adicionar destinatarios em "API Setup → To" no Meta');
  console.log(`     (numero de teste so manda pra max 5 numeros pre-cadastrados)`);
})().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
