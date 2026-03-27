import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const statements = [
  // Add CPF and RG to children
  `ALTER TABLE public.children ADD COLUMN IF NOT EXISTS cpf TEXT`,
  `ALTER TABLE public.children ADD COLUMN IF NOT EXISTS rg TEXT`,

  // Create child_education table
  `CREATE TABLE IF NOT EXISTS public.child_education (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    school_name TEXT,
    school_address TEXT,
    school_phone TEXT,
    grade TEXT,
    class_name TEXT,
    teacher_name TEXT,
    coordinator_name TEXT,
    entry_time TIME,
    exit_time TIME,
    extracurricular_activities TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // RLS
  `ALTER TABLE public.child_education ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Group members can view education" ON public.child_education FOR SELECT USING (public.is_group_member(group_id))`,
  `CREATE POLICY "Group members can insert education" ON public.child_education FOR INSERT WITH CHECK (public.is_group_member(group_id))`,
  `CREATE POLICY "Group members can update education" ON public.child_education FOR UPDATE USING (public.is_group_member(group_id))`,

  // Index
  `CREATE INDEX IF NOT EXISTS idx_child_education_child ON public.child_education(child_id)`,
];

async function tryExecSql(sql) {
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

  return { ok: false, status1: res.status, status2: res2.status };
}

async function main() {
  console.log("Running migration 022: Child Profile Tabs\n");

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

  const { data: cpfCheck, error: cpfErr } = await supabase
    .from("children")
    .select("cpf")
    .limit(1);
  console.log(`children.cpf: ${cpfErr ? "MISSING" : "EXISTS"}`);

  const { data: eduCheck, error: eduErr } = await supabase
    .from("child_education")
    .select("id")
    .limit(1);
  console.log(`child_education: ${eduErr ? "MISSING - " + eduErr.message : "EXISTS"}`);
}

main().catch(console.error);
