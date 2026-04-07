/* ------------------------------------------------------------------ */
/* WhatsApp Message Processor                                         */
/* Central pipeline: identity → session → parser → tools → response    */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseIntent } from "@/lib/ai/local-parser";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools";
import { routeToolsRequest, routeTextRequest } from "@/lib/ai/router";
import { logAIRequest } from "@/lib/ai/core/logger";
import { AIChatMessage, AIToolDefinition } from "@/lib/ai/core/types";
import { AIRateLimiter } from "@/lib/ai/rate-limit";
import {
  CONFIRM_WORDS,
  CANCEL_WORDS,
  buildAssistantContext,
  buildSystemPrompt,
  mapLocalActionToTool,
  sanitizeResponse,
} from "@/lib/ai/assistant-shared";

import { resolveIdentity, setActiveGroup } from "./identity";
import {
  loadSession,
  hasPendingConfirmation,
  setPendingAction,
  clearPendingAction,
  setSessionGroup,
  setGroupSelectionState,
} from "./session";
import {
  sendTextMessage,
  sendConfirmation,
  sendListMessage,
  markAsRead,
} from "./client";
import { formatForWhatsApp, splitMessage } from "./formatter";
import { processReceiptImage } from "./media";
import { WAExtractedMessage } from "./types";

const MAX_TOOL_ROUNDS = 3;

// Separate rate limiter for WhatsApp (30 msg/min per phone)
const waRateLimiter = new AIRateLimiter(60_000, 30);

/* ------------------------------------------------------------------ */
/* Log message to whatsapp_message_logs                                */
/* ------------------------------------------------------------------ */

async function logMessage(
  supabase: SupabaseClient,
  phoneNumber: string,
  direction: "inbound" | "outbound",
  messageType: string,
  content: string | null,
  waMessageId?: string,
  userId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await supabase.from("whatsapp_message_logs").insert({
    phone_number: phoneNumber,
    user_id: userId || null,
    direction,
    message_type: messageType,
    content: content?.slice(0, 5000) || null,
    wa_message_id: waMessageId || null,
    status: direction === "inbound" ? "received" : "sent",
    metadata: metadata || {},
  }).then(
    () => {},
    (err) => console.error("[WA-LOG] Error:", err)
  );
}

/* ------------------------------------------------------------------ */
/* Send response (handles splitting + logging)                         */
/* ------------------------------------------------------------------ */

async function sendAndLog(
  supabase: SupabaseClient,
  to: string,
  text: string,
  userId?: string
): Promise<void> {
  const formatted = formatForWhatsApp(text);
  const parts = splitMessage(formatted);

  for (const part of parts) {
    const waId = await sendTextMessage(to, part);
    await logMessage(supabase, to, "outbound", "text", part, waId, userId);
  }
}

/* ------------------------------------------------------------------ */
/* Main processor                                                      */
/* ------------------------------------------------------------------ */

