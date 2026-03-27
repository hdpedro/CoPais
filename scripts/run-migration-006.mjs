import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const statements = [
  // 1. Add status column to events table
  `ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,

  // 2. Create custody_schedules table
  `CREATE TABLE IF NOT EXISTS public.custody_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    pattern JSONB NOT NULL,
    start_date DATE NOT NULL,
    months INTEGER NOT NULL DEFAULT 6,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, child_id)
  )`,

  // 3. RLS for custody_schedules
  `ALTER TABLE public.custody_schedules ENABLE ROW LEVEL SECURITY`,

  `CREATE POLICY "Group members can view custody schedules"
    ON public.custody_schedules FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = custody_schedules.group_id
          AND group_members.user_id = auth.uid()
      )
    )`,

  `CREATE POLICY "Group members can insert custody schedules"
    ON public.custody_schedules FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = custody_schedules.group_id
          AND group_members.user_id = auth.uid()
      )
    )`,

  `CREATE POLICY "Group members can update custody schedules"
    ON public.custody_schedules FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_members.group_id = custody_schedules.group_id
          AND group_members.user_id = auth.uid()
      )
    )`,

  // Index for events status
  `CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status)`,
];

async function tryExecSql(sql) {
  try {
    const res = await fetch(supabaseUrl + "/rest/v1/rpc/exec_sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
      },
      body: JSON.stringify({ sql }),
    });
    if (res.ok) return { ok: true };
  } catch {}

  // Fallback: Management API
  try {
    const projectRef = "jquaysfeeuwvoydsgssi";
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + serviceRoleKey,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (res.ok) return { ok: true, method: "mgmt-api" };
    return { ok: false, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log("Running migration 006...\n");

  for (const stmt of statements) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ").trim();
    const result = await tryExecSql(stmt);
    if (result.ok) {
      console.log(`OK: ${shortName}...`);
    } else {
      console.log(`WARN: ${shortName}...`, result);
    }
  }

  // Verify
  console.log("\n--- Verification ---");

  const { data: evtData, error: evtErr } = await supabase
    .from("events")
    .select("status")
    .limit(1);
  console.log(`events.status: ${evtErr ? "MISSING - " + evtErr.message : "EXISTS"}`);

  const { data: schedData, error: schedErr } = await supabase
    .from("custody_schedules")
    .select("id")
    .limit(1);
  console.log(`custody_schedules: ${schedErr ? "MISSING - " + schedErr.message : "EXISTS"}`);
}

main().catch(console.error);
