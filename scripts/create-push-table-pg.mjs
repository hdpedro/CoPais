import postgres from "postgres";

// Try multiple connection approaches
const attempts = [
  {
    name: "Direct connection (port 5432)",
    config: {
      host: "db.jquaysfeeuwvoydsgssi.supabase.co",
      port: 5432,
      database: "postgres",
      username: "postgres",
      password: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA",
      ssl: "require",
      connect_timeout: 10,
    },
  },
  {
    name: "Session pooler (port 5432)",
    config: {
      host: "aws-0-sa-east-1.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      username: "postgres.jquaysfeeuwvoydsgssi",
      password: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA",
      ssl: "require",
      connect_timeout: 10,
    },
  },
  {
    name: "Transaction pooler (port 6543)",
    config: {
      host: "aws-0-sa-east-1.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      username: "postgres.jquaysfeeuwvoydsgssi",
      password: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1OTA3MywiZXhwIjoyMDg5MzM1MDczfQ.aSw8n_AMyzn4KV0M1wSjwWLbJSy_7oYxZlS5GOy7WZA",
      ssl: "require",
      connect_timeout: 10,
    },
  },
];

async function tryConnection(attempt) {
  console.log(`\nTrying: ${attempt.name}...`);
  const sql = postgres(attempt.config);
  try {
    const [{ now }] = await sql`SELECT now()`;
    console.log(`✅ Connected! Server time: ${now}`);
    return sql;
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    try { await sql.end(); } catch {}
    return null;
  }
}

async function main() {
  let sql = null;

  for (const attempt of attempts) {
    sql = await tryConnection(attempt);
    if (sql) break;
  }

  if (!sql) {
    console.log("\n❌ Could not connect to database with any method.");
    console.log("The database password is needed for direct connections.");
    process.exit(1);
  }

  try {
    // Check if table exists
    const exists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
      )
    `;

    if (exists[0].exists) {
      console.log("\n✅ Table push_subscriptions already exists!");
      return;
    }

    console.log("\nCreating push_subscriptions table...");

    await sql`
      CREATE TABLE IF NOT EXISTS public.push_subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(user_id, endpoint)
      )
    `;
    console.log("✅ Table created");

    await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id)`;
    console.log("✅ Index created");

    await sql`ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY`;
    console.log("✅ RLS enabled");

    await sql.unsafe(`
      CREATE POLICY "Users can manage own push subs"
      ON public.push_subscriptions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)
    `);
    console.log("✅ RLS policy created");

    await sql`GRANT ALL ON public.push_subscriptions TO authenticated`;
    await sql`GRANT ALL ON public.push_subscriptions TO service_role`;
    console.log("✅ Grants applied");

    console.log("\n✅ All done! push_subscriptions table is ready.");
  } catch (err) {
    console.error("Error:", err.message || err);
  } finally {
    await sql.end();
  }
}

main();
