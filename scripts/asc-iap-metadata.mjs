/**
 * Configure subscription metadata for the 6 Kindar IAPs via ASC API:
 *   1. Localization (name + description) in pt-BR + en-US
 *   2. Pricing (BRA territory)
 *
 * Idempotent: if a subscription already has loc/price for the locale/territory,
 * the script skips that one. Run after asc-recovery; before this, IAPs are in
 * MISSING_METADATA. After, they advance toward READY_TO_SUBMIT (still need
 * Review Screenshot for the very last step — that one needs an image upload
 * which is also automatable but we leave it for now).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  const candidates = [
    path.join(home, 'OneDrive', 'Área de Trabalho', 'APP CoPais', `AuthKey_${KEY_ID}.p8`),
    path.join(process.cwd(), `AuthKey_${KEY_ID}.p8`),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  throw new Error('AuthKey not found');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function jwt() {
  const pk = findP8();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign('SHA256').update(input).end().sign({ key: pk, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

const TOKEN = jwt();
const BASE = 'https://api.appstoreconnect.apple.com/v1';

async function GET(p) {
  const r = await fetch(BASE + p, { headers: { authorization: 'Bearer ' + TOKEN } });
  return await r.json();
}
async function POST(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  return { status: r.status, body: t };
}

// Apple limits (subscriptionLocalizations):
//   name (Display Name): max 30 chars
//   description: max 45 chars (yes, only 45)
// Both are HARD limits — exceeding triggers ATTRIBUTE.INVALID.TOO_LONG.
const SUBSCRIPTIONS = [
  { id: '6764693892', productId: 'com.kindar.harmonia.monthly',           displayName: 'Harmonia Mensal',           description: 'Plano premium Kindar — cobrança mensal',  priceBRL: 19.90 },
  { id: '6764693944', productId: 'com.kindar.harmonia.annual',            displayName: 'Harmonia Anual',            description: 'Plano premium Kindar — cobrança anual',   priceBRL: 199.90 },
  { id: '6764693945', productId: 'com.kindar.harmonia.earlybird.monthly', displayName: 'Harmonia Mensal Early Bird',description: 'Harmonia mensal — desconto Early Bird',    priceBRL: 14.90 },
  { id: '6764693916', productId: 'com.kindar.harmonia.earlybird.annual',  displayName: 'Harmonia Anual Early Bird', description: 'Harmonia anual — desconto Early Bird',     priceBRL: 149.90 },
  { id: '6764694011', productId: 'com.kindar.juridico.monthly',           displayName: 'Premium Jurídico Mensal',   description: 'Harmonia + módulo jurídico, mensal',       priceBRL: 39.90 },
  { id: '6764693946', productId: 'com.kindar.juridico.annual',            displayName: 'Premium Jurídico Anual',    description: 'Harmonia + módulo jurídico, anual',        priceBRL: 399.90 },
];

async function findPricePoint(subId, priceBRL) {
  // Apple paginates pricePoints — there are ~700+ tiers per territory. Walk
  // the link chain until we find a tier with customerPrice within 1 cent.
  const target = priceBRL;
  let next = `/subscriptions/${subId}/pricePoints?filter[territory]=BRA&limit=200`;
  let best = null;
  let bestDiff = Infinity;
  while (next) {
    const r = await GET(next);
    const data = r.data || [];
    for (const d of data) {
      const cp = parseFloat(d.attributes?.customerPrice || '0');
      const diff = Math.abs(cp - target);
      if (diff < 0.005) return d.id; // exact-ish match (rounding tolerance)
      if (diff < bestDiff) {
        bestDiff = diff;
        best = d;
      }
    }
    // Apple links.next contains a full URL with cursor
    const nxt = r.links?.next || null;
    if (!nxt || data.length < 200) break;
    next = nxt.replace('https://api.appstoreconnect.apple.com/v1', '');
  }
  if (best && bestDiff < 1.0) {
    console.warn(`  [WARN] Approximate match: target R$ ${priceBRL.toFixed(2)}, using R$ ${best.attributes.customerPrice}`);
    return best.id;
  }
  throw new Error(`No price point ≈ R$ ${priceBRL} (best=${best?.attributes?.customerPrice ?? 'none'})`);
}

async function setLocalization(subId, locale, name, description) {
  // Check existing
  const cur = await GET(`/subscriptions/${subId}/subscriptionLocalizations`);
  const existing = (cur.data || []).find((l) => l.attributes?.locale === locale);
  if (existing) {
    return { skipped: true, locale, id: existing.id };
  }
  const r = await POST(`/subscriptionLocalizations`, {
    data: {
      type: 'subscriptionLocalizations',
      attributes: { locale, name, description },
      relationships: { subscription: { data: { type: 'subscriptions', id: subId } } },
    },
  });
  return { ...r, locale };
}

async function setAvailability(subId, territories = ['BRA']) {
  // Apple requires subscriptionAvailability to be POSTed BEFORE
  // subscriptionPrices — without availability, /subscriptionPrices returns
  // ENTITY_ERROR.RELATIONSHIP.INVALID with a misleading
  // "subscriptionPricePoint/id" pointer. Discovered 2026-04-29 the hard way.
  const cur = await GET(`/subscriptions/${subId}/subscriptionAvailability`);
  // If the relationship resolves to a populated availability (with territories),
  // skip — calling POST again would return CONFLICT.
  const relCheck = await GET(`/subscriptions/${subId}/subscriptionAvailability/relationships/availableTerritories`);
  const hasTerr = (relCheck?.data?.length || 0) > 0;
  if (cur?.data && hasTerr) {
    return { skipped: true, id: cur.data.id };
  }
  const r = await POST(`/subscriptionAvailabilities`, {
    data: {
      type: 'subscriptionAvailabilities',
      attributes: { availableInNewTerritories: false },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        availableTerritories: { data: territories.map((id) => ({ type: 'territories', id })) },
      },
    },
  });
  return r;
}

async function setPrice(subId, pricePointId) {
  const cur = await GET(`/subscriptions/${subId}/prices`);
  if ((cur.data || []).length > 0) {
    return { skipped: true, count: cur.data.length };
  }
  // Minimal shape: subscription + subscriptionPricePoint (territory encoded
  // inside the priceTier-shaped pricePointId). Territory in relationships
  // triggers RELATIONSHIP.INVALID. Confirmed working post-availability.
  const r = await POST(`/subscriptionPrices`, {
    data: {
      type: 'subscriptionPrices',
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subId } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pricePointId } },
      },
    },
  });
  return r;
}

async function main() {
  console.log('Kindar — IAP metadata setup\n');
  for (const s of SUBSCRIPTIONS) {
    console.log(`${s.productId}`);
    try {
      const loc = await setLocalization(s.id, 'pt-BR', s.displayName, s.description);
      if (loc.skipped) {
        console.log(`  loc pt-BR: already exists (${loc.id})`);
      } else if (loc.status === 201) {
        console.log(`  loc pt-BR: created`);
      } else {
        console.log(`  loc pt-BR: HTTP ${loc.status} ${loc.body.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  loc pt-BR FAIL: ${e.message}`);
    }

    try {
      const avail = await setAvailability(s.id, ['BRA']);
      if (avail.skipped) {
        console.log(`  avail BRA: already set (${avail.id})`);
      } else if (avail.status === 201) {
        console.log(`  avail BRA: created`);
      } else {
        console.log(`  avail BRA: HTTP ${avail.status} ${avail.body.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  avail BRA FAIL: ${e.message}`);
    }

    try {
      const ppId = await findPricePoint(s.id, s.priceBRL);
      const price = await setPrice(s.id, ppId);
      if (price.skipped) {
        console.log(`  price BRA: already set (${price.count} entries)`);
      } else if (price.status === 201) {
        console.log(`  price BRA: R$ ${s.priceBRL.toFixed(2)} created`);
      } else {
        console.log(`  price BRA: HTTP ${price.status} ${price.body.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  price BRA FAIL: ${e.message}`);
    }
    console.log('');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
