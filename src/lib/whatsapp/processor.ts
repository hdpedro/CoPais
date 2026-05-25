/* ------------------------------------------------------------------ */
/* WhatsApp Message Processor                                         */
/* Central pipeline: identity → session → parser → tools → response    */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseIntent } from "@/lib/ai/local-parser";
import {
  parseQueryIntent,
  fuzzyMatchIntent,
  dispatchCustomAction,
  parseMultiIntent,
  detectChildAmbiguity,
  loadSessionState,
  saveSessionState,
  applyFollowUp,
} from "@/lib/ai/local-queries";
import { hasNegation, detectOffTopic } from "@/lib/ai/local-helpers";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools";
import { routeToolsRequest, routeTextRequest } from "@/lib/ai/router";
import { logAIRequest } from "@/lib/ai/core/logger";
import { AIChatMessage, AIToolDefinition } from "@/lib/ai/core/types";
import { AIRateLimiter } from "@/lib/ai/rate-limit";
import { formatBRL } from "@/lib/format/currency";
import {
  CONFIRM_WORDS,
  CANCEL_WORDS,
  buildAssistantContext,
  buildSystemPrompt,
  mapLocalActionToTool,
  sanitizeResponse,
} from "@/lib/ai/assistant-shared";

import { resolveIdentity, setActiveGroup } from "./identity";
import { decodeApproval, ApprovalPayload } from "./approvals";
import { respondToSwapRequest } from "@/lib/services/swap";
import {
  loadSession,
  hasPendingConfirmation,
  setPendingAction,
  clearPendingAction,
  setSessionGroup,
  setGroupSelectionState,
  setReceiptStep,
} from "./session";
import { createExpense as createExpenseService } from "@/lib/services/expenses";
import {
  sendTextMessage,
  sendConfirmation,
  sendListMessage,
  markAsRead,
} from "./client";
import { formatForWhatsApp, splitMessage } from "./formatter";
import { processReceiptImage, processPrescriptionImage } from "./media";
import { transcribeAudio } from "./audio";
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

  // Idempotency: if we've already logged this exact wa_message_id as
  // inbound, Meta is retrying a delivery we already handled. Skip
  // entirely to avoid duplicate replies + duplicate side-effects.
  if (message.messageId) {
    const { data: dup } = await supabase
      .from("whatsapp_message_logs")
      .select("id")
      .eq("wa_message_id", message.messageId)
      .eq("direction", "inbound")
      .limit(1);
    if (dup && dup.length > 0) {
      console.log(
        `[WA-PROCESSOR] dedupe: ${message.messageId} already processed, skip`
      );
      return;
    }
  }

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

  if (message.type === "audio" && message.mediaId) {
    await sendTextMessage(phone, "\uD83C\uDFA7 Ouvindo seu audio...");
    const transcription = await transcribeAudio(message.mediaId, message.mediaMimeType);
    if (transcription) {
      // Replace message text with transcription and continue processing
      message.text = transcription;
      message.type = "text";
      // Fall through to text processing below
    } else {
      await sendTextMessage(phone, "Nao consegui entender o audio. Pode digitar a mensagem? \uD83D\uDE4F");
      return;
    }
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
      "Ola! \uD83D\uDC4B Sou o Kindar, assistente de coparentalidade.\n\nPara comecar, vincule seu WhatsApp na sua conta Kindar.\n\nAcesse *kindar.com.br/perfil* e vincule seu numero na secao WhatsApp."
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
  /* Step 4.4: Handle receipt multi-step flow (G4)                     */
  /* List replies routed by current session step.                      */
  /* ================================================================ */

  if (session.state.receipt_step && message.listReplyId) {
    const handled = await handleReceiptStepReply(
      supabase,
      session.id,
      session.state,
      message.listReplyId,
      phone,
      userId,
      groupId,
      start,
    );
    if (handled) return;
  }

  /* ================================================================ */
  /* Step 4.5: Handle approval/reject buttons (two-party actions)      */
  /* ================================================================ */

  if (message.buttonReplyId) {
    const approval = decodeApproval(message.buttonReplyId);
    if (approval) {
      const result = await dispatchApproval(supabase, userId, approval);
      await sendAndLog(supabase, phone, result.message, userId);
      await logAIRequest({
        userId,
        groupId,
        provider: "local",
        feature: "assistant_tool",
        success: result.ok,
        responseTimeMs: Date.now() - start,
      });
      return;
    }
  }

  /* ================================================================ */
  /* Step 5: Handle pending confirmation                               */
  /* ================================================================ */

  if (hasPendingConfirmation(session) && (message.text || message.buttonReplyId)) {
    const userText = (message.text || "").trim();

    // Button reply: confirm/cancel
    if (message.buttonReplyId === "confirm" || (userText && CONFIRM_WORDS.test(userText))) {
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

    if (message.buttonReplyId === "cancel" || (userText && CANCEL_WORDS.test(userText))) {
      await clearPendingAction(supabase, session.id);
      await sendTextMessage(phone, "\u274C Acao cancelada. Como posso ajudar?");
      return;
    }

    // User sent something else while confirmation is pending — clear and process as new
    await clearPendingAction(supabase, session.id);
  }

  /* ================================================================ */
  /* Step 6: Handle image (caption-routed: receipt | prescription | …) */
  /* ================================================================ */

  if (message.type === "image" && message.mediaId) {
    const intent = classifyImageIntent(message.caption);

    if (intent === "prescription") {
      // Fetch first child for this group (simplification for WhatsApp)
      const { data: children } = await supabase
        .from("children")
        .select("id, full_name, birth_date")
        .eq("group_id", groupId)
        .limit(1);

      if (children && children.length > 0) {
        const child = children[0];
        await sendTextMessage(phone, `💊 Analisando receita de ${child.full_name?.split(" ")[0]}...`);

        const prescResult = await processPrescriptionImage(
          message.mediaId,
          message.mediaMimeType || "image/jpeg",
          child.id,
          child.full_name?.split(" ")[0] || "crianca",
          child.birth_date || "",
          groupId,
          userId,
        );

        if (prescResult) {
          await sendTextMessage(phone, prescResult.summary);
          await logMessage(supabase, phone, "outbound", "text", prescResult.summary, undefined, userId);
          await logAIRequest({
            userId, groupId,
            provider: "vision",
            feature: "prescription_ocr",
            success: true,
            responseTimeMs: Date.now() - start,
          });
          return;
        }

        await sendTextMessage(phone, "Nao consegui ler a receita. Tente com uma foto mais nitida ou envie pelo app.");
        return;
      }
    }

    if (intent === "vaccine" || intent === "attestation" || intent === "exam") {
      // These categories aren't auto-extracted yet \u2014 store as document and
      // direct the user to the app for proper categorization.
      const labels: Record<typeof intent, string> = {
        vaccine: "comprovante de vacina",
        attestation: "atestado",
        exam: "exame",
      };
      await sendTextMessage(
        phone,
        `Recebi sua foto de ${labels[intent]}. Por enquanto preciso que voce anexe pelo app Kindar (Saude > Documentos) para extrair os dados corretamente. \uD83D\uDCC4`,
      );
      return;
    }

    await sendTextMessage(phone, "Analisando a imagem... \uD83D\uDD0D");

    const receipt = await processReceiptImage(
      message.mediaId,
      message.mediaMimeType || "image/jpeg",
      message.caption
    );

    if (receipt) {
      // G4: enter the multi-step flow — category → child → confirm.
      const expenseDate = receipt.date && /^\d{4}-\d{2}-\d{2}$/.test(receipt.date)
        ? receipt.date
        : new Date().toISOString().split("T")[0];

      await setReceiptStep(supabase, session.id, "category", {
        description: receipt.description,
        amount: receipt.amount,
        expense_date: expenseDate,
      });

      const summary = `Recibo lido: *${receipt.description}* — ${formatBRL(receipt.amount)}${expenseDate ? ` (${expenseDate.split("-").reverse().join("/")})` : ""}.\nQual a categoria?`;

      await sendListMessage(phone, summary, "Categorias", [
        { id: "rcat:health",     title: "Saúde" },
        { id: "rcat:education",  title: "Educação" },
        { id: "rcat:food",       title: "Alimentação" },
        { id: "rcat:clothing",   title: "Vestuário" },
        { id: "rcat:leisure",    title: "Lazer" },
        { id: "rcat:transport",  title: "Transporte" },
        { id: "rcat:housing",    title: "Moradia" },
        { id: "rcat:other",      title: "Outros" },
      ]);
      await logMessage(supabase, phone, "outbound", "interactive", summary, undefined, userId);

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
  const waNegated = hasNegation(userText);

  if (localIntent && localIntent.confidence >= 0.7 && !(localIntent.action.startsWith("create") && waNegated)) {
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
  /* Step 7a-2: Local QUERIES + s\u00EDntese + drafts (sem LLM)             */
  /* ================================================================ */

  const queryParseCtx = {
    children: toolCtx.children.map((c) => ({ id: c.id, name: c.name })),
    members: toolCtx.members,
    currentUserId: userId,
  };

  // Multi-intent: "quanto gastei e quem tá com o Bê?" — processa as duas
  const waMultiIntents = parseMultiIntent(userText, queryParseCtx);
  if (waMultiIntents.length >= 2) {
    const results: string[] = [];
    for (const intent of waMultiIntents) {
      let result;
      if (intent.action.startsWith("custom")) {
        result = await dispatchCustomAction(intent, toolCtx);
      } else {
        const mapped = mapLocalActionToTool(
          { action: intent.action, params: intent.params, confidence: intent.confidence },
          toolCtx,
        );
        if (mapped) {
          result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);
        }
      }
      if (result?.success && result.message) results.push(result.message);
    }
    if (results.length >= 2) {
      await logAIRequest({
        userId,
        groupId,
        provider: "local-multi",
        feature: "assistant_chat",
        success: true,
        responseTimeMs: Date.now() - start,
      });
      await sendAndLog(supabase, phone, results.join("\n\n---\n\n"), userId);
      return;
    }
  }

  // Follow-up via session state
  const waSession = await loadSessionState(toolCtx);
  const waFollowUp = applyFollowUp(userText, waSession, queryParseCtx);

  let waQueryIntent = parseQueryIntent(userText, queryParseCtx);
  let waProvider = "local-regex";
  if (!waQueryIntent) {
    waQueryIntent = fuzzyMatchIntent(userText, queryParseCtx);
    if (waQueryIntent) waProvider = "local-fuzzy";
  }
  if (!waQueryIntent && waFollowUp) {
    waQueryIntent = waFollowUp;
    waProvider = "local-followup";
  }

  // Clarificação de criança ambígua
  if (waQueryIntent && !waQueryIntent.params.child_name && !waQueryIntent.params.childName) {
    const requiresChild = ["queryHealth", "queryStatus", "queryHistory", "customChildSummary"];
    if (requiresChild.includes(waQueryIntent.action)) {
      const ambig = detectChildAmbiguity(userText, toolCtx.children);
      if (ambig.ambiguous && ambig.candidates.length >= 2) {
        const names = ambig.candidates.map((c) => c.name.split(" ")[0]).join(" ou ");
        await logAIRequest({
          userId,
          groupId,
          provider: "local-clarify",
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });
        await sendAndLog(supabase, phone, `Você quer dizer **${names}**? Me confirma qual.`, userId);
        return;
      }
    }
  }

  if (waQueryIntent && waQueryIntent.confidence >= 0.6) {
    if (waQueryIntent.action.startsWith("custom")) {
      const result = await dispatchCustomAction(waQueryIntent, toolCtx);
      if (result) {
        await logAIRequest({
          userId,
          groupId,
          provider: waProvider,
          feature: "assistant_chat",
          success: result.success,
          responseTimeMs: Date.now() - start,
        });
        if (result.success) {
          await saveSessionState(toolCtx, waQueryIntent).catch(() => {/* best effort */});
        }
        await sendAndLog(supabase, phone, result.message, userId);
        return;
      }
    }

    const mappedQuery = mapLocalActionToTool(
      { action: waQueryIntent.action, params: waQueryIntent.params, confidence: waQueryIntent.confidence },
      toolCtx,
    );
    if (mappedQuery) {
      const result = await executeTool(mappedQuery.toolName, mappedQuery.toolParams, toolCtx);
      await logAIRequest({
        userId,
        groupId,
        provider: waProvider,
        feature: "assistant_tool",
        success: result.success,
        responseTimeMs: Date.now() - start,
      });
      if (result.success) {
        await saveSessionState(toolCtx, waQueryIntent).catch(() => {/* best effort */});
        await sendAndLog(supabase, phone, result.message, userId);
        return;
      }
    }
  }

  /* ================================================================ */
  /* Step 7a-noise: bare greetings without context                     */
  /*                                                                    */
  /* Quando o parser local nao casa, nao tem confirmacao pendente, e o */
  /* texto e um cumprimento curto / bare ack ("oi", "ola", "teste",    */
  /* "sim", "nao", "ok"), o bot LOGA mas NAO responde. Evita loops com */
  /* auto-responders externos no lado do usuario e economiza LLM.      */
  /* ================================================================ */

  if (isBareNoise(userText)) {
    // Anti-loop logic: if the bot replied to this phone in the last 10 min,
    // we are likely in a ping-pong with an external auto-responder. Stay
    // silent. Otherwise, treat as a real human greeting and respond with a
    // short, non-conversational suggestion (avoids LLM chatty replies that
    // would re-trigger the auto-responder loop).
    const NOISE_COOLDOWN_MS = 10 * 60 * 1000;
    const cooldownSince = new Date(Date.now() - NOISE_COOLDOWN_MS).toISOString();
    const { count: recentBotReplies } = await supabase
      .from("whatsapp_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("phone_number", phone)
      .eq("direction", "outbound")
      .eq("message_type", "text")
      .gte("created_at", cooldownSince);

    if ((recentBotReplies ?? 0) > 0) {
      console.log(
        `[WA-PROCESSOR] noise+cooldown: skip "${userText.slice(0, 30)}" (${recentBotReplies} bot replies in last 10min)`,
      );
      await logAIRequest({
        userId,
        groupId,
        provider: "local",
        feature: "assistant_chat",
        success: true,
        responseTimeMs: Date.now() - start,
        errorMessage: "noise_cooldown_skipped",
      });
      return;
    }

    console.log(
      `[WA-PROCESSOR] noise greet: short suggestion reply for "${userText.slice(0, 30)}"`,
    );
    const childFirst = toolCtx.children[0]?.name?.split(" ")[0];
    const example = childFirst
      ? `*paguei 50 da escola do ${childFirst}*`
      : `*paguei 50 da escola*`;
    const greetingReply =
      `👋 Oi! Sou o Kindar, seu assistente de coparentalidade.\n\n` +
      `Pode mandar texto, áudio ou foto que eu organizo:\n` +
      `• ${example}\n` +
      `• *agendar pediatra dia 20 às 14h*\n` +
      `• *como tá o saldo?*\n` +
      `• *aprovações pendentes*\n\n` +
      `Manual completo em kindar.com.br.`;
    await sendAndLog(supabase, phone, greetingReply, userId);
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

  /* ================================================================ */
  /* Step 7a-3: Off-topic — escopo Kindar = filhos + coparentalidade   */
  /* ================================================================ */

  const waOffTopic = detectOffTopic(userText);
  if (waOffTopic.category) {
    await logAIRequest({
      userId,
      groupId,
      provider: `local-offtopic-${waOffTopic.category}`,
      feature: "assistant_chat",
      success: true,
      responseTimeMs: Date.now() - start,
    });
    await sendAndLog(supabase, phone, waOffTopic.reply || "", userId);
    return;
  }

  /* ================================================================ */
  /* Step 7b: AI Router fallback                                       */
  /* ================================================================ */

  console.log(`[WA-PROCESSOR] AI Router fallback (${userText.length} chars)`);

  const systemMsg: AIChatMessage = {
    role: "system",
    content: buildSystemPrompt(contextStr, custodyEnabled),
  };

  // Load recent conversation history from message logs.
  // Window: last 30 minutes AND last 10 turns (whichever is shorter), and
  // skip synthetic system messages (errors, "Acao cancelada" prompts) so
  // the LLM context isn't polluted with noise.
  const HISTORY_WINDOW_MS = 30 * 60 * 1000;
  const sinceISO = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();

  const { data: recentLogs } = await supabase
    .from("whatsapp_message_logs")
    .select("direction, content, message_type, created_at")
    .eq("phone_number", phone)
    .eq("message_type", "text")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(10);

  const historyMessages: AIChatMessage[] = (recentLogs || [])
    .reverse()
    .filter((l) => isHistoricallyMeaningful(l.content))
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

/* ------------------------------------------------------------------ */
/* Receipt multi-step flow (G4)                                       */
/*                                                                     */
/* After OCR, the user picks: 1) category, 2) child (auto-skipped if   */
/* group has 0 or 1 children). On final selection the expense is       */
/* created via the canonical `services/expenses.ts:createExpense`.     */
/* ------------------------------------------------------------------ */

import { WASessionState } from "./types";

const CATEGORY_LABEL: Record<string, string> = {
  health: "Saúde",
  education: "Educação",
  food: "Alimentação",
  clothing: "Vestuário",
  leisure: "Lazer",
  transport: "Transporte",
  housing: "Moradia",
  other: "Outros",
};

async function handleReceiptStepReply(
  supabase: SupabaseClient,
  sessionId: string,
  state: WASessionState,
  listReplyId: string,
  phone: string,
  userId: string,
  groupId: string,
  start: number,
): Promise<boolean> {
  const draft = state.receipt_draft;
  if (!draft) return false;

  if (state.receipt_step === "category" && listReplyId.startsWith("rcat:")) {
    const category = listReplyId.slice("rcat:".length);
    if (!CATEGORY_LABEL[category]) return false;

    // Fetch children for the group to decide next step.
    const { data: children } = await supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId);

    const kids = children || [];

    // 0 or 1 child → skip the child step.
    if (kids.length <= 1) {
      const childId = kids[0]?.id ?? null;
      await finalizeReceiptExpense(
        supabase,
        sessionId,
        { ...draft, category, child_id: childId },
        phone,
        userId,
        groupId,
        start,
      );
      return true;
    }

    // Multi-child → ask which one.
    await setReceiptStep(supabase, sessionId, "child", {
      ...draft,
      category,
    });

    const rows = [
      ...kids.slice(0, 9).map((c) => ({
        id: `rchild:${c.id}`,
        title: (c.full_name as string)?.split(" ")[0] || "Crianca",
      })),
      { id: "rchild:none", title: "Geral" },
    ];

    await sendListMessage(
      phone,
      `Categoria: ${CATEGORY_LABEL[category]}.\nPara qual criança?`,
      "Crianças",
      rows,
    );
    await logMessage(
      supabase,
      phone,
      "outbound",
      "interactive",
      `receipt-child-step (${kids.length})`,
      undefined,
      userId,
    );
    return true;
  }

  if (state.receipt_step === "child" && listReplyId.startsWith("rchild:")) {
    const raw = listReplyId.slice("rchild:".length);
    const childId = raw === "none" ? null : raw;
    await finalizeReceiptExpense(
      supabase,
      sessionId,
      { ...draft, child_id: childId },
      phone,
      userId,
      groupId,
      start,
    );
    return true;
  }

  return false;
}

async function finalizeReceiptExpense(
  supabase: SupabaseClient,
  sessionId: string,
  draft: NonNullable<WASessionState["receipt_draft"]>,
  phone: string,
  userId: string,
  groupId: string,
  start: number,
): Promise<void> {
  const result = await createExpenseService(supabase, {
    groupId,
    paidBy: userId,
    description: draft.description,
    amount: draft.amount,
    category: draft.category || "other",
    expenseDate: draft.expense_date,
    childId: draft.child_id || null,
    splitRatio: null,
    receiptUrl: null,
    origin: "whatsapp",
  });

  // Always clear the receipt step before returning to keep state clean.
  await clearPendingAction(supabase, sessionId);

  if (!result.ok) {
    await sendTextMessage(phone, `⚠️ ${result.error}`);
    await logAIRequest({
      userId,
      groupId,
      provider: "vision",
      feature: "assistant_tool",
      success: false,
      responseTimeMs: Date.now() - start,
      errorMessage: result.error,
    });
    return;
  }

  const dateBR = draft.expense_date.split("-").reverse().join("/");
  const catLabel = CATEGORY_LABEL[draft.category || "other"] || "Outros";
  await sendTextMessage(
    phone,
    `✅ Despesa registrada: *${draft.description}* — ${formatBRL(draft.amount)} (${catLabel}, ${dateBR}).`,
  );

  await logAIRequest({
    userId,
    groupId,
    provider: "vision",
    feature: "assistant_tool",
    success: true,
    responseTimeMs: Date.now() - start,
  });
}

/* ------------------------------------------------------------------ */
/* Image caption intent router (G6)                                   */
/*                                                                     */
/* Captions can carry slash-commands or natural keywords that pick     */
/* the right OCR pipeline. Order matters: more-specific intents win.  */
/* ------------------------------------------------------------------ */

type ImageIntent = "prescription" | "vaccine" | "attestation" | "exam" | "receipt";

function classifyImageIntent(caption: string | undefined): ImageIntent {
  const c = (caption || "").toLowerCase().trim();
  if (!c) return "receipt";

  // Slash-commands take priority — explicit user intent.
  if (/^\/?(receita|prescri[cç][aã]o)\b/.test(c)) return "prescription";
  if (/^\/?vacina\b/.test(c)) return "vaccine";
  if (/^\/?atestado\b/.test(c)) return "attestation";
  if (/^\/?exame\b/.test(c)) return "exam";

  // Natural keywords (legacy compatibility).
  if (/receita|prescri[cç][aã]o|medicamento|rem[eé]dio/.test(c)) return "prescription";
  if (/vacina(\b|s)/.test(c)) return "vaccine";
  if (/atestado/.test(c)) return "attestation";
  if (/exame|laudo|raio-x|ressonancia|ressonância/.test(c)) return "exam";

  return "receipt";
}

/* ------------------------------------------------------------------ */
/* History noise filter (G5)                                          */
/*                                                                     */
/* Skip synthetic system replies that pollute the LLM context — error */
/* prompts, single-glyph confirmations, link-instruction templates.   */
/* ------------------------------------------------------------------ */

const NOISE_PATTERNS: RegExp[] = [
  /^Acao cancelada/i,
  /^Pronto! Acao realizada/i,
  /^Muitas mensagens\. Aguarde/i,
  /^Desculpe, ocorreu um erro/i,
  /^Nao entendi\. Pode/i,
  /^Nao consegui ler/i,
  /Para comecar, vincule seu WhatsApp/i,
  /^Erro ao identificar sua conta/i,
];

function isHistoricallyMeaningful(content: string | null | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (trimmed.length < 3) return false;
  return !NOISE_PATTERNS.some((re) => re.test(trimmed));
}

/* ------------------------------------------------------------------ */
/* Bare-greeting noise filter (anti-loop with external auto-responders)*/
/*                                                                     */
/* When the LLM router would otherwise reply with a chatty acknowledgment*/
/* to a pure greeting / monosyllabic ack ("oi", "ola", "oie", "teste",  */
/* "sim", "nao", "ok"), the bot LOGS but does NOT reply. This is the    */
/* defensive layer for the case where the user's number is being        */
/* hammered by an auto-replier that ping-pongs greetings indefinitely.  */
/*                                                                     */
/* Important: only triggers when there is NO pending confirmation       */
/* (handled higher up in the pipeline). With pending confirmation,      */
/* "sim"/"nao" carry meaning and reach this branch only after the       */
/* pending logic clears it.                                             */
/* ------------------------------------------------------------------ */

const BARE_NOISE_PATTERN =
  /^(oi+e?|ol[aá]+|ola+|hello+|hi+|opa+|teste*|test+|hey+|sim+|n[aã]o+|nao\??|ok+|tá|to+|tô|salve|tchau|bye+|valeu+|obrigad[oa]?|kkk+)[\s!?.…]*$/i;

function isBareNoise(content: string): boolean {
  const trimmed = (content || "").trim();
  if (!trimmed) return true; // empty also noise
  if (trimmed.length > 24) return false; // anything substantive enough
  return BARE_NOISE_PATTERN.test(trimmed);
}

/* ------------------------------------------------------------------ */
/* Approval dispatcher: maps decoded button payload to service call    */
/* ------------------------------------------------------------------ */

async function dispatchApproval(
  supabase: SupabaseClient,
  responderId: string,
  payload: ApprovalPayload,
): Promise<{ ok: boolean; message: string }> {
  const decision = payload.verb === "approve" ? "approved" : "rejected";

  switch (payload.entity) {
    case "swap": {
      const result = await respondToSwapRequest(supabase, {
        swapId: payload.id,
        responderId,
        decision,
      });
      if (!result.ok) return { ok: false, message: result.error };
      return {
        ok: true,
        message:
          decision === "approved"
            ? "\u2705 Troca aprovada. Calendario atualizado."
            : "\u274C Troca recusada.",
      };
    }
    case "event_request":
    case "expense":
      return {
        ok: false,
        message:
          "Aprovacao para esse tipo ainda nao esta disponivel pelo WhatsApp.",
      };
  }
}
