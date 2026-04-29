// Diagnose TestFlight tester state for Kindar.
//
// What it does:
//   1. List all beta groups (internal/external + member counts)
//   2. List all individual testers + their state (INVITED/ACCEPTED/INSTALLED/EXPIRED)
//   3. List the latest 5 iOS builds + their tester/group assignments
//   4. Find Angelino specifically and report what builds he has access to
//
// No mutations — read-only. Run when a tester reports "I'm not getting new builds".

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CONFIG = {
  keyId: "736GBBC4YY",
  issuerId: "52e31db4-ca31-4a2c-b99d-86b8b599b29e",
  appId: "6762701916", // Kindar in App Store Connect
  targetEmail: "angelino.barata@gmail.com",
};

const C = { r: "\x1b[0m", g: "\x1b[32m", y: "\x1b[33m", red: "\x1b[31m", b: "\x1b[1m", d: "\x1b[2m" };

function findP8() {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const candidates = [
    path.join(process.cwd(), `AuthKey_${CONFIG.keyId}.p8`),
    path.join(home, "OneDrive", "Área de Trabalho", "APP CoPais", `AuthKey_${CONFIG.keyId}.p8`),
    path.join(home, "OneDrive", "Área de Trabalho", `AuthKey_${CONFIG.keyId}.p8`),
    path.join(home, "Desktop", `AuthKey_${CONFIG.keyId}.p8`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.error(`${C.d}  Using key: ${c}${C.r}`);
      return fs.readFileSync(c, "utf8");
    }
  }
  throw new Error("AuthKey not found in any candidate path");
}

