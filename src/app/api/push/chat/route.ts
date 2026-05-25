import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { pushChatRateLimiter } from "@/lib/rate-limit";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import type { Locale } from "@/i18n";

/**
 * POST /api/push/chat
 * Called by ChatRoom when a message is sent to notify other members
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const rl = pushChatRateLimiter.check(user.id);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { groupId, messageText } = await request.json();

  if (!groupId || !messageText) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // Verify user is a member of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  // Get sender name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const senderFirstName = profile?.full_name?.split(" ")[0] || null;

  // Get all group members except the sender
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", user.id);

  if (!members || members.length === 0) {
    return NextResponse.json({ success: true });
  }

  // Send push to all other members
  const truncatedText = messageText.length > 80
    ? messageText.substring(0, 80) + "..."
    : messageText;

  // Resolve each recipient's locale (profiles.locale) and cache t() per locale
  // so the dictionary closure is built once per language instead of per user.
  const recipientIds = members.map((m) => m.user_id);
  const localeByUser = await getUsersLocale(recipientIds);
  const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
  async function getT(locale: Locale) {
    const cached = tByLocale.get(locale);
    if (cached) return cached;
    const fn = await getServerT(locale);
    tByLocale.set(locale, fn);
    return fn;
  }

  // HISTÓRICO DO COALESCING DESSE ROUTE:
  //   - FIX 2026-05-17: tag estática "chat_message" causava OVERWRITE GLOBAL
  //     (3 coparentes mandando → user via só a última do CONJUNTO).
  //   - Workaround: tag por grupo+sender+minuteBucket60s → fixou cross-sender
  //     mas DENTRO do mesmo sender no mesmo minuto, ainda substituía.
  //   - FIX 2026-05-22: separamos thread-id (iOS, AGRUPA visualmente, não
  //     substitui) de tag (FCM, SUBSTITUI). `threadId` mapeia só pra APNs;
  //     FCM não recebe nada → cada mensagem aparece individual no Android.
  //     Resultado: ZERO mensagem perdida + agrupamento bonito iOS por sender.
  //
  // Padrão equivalente: WhatsApp / iMessage. Cada mensagem permanece visível
  // até user dispensar. iOS NC agrupa visualmente sob mesmo sender (thread-id).
  // Android NC agrupa automaticamente por app (Kindar).
  await Promise.allSettled(
    members.map(async (member) => {
      const locale = localeByUser.get(member.user_id) ?? ("pt" as Locale);
      const t = await getT(locale);
      const senderLabel = senderFirstName ?? t("push.chat.fallbackSender");
      return sendPushToUser(member.user_id, {
        title: t("push.chat.title", { senderName: senderLabel }),
        body: truncatedText,
        url: "/chat",
        // threadId só pra iOS thread-id (NÃO substitui no Android — vs tag
        // que substitui). Granularidade per-sender = todas msgs do mesmo
        // coparente agrupam visualmente em iOS sem sobrescrever Android.
        threadId: `chat-${groupId}-${user.id}`,
      });
    })
  );

  return NextResponse.json({ success: true });
}
