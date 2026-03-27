import pg from "pg";
import { readFileSync } from "fs";

// Supabase direct connection (pooler mode)
const connectionString =
  "postgresql://postgres.jquaysfeeuwvoydsgssi:CoPais2025%23Sup4base@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  // Try session mode port first (5432), then transaction mode (6543)
  const ports = [6543, 5432];
  let client;

  for (const port of ports) {
    try {
      const connStr = connectionString.replace(`:${port === 5432 ? 6543 : 5432}/`, `:${port}/`);
      console.log(`Trying port ${port}...`);
      client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log(`Connected on port ${port}!\n`);
      break;
    } catch (e) {
      console.log(`Port ${port} failed: ${e.message}`);
      client = null;
    }
  }

  if (!client) {
    // Try direct connection without pooler
    try {
      console.log("Trying direct connection...");
      const directConn = "postgresql://postgres:CoPais2025%23Sup4base@db.jquaysfeeuwvoydsgssi.supabase.co:5432/postgres";
      client = new pg.Client({ connectionString: directConn, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log("Connected directly!\n");
    } catch (e) {
      console.error("All connections failed:", e.message);
      process.exit(1);
    }
  }

  const sql = readFileSync("scripts/migration-008-run-in-supabase.sql", "utf-8");

  try {
    console.log("Running migration 008...\n");
    await client.query(sql);
    console.log("✅ Migration 008 completed successfully!\n");

    // Verify RLS is enabled
    const rlsCheck = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('agreements', 'events', 'school_logs', 'sensitive_notes')
      ORDER BY tablename
    `);
    console.log("RLS Status:");
    rlsCheck.rows.forEach(r => {
      console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? '✅ ENABLED' : '❌ DISABLED'}`);
    });

    // Verify policies
    const policyCheck = await client.query(`
      SELECT tablename, COUNT(*) as policy_count
      FROM pg_policies
      WHERE tablename IN ('agreements', 'events', 'school_logs', 'sensitive_notes')
      GROUP BY tablename
      ORDER BY tablename
    `);
    console.log("\nPolicies:");
    policyCheck.rows.forEach(r => {
      console.log(`  ${r.tablename}: ${r.policy_count} policies`);
    });

    // Verify indexes
    const indexCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
        AND tablename IN ('agreements', 'events', 'school_logs', 'sensitive_notes')
      ORDER BY indexname
    `);
    console.log(`\nIndexes created: ${indexCheck.rows.length}`);
    indexCheck.rows.forEach(r => {
      console.log(`  ✅ ${r.indexname}`);
    });

  } catch (e) {
    console.error("❌ Migration failed:", e.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
