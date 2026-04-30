const SK = process.env.SK || '';
const URL_TARGET = 'https://kindar.com.br/api/stripe/webhook';
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

if (!SK) { console.error('SK env missing'); process.exit(1); }

const list = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', {
  headers: { authorization: 'Bearer ' + SK },
});
const j = await list.json();
console.log('Existing webhooks:', (j.data || []).length);
for (const w of (j.data || [])) console.log(' ', w.id, w.url);

// Delete any existing webhook on the same URL first.
for (const w of (j.data || [])) {
  if (w.url === URL_TARGET) {
    const d = await fetch('https://api.stripe.com/v1/webhook_endpoints/' + w.id, {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + SK },
    });
    console.log('Deleted existing:', w.id, d.status);
  }
}

const params = new URLSearchParams();
params.append('url', URL_TARGET);
params.append('description', 'Kindar — sync subscription state to Supabase');
for (const ev of EVENTS) params.append('enabled_events[]', ev);

const r = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
  method: 'POST',
  headers: {
    authorization: 'Bearer ' + SK,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: params.toString(),
});
const result = await r.json();
if (r.ok) {
  console.log('\nCREATED:', result.id);
  console.log('SIGNING_SECRET:', result.secret);
  console.log('Events:', result.enabled_events.length);
} else {
  console.log('FAIL:', JSON.stringify(result, null, 2));
}
