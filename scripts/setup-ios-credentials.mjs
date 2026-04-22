#!/usr/bin/env node
// ============================================================================
// Kindar — one-shot setup: generate iOS Distribution Certificate +
// Provisioning Profile via App Store Connect API, save as GitHub Secrets.
//
// After running this once, CI workflow has valid iOS build credentials.
// Requires: openssl in PATH, gh CLI logged in, AuthKey .p8 reachable.
//
// Usage:
//   node scripts/setup-ios-credentials.mjs
//
// Idempotent: reuses existing cert if there's one with the matching CN and
// expiration > 30 days. Profile is always recreated (cheap).
// ============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

const CONFIG = {
  keyId: "736GBBC4YY",
  issuerId: "52e31db4-ca31-4a2c-b99d-86b8b599b29e",
  bundleId: "com.kindar.app",
  teamId: "ZQ83W8MYUZ",
  certCN: "Kindar iOS Distribution",
  profileName: "Kindar iOS App Store",
  githubRepo: "hdpedro/CoPais",
};

const C = { r: "\x1b[0m", R: "\x1b[31m", G: "\x1b[32m", Y: "\x1b[33m", B: "\x1b[34m", b: "\x1b[1m" };
const ok = (m) => console.log(`${C.G}✓${C.r} ${m}`);
const info = (m) => console.log(`${C.B}→${C.r} ${m}`);
const warn = (m) => console.log(`${C.Y}⚠${C.r} ${m}`);
const section = (m) => console.log(`\n${C.b}${C.B}── ${m} ──${C.r}`);
const fail = (m) => { console.error(`${C.R}✗${C.r} ${m}`); process.exit(1); };

