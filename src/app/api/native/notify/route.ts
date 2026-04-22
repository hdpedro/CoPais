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
  | "document_uploaded"
  | "swap_request_created"
  | "swap_approved"
  | "swap_rejected"
  | "decision_voted"
  | "decision_argument_posted"
  | "decision_closed"
  | "invitation_sent"
  | "invitation_cancelled"
  | "invitation_accepted";

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
  swap_request_created: {
    notificationType: "swap_request",
    titleFn: () => "Nova troca de guarda",
    messageFn: (name, d) =>
      `${name} solicitou troca ${d.proposedDate ? `${d.originalDate} por ${d.proposedDate}` : `do dia ${d.originalDate}`}`,
    chatMessageFn: (name, d) =>
      `🔄 ${name} pediu troca ${d.proposedDate ? `${d.originalDate}→${d.proposedDate}` : `do dia ${d.originalDate}`}${d.reason ? ` (${d.reason})` : ""}`,
    link: "/calendario",
    analyticsEvent: "swap_request_created",
  },
  swap_approved: {
    notificationType: "swap_response",
    titleFn: () => "Troca aprovada",
    messageFn: (name) => `${name} aprovou sua solicitacao de troca`,
    chatMessageFn: (name) => `✅ ${name} aprovou a troca`,
    link: "/calendario",
    analyticsEvent: "swap_approved",
  },
  swap_rejected: {
    notificationType: "swap_response",
    titleFn: () => "Troca rejeitada",
    messageFn: (name) => `${name} rejeitou sua solicitacao de troca`,
    chatMessageFn: (name) => `❌ ${name} rejeitou a troca`,
    link: "/calendario",
    analyticsEvent: "swap_rejected",
  },
  decision_voted: {
    notificationType: "system",
    titleFn: () => "Voto registrado",
    messageFn: (name, d) => {
      const choiceMap: Record<string, string> = { sim: "a favor", nao: "contra", abster: "abstencao" };
      return `${name} votou ${choiceMap[String(d.choice)] || d.choice} em: ${d.decisionTitle}`;
    },
    link: "/decisoes",
    analyticsEvent: "decision_voted",
  },
  decision_argument_posted: {
    notificationType: "system",
    titleFn: () => "Novo argumento",
    messageFn: (name, d) => `${name} argumentou em: ${d.decisionTitle}`,
    chatMessageFn: (name, d) => `💬 ${name} argumentou (${d.stance}) em: ${d.decisionTitle}`,
    link: "/decisoes",
    analyticsEvent: "decision_argument_posted",
  },
  decision_closed: {
    notificationType: "system",
    titleFn: () => "Decisao encerrada",
    messageFn: (name, d) => {
      const statusMap: Record<string, string> = { aprovada: "aprovada", rejeitada: "rejeitada", expirada: "expirada" };
      return `${d.title} foi ${statusMap[String(d.finalStatus)] || "encerrada"}`;
    },
    chatMessageFn: (name, d) => `🗳️ Decisao encerrada: ${d.title} (${d.finalStatus})`,
    link: "/decisoes",
    analyticsEvent: "decision_closed",
  },
  invitation_sent: {
    notificationType: "invitation",
    titleFn: () => "Convite enviado",
    messageFn: (name, d) => `${name} convidou ${d.email} como ${d.role}`,
    chatMessageFn: (name, d) => `📧 ${name} convidou ${d.email}`,
    link: "/familia",
    analyticsEvent: "invitation_sent",
  },
  invitation_cancelled: {
    notificationType: "system",
    titleFn: () => "Convite cancelado",
    messageFn: (name) => `${name} cancelou um convite pendente`,
    link: "/familia",
    analyticsEvent: "invitation_cancelled",
  },
  invitation_accepted: {
    notificationType: "invitation",
    titleFn: () => "Novo membro",
    messageFn: (name) => `${name} entrou no grupo`,
    chatMessageFn: (name) => `👋 ${name} entrou no grupo`,
    link: "/familia",
    analyticsEvent: "invitation_accepted",
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
