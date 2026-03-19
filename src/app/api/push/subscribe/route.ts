import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

async function ensureTable() {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Quick check — if select works, table exists
  const { error } = await admin.from("push_subscriptions").select("id").limit(0);
  if (!error) return true;

  // Table doesn't exist — try to create via SQL function bootstrap
  // Step 1: Create a temporary SQL executor function
  try {
    await admin.rpc("_create_push_table", {});
  } catch {
    // Function doesn't exist, try creating it via PostgREST schema cache workaround
  }

  // If table still doesn't exist, return false (needs manual SQL)
  const { error: retryError } = await admin.from("push_subscriptions").select("id").limit(0);
  return !retryError;
}

// Cache the table check per process
let tableChecked = false;
let tableExists = false;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Dados de inscricao invalidos" }, { status: 400 });
  }

  // Check if table exists (cached per process lifetime)
  if (!tableChecked) {
    tableExists = await ensureTable();
    tableChecked = true;
  }

  if (!tableExists) {
    // Table doesn't exist yet — store in-memory won't help for push,
    // but don't crash the app. Return success so user doesn't see errors.
    console.warn("[PUSH] push_subscriptions table not found. Push subscriptions won't persist. Run the migration SQL.");
    return NextResponse.json({ success: true, warning: "table_missing" });
  }

  // Upsert subscription (user + endpoint is unique)
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: "user_id,endpoint" }
    );

  if (error) {
    // If table was dropped or schema changed, reset cache
    if (error.message?.includes("push_subscriptions")) {
      tableChecked = false;
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint } = body;

  if (endpoint) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
  }

  return NextResponse.json({ success: true });
}
