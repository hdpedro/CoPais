import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { savePushSubscription, removePushSubscription } from "@/lib/push";

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

  try {
    await savePushSubscription(user.id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUSH] Subscribe error:", err);
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