export async function processWhatsAppMessage(
  message: WAExtractedMessage
): Promise<void> {
  const start = Date.now();
  const supabase = createAdminClient();
  const phone = message.from;

  // Log inbound message
  await logMessage(
    supabase,
    phone,
    "inbound",
    message.type,
    message.text || message.caption || null,
    message.messageId
  );

  // Mark as read
  markAsRead(message.messageId).catch(() => {});

  // Rate limit check
  const rateCheck = waRateLimiter.check(phone);
  if (!rateCheck.allowed) {
    await sendTextMessage(phone, "Muitas mensagens. Aguarde um momento. \u23F3");
    return;
  }

  /* ================================================================ */
  /* Step 1: Handle unsupported message types                          */
  /* ================================================================ */

  if (message.type === "audio") {
    await sendTextMessage(phone, "Desculpe, ainda nao consigo ouvir audios. Por favor, digite sua mensagem. \uD83D\uDE4F");
    return;
  }

  if (message.type === "video" || message.type === "sticker" || message.type === "contacts") {
    if (message.type !== "sticker") {
      await sendTextMessage(phone, "Desculpe, esse tipo de mensagem ainda nao e suportado. Por favor, envie texto ou fotos. \uD83D\uDE4F");
    }
    return;
  }

  /* ================================================================ */
  /* Step 2: Identity resolution                                       */
  /* ================================================================ */

  const identity = await resolveIdentity(supabase, phone);

  if (identity.needsLinking) {
    await sendTextMessage(
      phone,
      "Ola! \uD83D\uDC4B Sou o Kindar, assistente de coparentalidade.\n\n" +
      "Para comecar, voce precisa vincular seu WhatsApp na sua conta Kindar.\n\n" +
      "Acesse *kindar.com.br/perfil* e vincule seu numero na secao WhatsApp."
    );
    return;
  }

  if (identity.needsVerification) {
    await sendTextMessage(
      phone,
      "Seu numero ainda nao foi verificado. Complete a verificacao no app Kindar em *Perfil > WhatsApp*."
    );
    return;
  }

  /* ================================================================ */
  /* Step 3: Load session                                              */
  /* ================================================================ */

  const userId = identity.resolved?.userId;
  const groupId = identity.resolved?.groupId;

  const session = await loadSession(supabase, phone, userId, groupId);

  /* ================================================================ */
  /* Step 4: Group selection flow                                      */
  /* ================================================================ */

  if (identity.needsGroupSelection) {
    const groups = identity.groups || [];

    // Check if user is replying to a group selection prompt
    if (session.state.awaiting_group_selection && message.listReplyId) {
      const selectedGroup = session.state.group_options?.find(
        (g) => g.id === message.listReplyId
      );
      if (selectedGroup) {
        await setActiveGroup(supabase, phone, selectedGroup.id);
        await setSessionGroup(supabase, session.id, selectedGroup.id);
        await clearPendingAction(supabase, session.id);
        await sendTextMessage(phone, `Grupo *${selectedGroup.name}* selecionado! \u2705\n\nComo posso ajudar?`);
        return;
      }
    }

    // Send group selection list
    await setGroupSelectionState(supabase, session.id, groups);
    await sendListMessage(
      phone,
      "Voce participa de mais de um grupo familiar. Qual grupo deseja usar?",
      "Selecionar",
      groups.map((g) => ({ id: g.id, title: g.name }))
    );
    return;
  }

  if (!userId || !groupId) {
    await sendTextMessage(phone, "Erro ao identificar sua conta. Tente vincular novamente em kindar.com.br/perfil.");
    return;
  }

  // Check for "trocar grupo" / "mudar grupo" command
  const textLower = (message.text || "").toLowerCase().trim();
  if (/^(trocar|mudar|alternar)\s+(de\s+)?grupo$/i.test(textLower)) {
    // Clear active group and force re-selection
    await setActiveGroup(supabase, phone, "");
    await sendTextMessage(phone, "Grupo desvinculado. Envie qualquer mensagem para selecionar outro grupo.");
    return;
  }

  /* ================================================================ */
  /* Step 5: Handle pending confirmation                               */
  /* ================================================================ */

  if (hasPendingConfirmation(session) && message.text) {
    const userText = message.text.trim();

    // Button reply: confirm/cancel
    if (message.buttonReplyId === "confirm" || CONFIRM_WORDS.test(userText)) {
      const { pending_action, pending_params } = session.state;
      if (pending_action && pending_params) {
        const { toolCtx } = await buildAssistantContext(supabase, userId, groupId);

        const intent = {
          action: pending_action,
          params: pending_params,
          confidence: 1,
        };

        const mapped = mapLocalActionToTool(intent, toolCtx);
        if (mapped) {
          const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);
          await clearPendingAction(supabase, session.id);

          await logAIRequest({
            userId,
            groupId,
            provider: "local",
            feature: "assistant_tool",
            success: result.success,
            responseTimeMs: Date.now() - start,
          });

          const responseText = result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`;
          await sendAndLog(supabase, phone, responseText, userId);
          return;
        }
      }
      await clearPendingAction(supabase, session.id);
      await sendTextMessage(phone, "Nao consegui processar a acao. Tente novamente.");
      return;
    }

    if (message.buttonReplyId === "cancel" || CANCEL_WORDS.test(userText)) {
      await clearPendingAction(supabase, session.id);
      await sendTextMessage(phone, "\u274C Acao cancelada. Como posso ajudar?");
      return;
    }

    // User sent something else while confirmation is pending — clear and process as new
    await clearPendingAction(supabase, session.id);
  }

  /* ================================================================ */
  /* Step 6: Handle image (receipt OCR)                                */
  /* ================================================================ */

  if (message.type === "image" && message.mediaId) {
    await sendTextMessage(phone, "Analisando a imagem... \uD83D\uDD0D");

    const receipt = await processReceiptImage(
      message.mediaId,
      message.mediaMimeType || "image/jpeg",
      message.caption
    );

    if (receipt) {
      const confirmText = `Registrar despesa:\n*${receipt.description}*\nValor: *R$ ${receipt.amount.toFixed(2).replace(".", ",")}*${receipt.date ? `\nData: ${receipt.date.split("-").reverse().join("/")}` : ""}\n\nConfirma?`;

      await setPendingAction(supabase, session.id, "createExpense", {
        description: receipt.description,
        amount: String(receipt.amount),
        childName: "",
      }, confirmText, "foto de recibo");

      await sendConfirmation(phone, confirmText);
      await logMessage(supabase, phone, "outbound", "interactive", confirmText, undefined, userId);

      await logAIRequest({
        userId,
        groupId,
        provider: "vision",
        feature: "assistant_chat",
        success: true,
        responseTimeMs: Date.now() - start,
      });
      return;
    }

    await sendTextMessage(phone, "Nao consegui ler o recibo. Pode descrever a despesa por texto? Ex: *gastei 50 com remedio*");
    return;
  }

  /* ================================================================ */
  /* Step 7: Process text message                                      */
  /* ================================================================ */

  const userText = message.text || message.caption || "";
  if (!userText.trim()) {
    await sendTextMessage(phone, "Nao entendi. Pode enviar uma mensagem de texto?");
    return;
  }

  // Build context
  const { contextStr, toolCtx, custodyEnabled } = await buildAssistantContext(supabase, userId, groupId);
  const childNames = toolCtx.children.map((c) => c.name);
  const memberNames = toolCtx.members.map((m) => m.name);

  /* ================================================================ */
  /* Step 7a: Try local parser                                         */
  /* ================================================================ */

  const localIntent = parseIntent(userText, childNames, memberNames, "pt");

  if (localIntent && localIntent.confidence >= 0.7) {
    const isActionIntent = localIntent.action.startsWith("create");

    if (isActionIntent) {
      // Ask for confirmation via interactive buttons
      await setPendingAction(
        supabase,
        session.id,
        localIntent.action,
        localIntent.params,
        localIntent.confirmation,
        userText
      );

      await sendConfirmation(phone, localIntent.confirmation);
      await logMessage(supabase, phone, "outbound", "interactive", localIntent.confirmation, undefined, userId);

      await logAIRequest({
        userId,
        groupId,
        provider: "local",
        feature: "assistant_chat",
        success: true,
        responseTimeMs: Date.now() - start,
      });
      return;
    }

    // Query intent — execute directly
    const mapped = mapLocalActionToTool(localIntent, toolCtx);
    if (mapped) {
      const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

      await logAIRequest({
        userId,
        groupId,
        provider: "local",
        feature: "assistant_tool",
        success: result.success,
        responseTimeMs: Date.now() - start,
      });

      await sendAndLog(supabase, phone, result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`, userId);
      return;
    }
  }

  /* ================================================================ */
  /* Step 7b: AI Router fallback                                       */
  /* ================================================================ */

  console.log(`[WA-PROCESSOR] AI Router fallback (${userText.length} chars)`);

  const systemMsg: AIChatMessage = {
    role: "system",
    content: buildSystemPrompt(contextStr, custodyEnabled),
  };

  // Load recent conversation history from message logs
  const { data: recentLogs } = await supabase
    .from("whatsapp_message_logs")
    .select("direction, content, message_type")
    .eq("phone_number", phone)
    .eq("message_type", "text")
    .order("created_at", { ascending: false })
    .limit(10);

  const historyMessages: AIChatMessage[] = (recentLogs || [])
    .reverse()
    .filter((l) => l.content)
    .map((l) => ({
      role: l.direction === "inbound" ? "user" as const : "assistant" as const,
      content: l.content || "",
    }));

  const routerMessages: AIChatMessage[] = [
    systemMsg,
    ...historyMessages,
    { role: "user", content: userText },
  ];

  const toolResultsSummary: string[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { response, provider } = await routeToolsRequest(
        routerMessages,
        AI_TOOLS as unknown as AIToolDefinition[],
        { temperature: 0.3, maxTokens: 1000, timeoutMs: 10000 }
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const content = sanitizeResponse(response.content || "");
        const finalText = content.length >= 5
          ? content
          : toolResultsSummary.length > 0
            ? toolResultsSummary.join("\n")
            : "Nao entendi. Pode reformular?";

        await logAIRequest({
          userId,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });

        await sendAndLog(supabase, phone, finalText, userId);
        return;
      }

      // Execute tool calls
      routerMessages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`[WA-PROCESSOR] Tool: ${toolCall.function.name}`, args);
        const result = await executeTool(toolCall.function.name, args, toolCtx);

        if (result.message) {
          toolResultsSummary.push(
            result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`
          );
        }

        routerMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Exhausted tool rounds — try final text response
    try {
      const { text: finalText, provider } = await routeTextRequest(
        routerMessages,
        { temperature: 0.4, maxTokens: 1000, timeoutMs: 10000 }
      );

      const finalContent = sanitizeResponse(finalText);
      if (finalContent && finalContent.length >= 5) {
        await logAIRequest({
          userId,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });
        await sendAndLog(supabase, phone, finalContent, userId);
        return;
      }
    } catch {
      // Fall through
    }

    if (toolResultsSummary.length > 0) {
      await sendAndLog(supabase, phone, toolResultsSummary.join("\n"), userId);
      return;
    }

    await sendAndLog(supabase, phone, "Pronto! Acao realizada com sucesso. \u2705", userId);
  } catch (error) {
    console.error("[WA-PROCESSOR] AI error:", error);

    await logAIRequest({
      userId,
      provider: "none",
      feature: "assistant_chat",
      success: false,
      responseTimeMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    await sendTextMessage(
      phone,
      "Desculpe, ocorreu um erro. Tente novamente ou use o app Kindar. \uD83D\uDE4F"
    );
  }
}
