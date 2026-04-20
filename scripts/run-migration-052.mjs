import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Split migration into idempotent statements
const statements = [
  // Enum type (DO block for IF NOT EXISTS semantics)
  `DO $$ BEGIN
    CREATE TYPE balance_operation_type AS ENUM (
      'debit', 'credit', 'waive', 'gift_day',
      'forgive_balance', 'reset_balance', 'manual_adjustment'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // Main table
  `CREATE TABLE IF NOT EXISTS public.custody_balance_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    operation_type balance_operation_type NOT NULL,
    proposed_by UUID NOT NULL REFERENCES public.profiles(id),
    target_user_id UUID NOT NULL REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    days INTEGER NOT NULL DEFAULT 1,
    direction TEXT NOT NULL
      CHECK (direction IN ('proposer_gains', 'target_gains', 'neutral', 'both_zero')),
    swap_request_id UUID REFERENCES public.swap_requests(id),
    related_date DATE,
    balance_before_proposer INTEGER,
    balance_before_target INTEGER,
    balance_after_proposer INTEGER,
    balance_after_target INTEGER,
    responded_by UUID REFERENCES public.profiles(id),
    responded_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_cbo_group ON public.custody_balance_operations(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cbo_group_status ON public.custody_balance_operations(group_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_cbo_proposed_by ON public.custody_balance_operations(proposed_by)`,

  // RLS
  `ALTER TABLE public.custody_balance_operations ENABLE ROW LEVEL SECURITY`,

  // Policies (drop+create for idempotency)
  `DROP POLICY IF EXISTS "Group members can view balance operations" ON public.custody_balance_operations`,
  `CREATE POLICY "Group members can view balance operations"
    ON public.custody_balance_operations FOR SELECT
    USING (public.is_group_member(group_id))`,

  `DROP POLICY IF EXISTS "Group members can create balance operations" ON public.custody_balance_operations`,
  `CREATE POLICY "Group members can create balance operations"
    ON public.custody_balance_operations FOR INSERT
    WITH CHECK (
      public.is_group_member(group_id)
      AND proposed_by = auth.uid()
    )`,

  `DROP POLICY IF EXISTS "Target or proposer can update balance operations" ON public.custody_balance_operations`,
  `CREATE POLICY "Target or proposer can update balance operations"
    ON public.custody_balance_operations FOR UPDATE
    USING (
      target_user_id = auth.uid() OR proposed_by = auth.uid()
    )`,
];

async function tryExecSql(sql) {
  // Method 1: pg REST endpoint
  try {
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
  } catch {}

  // Method 2: Management API
  try {
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
    return { ok: false, status1: "n/a", status2: res2.status };
  } catch (e) {
    return { ok: false, status1: "err", status2: e.message };
  }
}

async function main() {
  console.log("Running migration 052: custody_balance_operations\n");

  let failures = 0;
  for (const stmt of statements) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ").trim();
    const result = await tryExecSql(stmt);
    if (result.ok) {
      console.log(`OK [${result.method}]: ${shortName}...`);
    } else {
      console.log(`FAIL (${result.status1}/${result.status2}): ${shortName}...`);
      failures++;
    }
  }

  console.log("\n--- Verification ---");
  const { error } = await supabase
    .from("custody_balance_operations")
    .select("id")
    .limit(1);
  if (error) {
    console.log("custody_balance_operations: MISSING —", error.message);
    console.log("\nPlease run the migration manually in Supabase SQL Editor:");
    console.log("  https://supabase.com/dashboard/project/jquaysfeeuwvoydsgssi/sql/new");
    console.log("  File: supabase/migrations/00052_custody_balance_operations.sql");
    process.exit(1);
  } else {
    console.log("custody_balance_operations: EXISTS — Migration successful!");
    if (failures > 0) {
      console.log(`(${failures} statements may have failed but table exists)`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