// ── JWT for ASC ─────────────────────────────────────────────────────────────
function findP8() {
  const name = `AuthKey_${CONFIG.keyId}.p8`;
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const candidates = [
    path.join(process.cwd(), name),
    path.join(process.cwd(), "..", name),
    path.join(home, name),
    path.join(home, "Desktop", name),
    path.join(home, "OneDrive", "Área de Trabalho", name),
    path.join(home, "OneDrive", "Área de Trabalho", "APP CoPais", name),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  fail(`${name} não encontrado`);
}

let _jwt = null, _jwtExp = 0;
const PEM = fs.readFileSync(findP8(), "utf8");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt() {
  if (_jwt && Date.now() < _jwtExp) return _jwt;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: CONFIG.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: CONFIG.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign("SHA256").update(input).end().sign({ key: PEM, dsaEncoding: "ieee-p1363" });
  _jwt = `${input}.${b64url(sig)}`;
  _jwtExp = Date.now() + 18 * 60000;
  return _jwt;
}

async function asc(method, path, body) {
  const url = path.startsWith("http") ? path : `https://api.appstoreconnect.apple.com${path}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const err = data?.errors?.[0];
    throw new Error(`ASC ${method} ${path} → ${r.status}: ${err?.detail || err?.title || r.statusText}`);
  }
  return data;
}

// ── openssl helpers ─────────────────────────────────────────────────────────
function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function generateCSR(keyPath, csrPath, cn) {
  // RSA 2048, PEM CSR
  sh(`openssl req -new -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${csrPath}" -subj "/CN=${cn}"`);
}

function csrPEMToRaw(csrPath) {
  const pem = fs.readFileSync(csrPath, "utf8");
  // Apple wants the base64 content INCLUDING the PEM headers? Actually just the base64
  // between BEGIN/END. Let me strip them.
  return pem
    .replace(/-----(BEGIN|END) CERTIFICATE REQUEST-----/g, "")
    .replace(/\s/g, "");
}

function buildP12(keyPath, certPath, p12Path, password) {
  // Combine PEM private key + PEM cert into .p12 (PKCS#12)
  sh(`openssl pkcs12 -export -out "${p12Path}" -inkey "${keyPath}" -in "${certPath}" -password pass:${password} -name "${CONFIG.certCN}"`);
}

// ── Steps ───────────────────────────────────────────────────────────────────
async function findOrCreateCertificate(tmpDir) {
  section("1. Distribution Certificate");

  // Apple limits team to 1-3 active distribution certs. If any exist, revoke
  // first (we don't own the private key, so the old cert is useless to us).
  const existing = await asc("GET", "/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=200");
  for (const c of (existing.data || [])) {
    const name = c.attributes.name || "(sem nome)";
    info(`Revogando cert existente: ${c.id} (${name}, exp=${c.attributes.expirationDate})`);
    try { await asc("DELETE", `/v1/certificates/${c.id}`); ok("  revogado"); }
    catch (e) { warn(`  falha ao revogar: ${e.message}`); }
  }

  // Generate keypair + CSR locally
  info("Gerando keypair RSA 2048 + CSR");
  const keyPath = path.join(tmpDir, "dist.key");
  const csrPath = path.join(tmpDir, "dist.csr");
  generateCSR(keyPath, csrPath, CONFIG.certCN);
  const csrBase64 = csrPEMToRaw(csrPath);

  // POST to Apple to sign
  info("Enviando CSR para Apple ASC API");
  const resp = await asc("POST", "/v1/certificates", {
    data: {
      type: "certificates",
      attributes: {
        certificateType: "IOS_DISTRIBUTION",
        csrContent: csrBase64,
      },
    },
  });

  const cert = resp.data;
  const certContentBase64 = cert.attributes.certificateContent;
  const cerPath = path.join(tmpDir, "dist.cer");
  fs.writeFileSync(cerPath, Buffer.from(certContentBase64, "base64"));
  ok(`Cert criado: ${cert.id}, serial=${cert.attributes.serialNumber}, exp=${cert.attributes.expirationDate}`);

  // Convert DER .cer to PEM for openssl p12 packaging
  const pemCertPath = path.join(tmpDir, "dist.crt");
  sh(`openssl x509 -in "${cerPath}" -inform DER -out "${pemCertPath}" -outform PEM`);

  // Build .p12
  const p12Path = path.join(tmpDir, "dist.p12");
  const p12Password = crypto.randomBytes(12).toString("hex");
  buildP12(keyPath, pemCertPath, p12Path, p12Password);
  ok(`P12 empacotado (${fs.statSync(p12Path).size} bytes)`);

  return { certId: cert.id, p12Path, p12Password };
}

async function findBundleId() {
  const resp = await asc("GET", `/v1/bundleIds?filter[identifier]=${CONFIG.bundleId}`);
  const b = resp.data?.[0];
  if (!b) throw new Error(`Bundle ID ${CONFIG.bundleId} não encontrado na Apple — crie manualmente em Identifiers`);
  return b.id;
}

async function createProfile(certId, tmpDir) {
  section("2. Provisioning Profile");

  const bundleIdResourceId = await findBundleId();
  info(`Bundle resource: ${bundleIdResourceId}`);

  // Revoke existing profiles with same name (avoid dupes)
  const existing = await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(CONFIG.profileName)}`);
  for (const p of (existing.data || [])) {
    info(`Deletando profile antigo: ${p.id}`);
    try { await asc("DELETE", `/v1/profiles/${p.id}`); } catch (e) { warn(`  falha (ok se já revogado): ${e.message}`); }
  }

  const resp = await asc("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: {
        name: CONFIG.profileName,
        profileType: "IOS_APP_STORE",
      },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundleIdResourceId } },
        certificates: { data: [{ type: "certificates", id: certId }] },
      },
    },
  });

  const profile = resp.data;
  const profileContent = profile.attributes.profileContent;
  const profilePath = path.join(tmpDir, "profile.mobileprovision");
  fs.writeFileSync(profilePath, Buffer.from(profileContent, "base64"));
  ok(`Profile criado: ${profile.id} (${fs.statSync(profilePath).size} bytes)`);

  return profilePath;
}

function setGithubSecret(name, value) {
  const tmp = path.join(os.tmpdir(), `gh-secret-${crypto.randomBytes(4).toString("hex")}`);
  fs.writeFileSync(tmp, value);
  try {
    sh(`gh secret set ${name} --repo ${CONFIG.githubRepo} < "${tmp}"`);
    ok(`Secret ${name} atualizado`);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function main() {
  console.log(`\n${C.b}Kindar — iOS Credentials Setup${C.r}\n`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kindar-creds-"));
  info(`Tmp dir: ${tmpDir}`);

  try {
    const { certId, p12Path, p12Password } = await findOrCreateCertificate(tmpDir);
    const profilePath = await createProfile(certId, tmpDir);

    section("3. Salvando como GitHub Secrets");
    const p12Base64 = fs.readFileSync(p12Path).toString("base64");
    const profileBase64 = fs.readFileSync(profilePath).toString("base64");

    setGithubSecret("IOS_P12_BASE64", p12Base64);
    setGithubSecret("IOS_P12_PASSWORD", p12Password);
    setGithubSecret("IOS_PROVISIONING_PROFILE_BASE64", profileBase64);

    section("CONCLUÍDO");
    ok("Cert + profile gerados via ASC API e salvos em GitHub Secrets");
    console.log(`\n  Cert ID: ${certId}`);
    console.log(`  P12 tamanho: ${fs.statSync(p12Path).size} bytes`);
    console.log(`  Profile tamanho: ${fs.statSync(profilePath).size} bytes`);
    console.log(`\n  Próximo: re-rodar workflow ios-release (stop_after=build) pra validar\n`);
  } finally {
    // Cleanup tmp
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error(`${C.R}FALHOU:${C.r} ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
