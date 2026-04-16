import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { savePushSubscription, removePushSubscription } from "@/lib/push";
import { pushSubscribeRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const rl = pushSubscribeRateLimiter.check(user.id);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Dados de inscricao invalidos" }, { status: 400 });
  }

  try {
    await savePushSubscription(user.id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUSH] Subscribe error:", err);
    reportServerError(err, { filePath: "src/app/api/push/subscribe/route.ts" });
    return NextResponse.json({ error: "Erro ao salvar inscricao" }, { status: 500 });
  }
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
    await removePushSubscription(user.id, endpoint);
  }

  return NextResponse.json({ success: true });
}
