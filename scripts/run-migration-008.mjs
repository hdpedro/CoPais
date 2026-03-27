import { readFileSync } from "fs";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

// Split migration into individual statements and run them
const migrationFile = readFileSync("supabase/migrations/00008_missing_tables_and_rls.sql", "utf-8");

// Split by semicolons, filtering out comments and empty lines
const statements = migrationFile
  .split(/;\s*$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith("--"));

async function runSQL(sql) {
  // Try pg/query endpoint
  const res = await fetch(supabaseUrl + "/pg/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
    },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function main() {
  console.log(`Running migration 008 with ${statements.length} statements...\n`);

  let ok = 0, fail = 0;
  for (const stmt of statements) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ").trim();
    const result = await runSQL(stmt);
    if (result.ok) {
      console.log(`  ✅ ${shortName}...`);
      ok++;
    } else {
      console.log(`  ❌ ${shortName}...`);
      console.log(`     Status: ${result.status}, Body: ${result.body.substring(0, 200)}`);
      fail++;
    }
  }

  console.log(`\n--- Results: ${ok} OK, ${fail} FAIL ---`);

  // Verify RLS is enabled
  console.log("\n--- Verification ---");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const table of ["agreements", "events", "school_logs", "sensitive_notes"]) {
    const { data, error } = await supabase.from(table).select("id").limit(1);
    console.log(`  ${table}: ${error ? "❌ " + error.message : "✅ accessible (" + data.length + " rows)"}`);
  }
}

main().catch(console.error);
