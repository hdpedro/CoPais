import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const statements = [
  `CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, endpoint)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id)`,
  `ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can manage own push subs') THEN CREATE POLICY "Users can manage own push subs" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); END IF; END $$`,
];

async function tryExecSql(sql) {
  // Method 1: pg REST endpoint
  const res = await fetch(supabaseUrl + "/pg/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) return { ok: true, method: "pg/query" };

  // Method 2: Management API
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
  if (res2.ok) return { ok: true, method: "mgmt-api" };

  return { ok: false, status1: res.status, status2: res2.status };
}

async function main() {
  // Check if table already exists
  const { error: testErr } = await supabase.from("push_subscriptions").select("id").limit(0);
  if (!testErr) {
    console.log("✅ Table push_subscriptions already exists!");
    return;
  }

  console.log("Creating push_subscriptions table...\n");

  for (const stmt of statements) {
    const shortName = stmt.substring(0, 60).replace(/\n/g, " ").trim();
    const result = await tryExecSql(stmt);
    if (result.ok) {
      console.log(`✅ ${shortName}... (via ${result.method})`);
    } else {
      console.log(`❌ ${shortName}... (status: ${result.status1}/${result.status2})`);
    }
  }

  // Verify
  console.log("\n--- Verification ---");
  const { error: verifyErr } = await supabase.from("push_subscriptions").select("id").limit(0);
  if (!verifyErr) {
    console.log("✅ push_subscriptions: EXISTS and accessible!");
  } else {
    console.log("❌ push_subscriptions: " + verifyErr.message);
  }
}

main().catch(console.error);
