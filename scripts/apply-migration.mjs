import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Individual DDL statements to try via different methods
const statements = [
  // calendar_tokens table
  `CREATE TABLE IF NOT EXISTS public.calendar_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, group_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_tokens_token ON public.calendar_tokens(token)`,
  `ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY`,

  // custody_events new columns
  `ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS start_time TIME`,
  `ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS end_time TIME`,
  `ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE public.custody_events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT`,

  // daily_checkins table
  `CREATE TABLE IF NOT EXISTS public.daily_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    logged_by UUID NOT NULL REFERENCES public.profiles(id),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_checkins_group_date ON public.daily_checkins(group_id, checkin_date DESC)`,
  `ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY`,
];

async function tryExecSql(sql) {
  // Method 1: Try pg REST endpoint
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

  // Method 2: Try Management API query endpoint
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

  return { ok: false, status1: res.status, status2: res2.status };
}

async function main() {
  console.log("Attempting migration...\n");

  for (const stmt of statements) {
    const shortName = stmt.substring(0, 70).replace(/\n/g, " ");
    const result = await tryExecSql(stmt);
    if (result.ok) {
      console.log(`OK: ${shortName}...`);
    } else {
      console.log(`FAIL: ${shortName}... (${result.status1}/${result.status2})`);
    }
  }

  // Verify
  console.log("\n--- Verification ---");
  for (const t of ["calendar_tokens", "daily_checkins"]) {
    const { data, error } = await supabase.from(t).select("id").limit(1);
    console.log(`${t}: ${error ? "MISSING - " + error.message : "EXISTS"}`);
  }
  const { data, error } = await supabase
    .from("custody_events")
    .select("start_time")
    .limit(1);
  console.log(
    `custody_events.start_time: ${error ? "MISSING" : "EXISTS"}`
  );
}

main().catch(console.error);
