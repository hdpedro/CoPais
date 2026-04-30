/**
 * Sets Vercel env vars via the REST API. The CLI's stdin reader appears
 * to silently swallow the value when the input doesn't end exactly the
 * way the prompt expects, leaving the var stored as empty string. The
 * REST API is more reliable for unattended use.
 *
 * Reads ~/AppData/Roaming/com.vercel.cli/Data/auth.json for the token.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'prj_iBHn3lRaqyameOBlF27tDyb0k9CI';
const TEAM_ID = 'team_GdjnEujt1G4NjAxcYEhJF0TA';

function readToken() {
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
  throw new Error('Vercel auth token not found');
}

const TOKEN = readToken();
const BASE = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;

async function listEnvs() {
  const r = await fetch(BASE, {
    headers: { authorization: 'Bearer ' + TOKEN },
  });
  return (await r.json()).envs || [];
}

async function deleteEnv(id) {
  const r = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${id}?teamId=${TEAM_ID}`,
    { method: 'DELETE', headers: { authorization: 'Bearer ' + TOKEN } },
  );
  return r.ok;
}

async function setEnv(key, value, type = 'encrypted') {
  // Find existing for production target
  const existing = await listEnvs();
  const matches = existing.filter((e) => e.key === key && e.target?.includes('production'));
  for (const m of matches) {
    const ok = await deleteEnv(m.id);
    if (ok) console.log(`  removed existing ${key} (${m.id})`);
  }
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ key, value, type, target: ['production'] }),
  });
  const j = await r.json();
  if (!r.ok) {
    console.log(`  ✗ ${key}: ${JSON.stringify(j.error || j)}`);
    return false;
  }
  console.log(`  ✓ ${key} set (${value.length} chars)`);
  return true;
}

const TO_SET = JSON.parse(process.argv[2] || '{}');

(async () => {
  for (const [key, value] of Object.entries(TO_SET)) {
    if (!value) {
      console.log(`  skip ${key} (empty)`);
      continue;
    }
    await setEnv(key, value);
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
