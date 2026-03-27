import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = "https://jquaysfeeuwvoydsgssi.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const statements = [
  `CREATE TABLE IF NOT EXISTS public.activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.child_activities(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    reported_by UUID NOT NULL REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'missed', 'cancelled')),
    notes TEXT,
    child_mood TEXT CHECK (child_mood IN ('happy', 'neutral', 'sad', 'anxious', 'tired')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(activity_id, occurrence_date)
  )`,
  `ALTER TABLE public.activity_reports ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Group members can view reports" ON public.activity_reports FOR SELECT USING (public.is_group_member(group_id))`,
  `CREATE POLICY "Group members can insert reports" ON public.activity_reports FOR INSERT WITH CHECK (public.is_group_member(group_id))`,
  `CREATE INDEX IF NOT EXISTS idx_activity_reports_group ON public.activity_reports(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_reports_activity_date ON public.activity_reports(activity_id, occurrence_date)`,
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
  console.log("Running migration 023: activity_reports\n");

  for (const stmt of statements) {
    const shortName = stmt.substring(0, 80).replace(/\n/g, " ").trim();
    const result = await tryExecSql(stmt);
    if (result.ok) {
      console.log(`OK [${result.method}]: ${shortName}...`);
    } else {
      console.log(`FAIL (${result.status1}/${result.status2}): ${shortName}...`);
    }
  }

  // Verify
  console.log("\n--- Verification ---");
  const { data, error } = await supabase
    .from("activity_reports")
    .select("id")
    .limit(1);
  if (error) {
    console.log("activity_reports: MISSING -", error.message);
    console.log("\nPlease run the SQL manually in Supabase SQL Editor.");
  } else {
    console.log("activity_reports: EXISTS - Migration successful!");
  }
}

main().catch(console.error);
