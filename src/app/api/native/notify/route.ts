/**
 * Native Side-Effects API
 *
 * Called by the Kindar Native app after writes to replicate
 * the same side-effects that PWA Server Actions perform:
 * - Push notifications to other group members
 * - Chat channel notifications
 * - Analytics events
 *
 * Auth: Bearer token (Supabase access_token)
 * Body: { action, groupId, data }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";

type ActionType =
  | "expense_created"
  | "expense_approved"
  | "expense_rejected"
  | "event_created"
  | "decision_created"
  | "agreement_created"
  | "health_event_created"
  | "chat_message_sent"
  | "child_created"
  | "document_uploaded";

interface NotifyRequest {
  action: ActionType;
  groupId: string;
  data: Record<string, unknown>;
}

// Action configs: what notification to send for each action type
const ACTION_CONFIGS: Record<ActionType, {
  notificationType: string;
  titleFn: (senderName: string, data: Record<string, unknown>) => string;
  messageFn: (senderName: string, data: Record<string, unknown>) => string;
  chatMessageFn?: (senderName: string, data: Record<string, unknown>) => string;
  link: string;
  analyticsEvent: string;
}> = {
  expense_created: {
    notificationType: "expense_new",
    titleFn: () => "Nova Despesa",
    messageFn: (name, d) => `${name} registrou: ${d.description} — R$ ${Number(d.amount || 0).toFixed(2)}`,
    chatMessageFn: (name, d) => `💰 Nova despesa: ${d.description} — R$ ${Number(d.amount || 0).toFixed(2)}`,
    link: "/despesas",
    analyticsEvent: "expense_created",
  },
  expense_approved: {
    notificationType: "expense_approved",
    titleFn: () => "Despesa Aprovada",
    messageFn: (name, d) => `${name} aprovou: ${d.description}`,
    link: "/despesas",
    analyticsEvent: "expense_approved",
  },
  expense_rejected: {
    notificationType: "expense_rejected",
    titleFn: () => "Despesa Rejeitada",
    messageFn: (name, d) => `${name} rejeitou: ${d.description}`,
    link: "/despesas",
    analyticsEvent: "expense_rejected",
  },
  event_created: {
    notificationType: "custody_change",
    titleFn: () => "Novo Evento",
    messageFn: (name, d) => `${name} criou: ${d.title}`,
    chatMessageFn: (name, d) => `🎯 Novo evento: ${d.title}`,
    link: "/eventos",
    analyticsEvent: "event_created",
  },
  decision_created: {
    notificationType: "system",
    titleFn: () => "Nova Decisao",
    messageFn: (name, d) => `${name} abriu para votacao: ${d.title}`,
    chatMessageFn: (name, d) => `🗳️ Nova decisao: ${d.title}`,
    link: "/decisoes",
    analyticsEvent: "decision_created",
  },
  agreement_created: {
    notificationType: "system",
    titleFn: () => "Novo Acordo",
    messageFn: (name, d) => `${name} propôs: ${d.title}`,
    link: "/acordos",
    analyticsEvent: "agreement_created",
  },
  health_event_created: {
    notificationType: "system",
    titleFn: () => "Registro de Saude",
    messageFn: (name, d) => `${name} registrou: ${d.title} (${d.childName || ""})`,
    chatMessageFn: (name, d) => `🩺 Saude: ${d.title} — ${d.childName || ""}`,
    link: "/saude",
    analyticsEvent: "health_event_created",
  },
  chat_message_sent: {
    notificationType: "chat_message",
    titleFn: () => "Nova Mensagem",
    messageFn: (name, d) => `${name}: ${String(d.text || "").slice(0, 80)}`,
    link: "/chat",
    analyticsEvent: "chat_message_sent",
  },
  child_created: {
    notificationType: "system",
    titleFn: () => "Nova Crianca",
    messageFn: (name, d) => `${name} adicionou ${d.childName} ao grupo`,
    link: "/criancas",
    analyticsEvent: "child_created",
  },
  document_uploaded: {
    notificationType: "document_uploaded",
    titleFn: () => "Novo Documento",
    messageFn: (name, d) => `${name} enviou: ${d.name}`,
    link: "/documentos",
    analyticsEvent: "document_uploaded",
  },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: NotifyRequest = await req.json();
    const { action, groupId, data } = body;

    if (!action || !groupId) {
      return NextResponse.json({ error: "Missing action or groupId" }, { status: 400 });
    }

    const config = ACTION_CONFIGS[action];
    if (!config) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Verify user belongs to group
    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }

    // Get sender name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguem";

    // Get other group members
    const { data: otherMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", user.id);

    // Fire-and-forget: push notifications + chat + analytics
    const promises: Promise<unknown>[] = [];

    // 1. Push notifications to other members
    if (otherMembers && action !== "chat_message_sent") {
      for (const member of otherMembers) {
        promises.push(
          createNotificationWithPush(
            member.user_id,
            config.notificationType,
            config.titleFn(senderName, data),
            config.messageFn(senderName, data),
            config.link
          ).catch(() => {})
        );
      }
    }

    // 2. Chat channel notification
    if (config.chatMessageFn) {
      promises.push(
        postChatNotification(
          supabase, groupId, user.id,
          config.chatMessageFn(senderName, data)
        ).catch(() => {})
      );
    }

    // 3. Analytics
    promises.push(
      Promise.resolve(captureServerEvent(user.id, config.analyticsEvent, {
        group_id: groupId,
        ...data,
      })).catch(() => {})
    );

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NATIVE-NOTIFY] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
