/**
 * Updates the Stripe webhook to include all events the handler now supports,
 * specifically `customer.subscription.trial_will_end`.
 *
 * Reads STRIPE_SECRET_KEY from a temp env file pulled by `vercel env pull`.
 *
 * Run after pulling env to /tmp/.env.kindar.
 *
 *     vercel env pull /tmp/.env.kindar --yes
 *     node scripts/stripe-webhook-update.mjs
 */
import fs from 'node:fs';

const ENV_PATH = process.env.ENV_PATH || 'C:/Users/henri/AppData/Local/Temp/.env.kindar3';

function loadEnv() {
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  const env = {};
  for (const l of lines) {
    const m = l.match(/^(\w+)="?(.+?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

const WEBHOOK_URL = 'https://kindar.com.br/api/stripe/webhook';

async function main() {
  const env = loadEnv();
  const sk = env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error('STRIPE_SECRET_KEY missing in ' + ENV_PATH);

  // 1. List webhooks
  const list = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', {
    headers: { authorization: 'Bearer ' + sk },
  });
  const lj = await list.json();
  console.log(`Total webhooks: ${(lj.data || []).length}`);
  for (const w of (lj.data || [])) {
    console.log('  ', w.id, w.url, w.status);
  }
  const targets = (lj.data || []).filter((w) => w.url === WEBHOOK_URL);
  console.log(`Found ${targets.length} webhook(s) at ${WEBHOOK_URL}`);

  if (targets.length === 0) {
    console.log('\nCreating new webhook…');
    const params = new URLSearchParams();
    params.append('url', WEBHOOK_URL);
    params.append('description', 'Kindar — sync subscription state to Supabase');
    params.append('api_version', '2025-09-30.clover');
    for (const ev of REQUIRED_EVENTS) params.append('enabled_events[]', ev);
    const r = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + sk,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const j = await r.json();
    if (r.ok) {
      console.log('  ✓ created', j.id);
      console.log('  signing secret:', j.secret);
      console.log('  → set STRIPE_WEBHOOK_SECRET=' + j.secret + ' in Vercel');
    } else {
      console.log('  ✗ FAIL', JSON.stringify(j.error || j, null, 2));
    }
    return;
  }

  for (const w of targets) {
    console.log(`\n${w.id}: ${w.url} (status=${w.status})`);
    const have = new Set(w.enabled_events || []);
    const missing = REQUIRED_EVENTS.filter((e) => !have.has(e));
    if (missing.length === 0) {
      console.log('  ✓ all events already enabled');
      continue;
    }
    console.log('  missing:', missing.join(', '));

    // PATCH to add missing events. Stripe uses application/x-www-form-urlencoded.
    const merged = Array.from(new Set([...(w.enabled_events || []), ...REQUIRED_EVENTS]));
    const params = new URLSearchParams();
    for (const ev of merged) params.append('enabled_events[]', ev);

    const r = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${w.id}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + sk,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const j = await r.json();
    if (r.ok) {
      console.log('  ✓ updated; now has', j.enabled_events.length, 'events');
    } else {
      console.log('  ✗ FAIL', JSON.stringify(j.error || j, null, 2));
    }
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
