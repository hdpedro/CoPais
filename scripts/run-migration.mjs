import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const sql = `
    ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS start_time TIME;
    ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS end_time TIME;
    ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
  `;

  // Try via pg endpoint
  const res = await fetch(supabaseUrl + "/pg/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": "Bearer " + serviceRoleKey,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) {
    console.log("Migration applied via pg/query!");
    return;
  }

  console.log("pg/query status:", res.status);

  // Fallback: try individual statements via rpc if available
  // Or just check if we can create a function to run the SQL
  const stmts = [
    "ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS start_time TIME",
    "ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS end_time TIME",
    "ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT",
  ];

  for (const stmt of stmts) {
    try {
      const r = await fetch(supabaseUrl + "/rest/v1/rpc/exec_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": "Bearer " + serviceRoleKey,
        },
        body: JSON.stringify({ sql_text: stmt }),
      });
      console.log(`${stmt.substring(0, 60)}... -> ${r.status}`);
    } catch (e) {
      console.log("Error:", e.message);
    }
  }

  // Verify
  const { data, error } = await supabase.from("custody_events").select("start_time").limit(1);
  if (error) {
    console.log("\nMigration FAILED. Please run this SQL in the Supabase SQL Editor:");
    console.log(sql);
  } else {
    console.log("\nMigration verified - columns exist!");
  }
}

run().catch(console.error);
