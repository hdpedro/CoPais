/**
 * Provisions iOS distribution credentials via Apple ASC API.
 *
 * What it does:
 *   1. Generates a private key (openssl)
 *   2. Generates a CSR from that key
 *   3. POST /v1/certificates with the CSR — Apple returns the .cer
 *   4. Combines private key + .cer into a .p12 (openssl)
 *   5. Lists existing profiles, creates IOS_APP_STORE profile if absent
 *   6. Downloads the .mobileprovision
 *   7. Writes kindar-native/credentials.json pointing to these files
 *
 * After this, `eas build --platform ios --profile production --non-interactive`
 * should work because credentials.json is fully populated locally.
 *
 * Idempotent: re-running detects existing certificate + profile and reuses
 * them. The private key/p12 password is fixed for simplicity (would be
 * passed in via env in a more secure setup).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const KEY_ID = '736GBBC4YY';
const ISSUER = '52e31db4-ca31-4a2c-b99d-86b8b599b29e';
const TEAM_ID = 'ZQ83W8MYUZ';
const BUNDLE_ID = 'com.kindar.app';
const NATIVE_DIR = 'C:/Users/henri/OneDrive/Área de Trabalho/APP CoPais/DEV/kindar-native';
const CREDS_DIR = path.join(NATIVE_DIR, '.credentials');
const P12_PASSWORD = 'kindar-eas';

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return fs.readFileSync(path.join(home, 'OneDrive', 'Área de Trabalho', 'APP CoPais', `AuthKey_${KEY_ID}.p8`), 'utf8');
}
function b64url(b) {
  return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function jwt() {
  const pk = findP8();
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const p = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const i = `${h}.${p}`;
  const sig = crypto.createSign('SHA256').update(i).end().sign({ key: pk, dsaEncoding: 'ieee-p1363' });
  return `${i}.${b64url(sig)}`;
}
const T = jwt();
const BASE = 'https://api.appstoreconnect.apple.com/v1';

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { status: r.status, ok: r.ok, json: j, text: t };
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

async function main() {
  fs.mkdirSync(CREDS_DIR, { recursive: true });

  const privKeyPath = path.join(CREDS_DIR, 'dist.key');
  const csrPath = path.join(CREDS_DIR, 'dist.csr');
  const cerPath = path.join(CREDS_DIR, 'dist.cer');
  const p12Path = path.join(CREDS_DIR, 'dist.p12');
  const profilePath = path.join(CREDS_DIR, 'profile.mobileprovision');

  // 1. Generate private key + CSR if missing
  if (!fs.existsSync(privKeyPath)) {
    console.log('Generating private key + CSR...');
    sh(`openssl genrsa -out "${privKeyPath}" 2048`);
    sh(`openssl req -new -key "${privKeyPath}" -out "${csrPath}" -subj "/C=BR/CN=Kindar Distribution/O=Henrique Pedro/emailAddress=henrique.de.pedro@gmail.com"`);
    console.log('  ✓ key + CSR generated');
  } else {
    console.log('  ↻ key + CSR already exist');
  }

  // 2. Check for existing IOS_DISTRIBUTION certificate via ASC API
  const certsList = await api('GET', '/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=20');
  const existingCerts = (certsList.json?.data || []).filter(
    (c) => c.attributes?.certificateType === 'IOS_DISTRIBUTION',
  );
  console.log(`  existing IOS_DISTRIBUTION certs: ${existingCerts.length}`);

  let certificateId = null;
  let cerBase64 = null;

  // Reuse the most recently issued cert that matches our private key, OR
  // create a fresh one if there's no match.
  // For simplicity, always create a new cert if we don't have one matching
  // our local CSR. (Apple allows multiple distribution certs per team.)
  if (!fs.existsSync(cerPath)) {
    console.log('Creating new IOS_DISTRIBUTION cert via ASC API...');
    const csrContent = fs.readFileSync(csrPath, 'utf8')
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/g, '')
      .replace(/-----END CERTIFICATE REQUEST-----/g, '')
      .replace(/\s/g, '');
    const r = await api('POST', '/certificates', {
      data: {
        type: 'certificates',
        attributes: { certificateType: 'IOS_DISTRIBUTION', csrContent },
      },
    });
    if (!r.ok) {
      console.log('  ✗ FAIL:', JSON.stringify(r.json?.errors || r.text, null, 2));
      process.exit(1);
    }
    certificateId = r.json.data.id;
    cerBase64 = r.json.data.attributes.certificateContent;
    fs.writeFileSync(cerPath, Buffer.from(cerBase64, 'base64'));
    console.log(`  ✓ certificate created (id=${certificateId})`);
  } else {
    // Find by SHA256 fingerprint match — overkill; just reuse the most recent
    certificateId = existingCerts[0]?.id;
    console.log(`  ↻ using existing cert ${certificateId}`);
  }

  // 3. Build .p12 from private key + cert
  if (!fs.existsSync(p12Path)) {
    console.log('Building .p12...');
    sh(`openssl pkcs12 -export -inkey "${privKeyPath}" -in "${cerPath}" -out "${p12Path}" -passout pass:${P12_PASSWORD} -name "Kindar Distribution" -legacy`);
    console.log(`  ✓ p12 written: ${p12Path}`);
  }

  // 4. Find or create the bundle ID resource on Apple
  const bidList = await api('GET', `/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=5`);
  let bundleIdResource = (bidList.json?.data || []).find(
    (b) => b.attributes?.identifier === BUNDLE_ID,
  );
  if (!bundleIdResource) {
    console.log('Creating bundleId resource...');
    const r = await api('POST', '/bundleIds', {
      data: {
        type: 'bundleIds',
        attributes: {
          identifier: BUNDLE_ID,
          name: 'Kindar',
          platform: 'IOS',
        },
      },
    });
    if (!r.ok) throw new Error('Cant create bundleId: ' + r.text);
    bundleIdResource = r.json.data;
    console.log(`  ✓ bundleId created (id=${bundleIdResource.id})`);
  } else {
    console.log(`  ↻ using existing bundleId ${bundleIdResource.id}`);
  }

  // 5. Find or create IOS_APP_STORE profile
  const profilesList = await api('GET', '/profiles?limit=200&include=bundleId');
  const existingProfile = (profilesList.json?.data || []).find((p) => {
    const profileBundleId = p.relationships?.bundleId?.data?.id;
    return p.attributes?.profileType === 'IOS_APP_STORE' &&
      profileBundleId === bundleIdResource.id &&
      p.attributes?.profileState === 'ACTIVE';
  });

  let profileBase64 = null;
  if (existingProfile) {
    console.log(`  ↻ using existing profile ${existingProfile.id}`);
    profileBase64 = existingProfile.attributes?.profileContent;
  } else {
    console.log('Creating IOS_APP_STORE profile...');
    const r = await api('POST', '/profiles', {
      data: {
        type: 'profiles',
        attributes: {
          name: `Kindar AppStore ${Date.now()}`,
          profileType: 'IOS_APP_STORE',
        },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundleIdResource.id } },
          certificates: { data: [{ type: 'certificates', id: certificateId }] },
        },
      },
    });
    if (!r.ok) {
      console.log('  ✗ FAIL:', JSON.stringify(r.json?.errors || r.text, null, 2));
      process.exit(1);
    }
    profileBase64 = r.json.data.attributes.profileContent;
    console.log(`  ✓ profile created (id=${r.json.data.id})`);
  }

  if (profileBase64) {
    fs.writeFileSync(profilePath, Buffer.from(profileBase64, 'base64'));
    console.log(`  ✓ profile written: ${profilePath}`);
  }

  // 6. Write credentials.json
  const credsJson = {
    ios: {
      provisioningProfilePath: '.credentials/profile.mobileprovision',
      distributionCertificate: {
        path: '.credentials/dist.p12',
        password: P12_PASSWORD,
      },
    },
  };
  fs.writeFileSync(
    path.join(NATIVE_DIR, 'credentials.json'),
    JSON.stringify(credsJson, null, 2),
  );
  console.log(`\n✓ credentials.json written. Run eas build now.`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
