import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Step 1: Create a temporary exec_sql function
const createFn = `
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

// Step 2: SQL statements to run (one at a time via RPC)
const statements = [
  // INDEXES
  `CREATE INDEX IF NOT EXISTS idx_agreements_group_id ON public.agreements(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agreements_created_by ON public.agreements(created_by)`,
  `CREATE INDEX IF NOT EXISTS idx_events_group_id ON public.events(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status)`,
  `CREATE INDEX IF NOT EXISTS idx_school_logs_group_id ON public.school_logs(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_school_logs_child_id ON public.school_logs(child_id)`,
  `CREATE INDEX IF NOT EXISTS idx_school_logs_log_date ON public.school_logs(log_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sensitive_notes_group_id ON public.sensitive_notes(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sensitive_notes_topic ON public.sensitive_notes(topic)`,
  `CREATE INDEX IF NOT EXISTS idx_sensitive_notes_is_urgent ON public.sensitive_notes(is_urgent)`,

  // ENABLE RLS
  `ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.events ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.school_logs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.sensitive_notes ENABLE ROW LEVEL SECURITY`,

  // AGREEMENTS POLICIES
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can view agreements') THEN CREATE POLICY "Group members can view agreements" ON public.agreements FOR SELECT USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can create agreements') THEN CREATE POLICY "Group members can create agreements" ON public.agreements FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid()); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can update agreements') THEN CREATE POLICY "Group members can update agreements" ON public.agreements FOR UPDATE USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agreements' AND policyname = 'Group members can delete own agreements') THEN CREATE POLICY "Group members can delete own agreements" ON public.agreements FOR DELETE USING (created_by = auth.uid()); END IF; END $$`,

  // EVENTS POLICIES
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can view events') THEN CREATE POLICY "Group members can view events" ON public.events FOR SELECT USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can create events') THEN CREATE POLICY "Group members can create events" ON public.events FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid()); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Group members can update events') THEN CREATE POLICY "Group members can update events" ON public.events FOR UPDATE USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Creators can delete events') THEN CREATE POLICY "Creators can delete events" ON public.events FOR DELETE USING (created_by = auth.uid()); END IF; END $$`,

  // SCHOOL_LOGS POLICIES
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can view school logs') THEN CREATE POLICY "Group members can view school logs" ON public.school_logs FOR SELECT USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can create school logs') THEN CREATE POLICY "Group members can create school logs" ON public.school_logs FOR INSERT WITH CHECK (public.is_group_member(group_id) AND logged_by = auth.uid()); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Group members can update school logs') THEN CREATE POLICY "Group members can update school logs" ON public.school_logs FOR UPDATE USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'school_logs' AND policyname = 'Creators can delete school logs') THEN CREATE POLICY "Creators can delete school logs" ON public.school_logs FOR DELETE USING (logged_by = auth.uid()); END IF; END $$`,

  // SENSITIVE_NOTES POLICIES
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can view sensitive notes') THEN CREATE POLICY "Group members can view sensitive notes" ON public.sensitive_notes FOR SELECT USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can create sensitive notes') THEN CREATE POLICY "Group members can create sensitive notes" ON public.sensitive_notes FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid()); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Group members can update sensitive notes') THEN CREATE POLICY "Group members can update sensitive notes" ON public.sensitive_notes FOR UPDATE USING (public.is_group_member(group_id)); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sensitive_notes' AND policyname = 'Creators can delete sensitive notes') THEN CREATE POLICY "Creators can delete sensitive notes" ON public.sensitive_notes FOR DELETE USING (created_by = auth.uid()); END IF; END $$`,

  // TRIGGER
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_agreements_updated_at') THEN CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); END IF; END $$`,
];

async function main() {
  // Step 1: Create exec_sql function
  console.log("Creating exec_sql function...");
  const { error: fnErr } = await supabase.rpc("exec_sql", { sql: "SELECT 1" });

  if (fnErr) {
    // Function doesn't exist yet, create it via raw fetch
    console.log("exec_sql not found, creating via REST...");
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ sql: createFn }),
    });

    if (!res.ok) {
      // Try creating the function by embedding it in a statement
      console.log("Creating function via alternative method...");
      // We need a way to create the function first. Let's try a workaround.
      // Use the special /pg endpoint
      const pgRes = await fetch(`${supabaseUrl}/pg/query`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: createFn }),
      });

      if (!pgRes.ok) {
        console.log("Cannot create function via /pg either. Trying Supabase SQL API...");

        // Try the Management API
        const mgmtRes = await fetch(
          `https://api.supabase.com/v1/projects/jquaysfeeuwvoydsgssi/database/query`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ query: createFn }),
          }
        );
        if (!mgmtRes.ok) {
          console.log("Management API also failed. Status:", mgmtRes.status);
          console.log("Need to create exec_sql function manually in Supabase SQL Editor.");
          console.log("\nPaste this in SQL Editor first:");
          console.log(createFn);
          console.log("\nThen run this script again.");
          process.exit(1);
        }
      }
    }
  }

  console.log("exec_sql function ready!\n");

  // Step 2: Run each statement
  let ok = 0, fail = 0;
  for (const stmt of statements) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ").trim();
    const { error } = await supabase.rpc("exec_sql", { sql: stmt });
    if (!error) {
      console.log(`  ✅ ${shortName}...`);
      ok++;
    } else {
      console.log(`  ❌ ${shortName}...`);
      console.log(`     Error: ${error.message}`);
      fail++;
    }
  }

  console.log(`\n--- Results: ${ok} OK, ${fail} FAIL ---`);

  // Step 3: Verify
  console.log("\n--- Verification ---");

  // Check RLS
  const { data: rlsData } = await supabase.rpc("exec_sql", {
    sql: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('agreements','events','school_logs','sensitive_notes')`,
  });

  // Check policies count via a simpler query
  for (const table of ["agreements", "events", "school_logs", "sensitive_notes"]) {
    const { data, error } = await supabase.from(table).select("id").limit(1);
    console.log(`  ${table}: ${error ? "❌ " + error.message : "✅ accessible"}`);
  }

  // Cleanup: drop the exec_sql function
  console.log("\nCleaning up exec_sql function...");
  await supabase.rpc("exec_sql", { sql: "DROP FUNCTION IF EXISTS public.exec_sql(text)" });
  console.log("Done!");
}

main().catch(console.error);
