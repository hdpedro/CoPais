import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local or export it.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Split SQL files into individual statements
function splitStatements(sql) {
  return sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));
}

async function tryExec(sql) {
  const res = await fetch(supabaseUrl + "/pg/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) return { ok: true };

  const res2 = await fetch(
    `https://api.supabase.com/v1/projects/jquaysfeeuwvoydsgssi/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + serviceRoleKey,
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (res2.ok) return { ok: true };

  const body = await res2.text().catch(() => "");
  return { ok: false, status1: res.status, status2: res2.status, body };
}

async function runMigration(file) {
  console.log(`\n=== ${file} ===`);
  const sql = fs.readFileSync(file, "utf8");

  // Try running the whole file at once first
  const result = await tryExec(sql);
  if (result.ok) {
    console.log("OK: Entire migration applied successfully!");
    return true;
  }

  console.log("Full file failed, trying individual statements...");

  // Fall back to individual statements
  const stmts = splitStatements(sql);
  let allOk = true;
  for (const stmt of stmts) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ");
    const r = await tryExec(stmt + ";");
    if (r.ok) {
      console.log(`  OK: ${shortName}...`);
    } else {
      console.log(`  FAIL: ${shortName}... (${r.status1}/${r.status2}) ${r.body?.substring(0, 100) || ""}`);
      allOk = false;
    }
  }
  return allOk;
}

async function verify() {
  console.log("\n=== Verification ===");

  const tables = [
    "private_notes",
    "decisions",
    "decision_votes",
    "decision_arguments",
    "chat_channels",
    "chat_channel_reads",
  ];

  for (const t of tables) {
    const { error } = await supabase.from(t).select("id").limit(1);
    console.log(`  ${t}: ${error ? "MISSING (" + error.message + ")" : "EXISTS ✅"}`);
  }

  // Check channel_id column on chat_messages
  const { data, error } = await supabase.from("chat_messages").select("channel_id").limit(1);
  console.log(`  chat_messages.channel_id: ${error ? "MISSING" : "EXISTS ✅"}`);
}

async function main() {
  console.log("Running migrations 00019-00021...\n");

  for (const file of [
    "supabase/migrations/00019_private_notes.sql",
    "supabase/migrations/00020_decisions.sql",
    "supabase/migrations/00021_chat_channels.sql",
  ]) {
    await runMigration(file);
  }

  await verify();
  console.log("\nDone!");
}

main().catch(console.error);