// Copied verbatim from kindar-asc.mjs (which is known-working).
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt(pk) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: CONFIG.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: CONFIG.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.createSign("SHA256").update(input).end().sign({ key: pk, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

let _token = null;
async function GET(p, params = {}) {
  if (!_token) _token = jwt(findP8());
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.appstoreconnect.apple.com/v1${p}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${_token}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${p}: ${await res.text()}`);
  return res.json();
}

function header(s) { console.log(`\n${C.b}${s}${C.r}\n${"─".repeat(s.length)}`); }
function row(label, value, color = C.r) {
  console.log(`  ${C.d}${label}${C.r} ${color}${value}${C.r}`);
}

async function main() {
  console.log(`${C.b}Kindar — TestFlight Tester Diagnosis${C.r}`);
  console.log(`${C.d}${new Date().toISOString()}${C.r}`);
  console.log(`${C.d}Target: ${CONFIG.targetEmail}${C.r}`);

  // 1. Beta groups
  header("1. Beta Groups");
  const groupsResp = await GET(`/apps/${CONFIG.appId}/betaGroups`, {
    "fields[betaGroups]": "name,isInternalGroup,publicLinkEnabled,publicLinkLimit,createdDate",
    "limit": 50,
  });
  const groups = groupsResp.data || [];
  console.log(`  Total: ${groups.length}`);
  for (const g of groups) {
    const a = g.attributes;
    row(`• ${a.name}`, `${a.isInternalGroup ? "INTERNAL" : "EXTERNAL"} · created ${a.createdDate?.slice(0, 10)}`, a.isInternalGroup ? C.y : C.g);
  }

  // 2. All testers
  header("2. All Individual Testers");
  const testersResp = await GET(`/betaTesters`, {
    "filter[apps]": CONFIG.appId,
    "fields[betaTesters]": "email,firstName,lastName,inviteType,state",
    "include": "betaGroups,apps",
    "limit": 200,
  });
  const testers = testersResp.data || [];
  console.log(`  Total: ${testers.length}`);
  for (const t of testers) {
    const a = t.attributes;
    const fullName = `${a.firstName || ""} ${a.lastName || ""}`.trim() || "(no name)";
    const isAngelino = (a.email || "").toLowerCase() === CONFIG.targetEmail.toLowerCase();
    const color = isAngelino ? C.b + C.g : C.r;
    row(`• ${fullName}`, `${a.email} · state=${a.state || "?"} · invite=${a.inviteType || "?"}${isAngelino ? "  ← TARGET" : ""}`, color);
  }

  // 3. Find target tester
  header(`3. Target tester: ${CONFIG.targetEmail}`);
  const target = testers.find((t) => (t.attributes.email || "").toLowerCase() === CONFIG.targetEmail.toLowerCase());
  if (!target) {
    console.log(`  ${C.red}NOT FOUND in app's tester list. He's not invited to this app yet.${C.r}`);
    console.log(`  Action needed: add ${CONFIG.targetEmail} as individual tester or to a group.`);
    return;
  }
  row("ID", target.id);
  row("State", target.attributes.state, target.attributes.state === "INSTALLED" ? C.g : C.y);
  row("Invite type", target.attributes.inviteType || "?");

  // 3a. Which groups is he in?
  let inGroups = [];
  try {
    const tgResp = await GET(`/betaTesters/${target.id}/betaGroups`, {
      "fields[betaGroups]": "name,isInternalGroup",
      "limit": 50,
    });
    inGroups = tgResp.data || [];
  } catch (e) {
    console.log(`  ${C.y}Could not fetch his groups: ${e.message}${C.r}`);
  }
  if (inGroups.length === 0) {
    console.log(`  ${C.y}Groups: NONE — he's an individual-only tester.${C.r}`);
  } else {
    console.log(`  Groups (${inGroups.length}):`);
    for (const g of inGroups) row(`  •`, `${g.attributes.name} (${g.attributes.isInternalGroup ? "INTERNAL" : "EXTERNAL"})`, C.g);
  }

  // 3b. Which builds are assigned to him individually?
  let buildsForTester = [];
  try {
    const bResp = await GET(`/betaTesters/${target.id}/builds`, {
      "fields[builds]": "version,uploadedDate,processingState,expired",
      "limit": 50,
    });
    buildsForTester = bResp.data || [];
  } catch (e) {
    console.log(`  ${C.y}Could not fetch his builds: ${e.message}${C.r}`);
  }
  console.log(`  Builds individually assigned (${buildsForTester.length}):`);
  for (const b of buildsForTester) {
    const a = b.attributes;
    const c = a.expired ? C.red : (a.processingState === "VALID" ? C.g : C.y);
    row(`  •`, `v${a.version} · state=${a.processingState} · uploaded=${a.uploadedDate?.slice(0, 10)}${a.expired ? " · EXPIRED" : ""}`, c);
  }

  // 4. Latest 5 builds
  header("4. Latest 5 iOS Builds");
  const buildsResp = await GET(`/builds`, {
    "filter[app]": CONFIG.appId,
    "fields[builds]": "version,uploadedDate,processingState,expired,usesNonExemptEncryption",
    "sort": "-uploadedDate",
    "limit": 5,
  });
  const builds = buildsResp.data || [];
  for (const b of builds) {
    const a = b.attributes;
    const c = a.expired ? C.red : (a.processingState === "VALID" ? C.g : C.y);
    row(`• v${a.version} (${b.id})`, `state=${a.processingState} · uploaded=${a.uploadedDate?.slice(0, 16).replace("T", " ")}${a.expired ? " · EXPIRED" : ""}`, c);

    // 4a. Which testers does this build have?
    try {
      const itResp = await GET(`/builds/${b.id}/individualTesters`, {
        "fields[betaTesters]": "email,firstName,lastName",
        "limit": 200,
      });
      const it = itResp.data || [];
      const hasAngelino = it.some((t) => (t.attributes.email || "").toLowerCase() === CONFIG.targetEmail.toLowerCase());
      row(`    individualTesters`, `${it.length} (Angelino: ${hasAngelino ? `${C.g}YES` : `${C.red}NO`}${C.r})`);
    } catch (e) {
      row(`    individualTesters`, `(error: ${e.message})`, C.y);
    }

    // 4b. Which groups does this build have?
    try {
      const bgResp = await GET(`/builds/${b.id}/betaGroups`, {
        "fields[betaGroups]": "name,isInternalGroup",
        "limit": 50,
      });
      const bg = bgResp.data || [];
      row(`    betaGroups`, bg.length > 0 ? bg.map((g) => `${g.attributes.name}${g.attributes.isInternalGroup ? "(int)" : "(ext)"}`).join(", ") : "(none)");
    } catch (e) {
      row(`    betaGroups`, `(error: ${e.message})`, C.y);
    }

    // 4c. buildBetaDetails — autoNotifyEnabled + externalBuildState
    try {
      const bbdResp = await GET(`/builds/${b.id}/buildBetaDetail`);
      const bbd = bbdResp.data?.attributes;
      if (bbd) {
        row(`    buildBetaDetail`, `autoNotify=${bbd.autoNotifyEnabled} · external=${bbd.externalBuildState || "?"} · internal=${bbd.internalBuildState || "?"}`);
      }
    } catch (e) {
      row(`    buildBetaDetail`, `(error: ${e.message})`, C.y);
    }
  }

  console.log(`\n${C.b}Done.${C.r}\n`);
}

main().catch((e) => {
  console.error(`${C.red}ERROR: ${e.message}${C.r}`);
  process.exit(1);
});
