import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can manage own push subs') THEN
    CREATE POLICY "Users can manage own push subs" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
`;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if table already exists
  const { error: testErr } = await supabase
    .from("push_subscriptions")
    .select("id")
    .limit(0);

  if (!testErr) {
    return NextResponse.json({
      status: "ok",
      message: "Table push_subscriptions already exists!",
    });
  }

  // Table doesn't exist — return the SQL for manual execution
  // Also provide a direct link to the SQL Editor
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
    /https:\/\/(\w+)\./
  )?.[1];

  const sqlEditorUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : "https://supabase.com/dashboard";

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2Lares - Setup Push Notifications</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #FFF9F5; color: #1A3B3A; padding: 20px; max-width: 700px; margin: 0 auto; }
    h1 { color: #E8734A; font-size: 1.5rem; }
    .status { padding: 12px 16px; border-radius: 12px; margin: 16px 0; font-weight: 500; }
    .pending { background: #FEF3C7; color: #92400E; }
    .ok { background: #D1FAE5; color: #065F46; }
    pre { background: #1A3B3A; color: #F8FFFE; padding: 16px; border-radius: 12px; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }
    button { background: #E8734A; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; margin: 8px 4px; }
    button:hover { background: #D4623E; }
    .secondary { background: #1A3B3A; }
    .secondary:hover { background: #0D2322; }
    .steps { background: white; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .steps li { margin: 8px 0; }
    .copied { background: #10B981 !important; }
  </style>
</head>
<body>
  <h1>Setup Push Notifications</h1>
  <div class="status pending" id="status">Tabela push_subscriptions nao encontrada</div>

  <div class="steps">
    <h3>Passos:</h3>
    <ol>
      <li>Clique em <strong>"Copiar SQL"</strong> abaixo</li>
      <li>Clique em <strong>"Abrir SQL Editor"</strong> para ir ao Supabase</li>
      <li>Cole o SQL (Ctrl+V) no editor</li>
      <li>Clique <strong>"Run"</strong> (ou Ctrl+Enter)</li>
      <li>Volte aqui e clique <strong>"Verificar"</strong></li>
    </ol>
  </div>

  <pre id="sql">${MIGRATION_SQL.trim()}</pre>

  <div>
    <button id="copyBtn" onclick="copySQL()">Copiar SQL</button>
    <a href="${sqlEditorUrl}" target="_blank">
      <button class="secondary">Abrir SQL Editor</button>
    </a>
    <button class="secondary" onclick="verify()">Verificar</button>
  </div>

  <script>
    function copySQL() {
      navigator.clipboard.writeText(document.getElementById('sql').textContent).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Copiado!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copiar SQL'; btn.classList.remove('copied'); }, 2000);
      });
    }

    async function verify() {
      const res = await fetch('/api/setup-db/check');
      const data = await res.json();
      const el = document.getElementById('status');
      if (data.exists) {
        el.textContent = 'Tabela push_subscriptions OK!';
        el.className = 'status ok';
      } else {
        el.textContent = 'Tabela ainda nao existe. Execute o SQL acima.';
        el.className = 'status pending';
      }
    }
  </script>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
