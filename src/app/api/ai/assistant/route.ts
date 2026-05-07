/* ------------------------------------------------------------------ */
/* /api/ai/assistant — LOCAL-FIRST AI with Router fallback             */
/* Uses AI Router (Groq→Together→Gemini) instead of direct Groq calls  */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools";
import { aiRateLimiter } from "@/lib/ai/rate-limit";
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
import { routeToolsRequest, routeTextRequest } from "@/lib/ai/router";
import { logAIRequest } from "@/lib/ai/core/logger";
import { canUseAI } from "@/lib/ai/core/usage";
import { AIChatMessage, AIToolDefinition } from "@/lib/ai/core/types";
import {
  CONFIRM_PREFIX,
  CONFIRM_WORDS,
  CANCEL_WORDS,
  buildAssistantContext,
  buildSystemPrompt,
  mapLocalActionToTool,
  sanitizeResponse,
} from "@/lib/ai/assistant-shared";

const MAX_TOOL_ROUNDS = 3;

export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* POST Handler                                                        */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    // Auth — Bearer (native) or cookie (PWA) via shared helper. Native
    // (AIAssistantSheet) sends Authorization: Bearer; without this the
    // middleware bounces it to /session-recovery and the chat dies.
    const auth = await resolveAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }
    const user = { id: auth.id };
    const supabase = createAdminClient();

    // Rate limit check
    const rateCheck = aiRateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens. Aguarde um momento." },
        { status: 429 }
      );
    }

    // Usage limit check
    const usageCheck = await canUseAI(user.id, "assistant_chat");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "Limite diario do assistente atingido." },
        { status: 429 }
      );
    }

    const { messages, groupId } = (await req.json()) as {
      messages: ChatMessage[];
      groupId: string;
    };

    if (!messages?.length || !groupId) {
      return NextResponse.json(
        { error: "messages e groupId obrigatorios" },
        { status: 400 }
      );
    }

    const reversedMessages = [...messages].reverse();
    const lastUserMsg = reversedMessages.find((m) => m.role === "user");
    if (!lastUserMsg?.content?.trim()) {
      return NextResponse.json(
        { error: "Mensagem vazia não permitida." },
        { status: 400 }
      );
    }
    const userText = lastUserMsg.content;

    // Quest step: first AI assistant interaction. Fire-and-forget so the
    // chat response isn't delayed by the tracker write.
    import("@/actions/onboarding-quest")
      .then(({ markQuestStep }) => markQuestStep("ai_agreement", { channel: "assistant" }))
      .catch((err) => console.error("[assistant] quest track failed:", err));

    const { contextStr, toolCtx, custodyEnabled } = await buildAssistantContext(supabase, user.id, groupId);

    /* ================================================================ */
    /* STEP 0: Check confirmation of pending action                     */
    /* ================================================================ */

    const childNames = toolCtx.children.map((c) => c.name);
    const memberNames = toolCtx.members.map((m) => m.name);

    const lastAssistantMsg = reversedMessages.find((m) => m.role === "assistant");
    const isPendingConfirmation = lastAssistantMsg?.content?.startsWith(CONFIRM_PREFIX);

    if (isPendingConfirmation && CANCEL_WORDS.test(userText.trim())) {
      return NextResponse.json({
        role: "assistant",
        content: "\u274C A\u00e7\u00e3o cancelada. Como posso ajudar?",
      });
    }

    if (isPendingConfirmation && CONFIRM_WORDS.test(userText.trim())) {
      const reversedMsgs = [...messages].reverse();
      let foundAssistant = false;
      let originalText = "";
      for (const m of reversedMsgs) {
        if (m.role === "assistant" && m.content?.startsWith(CONFIRM_PREFIX)) {
          foundAssistant = true;
          continue;
        }
        if (foundAssistant && m.role === "user") {
          originalText = m.content;
          break;
        }
      }

      if (originalText) {
        const originalIntent = parseIntent(originalText, childNames, memberNames, "pt");
        if (originalIntent && originalIntent.confidence >= 0.7) {
          const mapped = mapLocalActionToTool(originalIntent, toolCtx);
          if (mapped) {
            console.log(`[LOCAL] Confirmed: ${mapped.toolName}`);
            const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

            await logAIRequest({
              userId: user.id,
              groupId,
              provider: "local",
              feature: "assistant_tool",
              success: result.success,
              responseTimeMs: Date.now() - start,
            });

            return NextResponse.json({
              role: "assistant",
              content: result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`,
            });
          }
        }
      }
    }

    /* ================================================================ */
    /* STEP 1a: LOCAL parser \u2014 actions (create*)                        */
    /* ================================================================ */

    const localIntent = parseIntent(userText, childNames, memberNames, "pt");

    // Negação bloqueia creates ("não marquei consulta" não deve criar nada).
    const negated = hasNegation(userText);

    if (localIntent && localIntent.confidence >= 0.7 && !(localIntent.action.startsWith("create") && negated)) {
      const isActionIntent = localIntent.action.startsWith("create");

      if (isActionIntent) {
        await logAIRequest({
          userId: user.id,
          groupId,
          provider: "local",
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });

        return NextResponse.json({
          role: "assistant",
          content: `${CONFIRM_PREFIX} ${localIntent.confirmation}`,
        });
      }

      const mapped = mapLocalActionToTool(localIntent, toolCtx);
      if (mapped) {
        const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

        await logAIRequest({
          userId: user.id,
          groupId,
          provider: "local",
          feature: "assistant_tool",
          success: result.success,
          responseTimeMs: Date.now() - start,
        });

        if (result.success) {
          return NextResponse.json({
            role: "assistant",
            content: `\u2705 ${result.message}`,
          });
        }
      }
    }

    /* ================================================================ */
    /* STEP 1b: LOCAL parser \u2014 queries + s\u00edntese + drafts (no LLM)      */
    /* ================================================================ */

    const queryParseCtx = {
      children: toolCtx.children.map((c) => ({ id: c.id, name: c.name })),
      members: toolCtx.members,
      currentUserId: user.id,
    };

    // Multi-intent: se a mensagem tem 2+ perguntas em "e"/";"/"+", processa todas.
    const multiIntents = parseMultiIntent(userText, queryParseCtx);
    if (multiIntents.length >= 2) {
      const results: string[] = [];
      for (const intent of multiIntents) {
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
          userId: user.id,
          groupId,
          provider: "local-multi",
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({
          role: "assistant",
          content: results.join("\n\n---\n\n"),
        });
      }
    }

    // Tenta follow-up usando session state ("e em julho?", "ele tem alergia?")
    const sessionState = await loadSessionState(toolCtx);
    const followUp = applyFollowUp(userText, sessionState, queryParseCtx);

    let queryIntent = parseQueryIntent(userText, queryParseCtx);
    let queryProvider = "local-regex";
    if (!queryIntent) {
      // N\u00edvel 2 \u2014 fuzzy fallback (ainda 100% local)
      queryIntent = fuzzyMatchIntent(userText, queryParseCtx);
      if (queryIntent) queryProvider = "local-fuzzy";
    }
    // N\u00edvel 3 \u2014 follow-up de session state se nada acertou
    if (!queryIntent && followUp) {
      queryIntent = followUp;
      queryProvider = "local-followup";
    }

    // Detecta ambiguidade de crian\u00e7a quando intent precisaria de child mas
    // n\u00e3o resolveu (ex: "sa\u00fade do B\u00ea" \u2014 Bernardo OU Beatriz).
    if (queryIntent && !queryIntent.params.child_name && !queryIntent.params.childName) {
      const requiresChild = ["queryHealth", "queryStatus", "queryHistory", "customChildSummary"];
      if (requiresChild.includes(queryIntent.action)) {
        const ambig = detectChildAmbiguity(userText, toolCtx.children);
        if (ambig.ambiguous && ambig.candidates.length >= 2) {
          const names = ambig.candidates.map((c) => c.name.split(" ")[0]).join(" ou ");
          await logAIRequest({
            userId: user.id,
            groupId,
            provider: "local-clarify",
            feature: "assistant_chat",
            success: true,
            responseTimeMs: Date.now() - start,
          });
          return NextResponse.json({
            role: "assistant",
            content: `Voc\u00ea quer dizer **${names}**? Me confirma qual.`,
          });
        }
      }
    }

    if (queryIntent && queryIntent.confidence >= 0.6) {
      // Custom handlers (s\u00edntese, contagem de guarda, drafts) \u2014 n\u00e3o usam tool
      if (queryIntent.action.startsWith("custom")) {
        const result = await dispatchCustomAction(queryIntent, toolCtx);
        if (result) {
          await logAIRequest({
            userId: user.id,
            groupId,
            provider: queryProvider === "local-fuzzy" ? "local-fuzzy-custom" : queryProvider === "local-followup" ? "local-followup-custom" : "local-custom",
            feature: "assistant_chat",
            success: result.success,
            responseTimeMs: Date.now() - start,
          });
          // Persistir state pra follow-ups subsequentes
          if (result.success) {
            await saveSessionState(toolCtx, queryIntent).catch(() => {/* best effort */});
          }
          return NextResponse.json({ role: "assistant", content: result.message });
        }
      }

      // Query mapeada pra tool existente
      const mappedQuery = mapLocalActionToTool(
        { action: queryIntent.action, params: queryIntent.params, confidence: queryIntent.confidence },
        toolCtx,
      );
      if (mappedQuery) {
        const result = await executeTool(mappedQuery.toolName, mappedQuery.toolParams, toolCtx);
        await logAIRequest({
          userId: user.id,
          groupId,
          provider: queryProvider,
          feature: "assistant_tool",
          success: result.success,
          responseTimeMs: Date.now() - start,
        });
        if (result.success) {
          await saveSessionState(toolCtx, queryIntent).catch(() => {/* best effort */});
          return NextResponse.json({ role: "assistant", content: result.message });
        }
      }
    }

    /* ================================================================ */
    /* STEP 1e: Off-topic — escopo Kindar = filhos + coparentalidade.    */
    /* Bloqueia chamada de LLM paga pra clima, marketplace, política,    */
    /* esporte, conselho médico/jurídico, finanças adultas, etc.         */
    /* ================================================================ */

    const offTopic = detectOffTopic(userText);
    if (offTopic.category) {
      await logAIRequest({
        userId: user.id,
        groupId,
        provider: `local-offtopic-${offTopic.category}`,
        feature: "assistant_chat",
        success: true,
        responseTimeMs: Date.now() - start,
      });
      return NextResponse.json({ role: "assistant", content: offTopic.reply || "" });
    }

    /* ================================================================ */
    /* STEP 2: AI Router fallback (Groq → Together → Gemini)            */
    /* ================================================================ */

    console.log(`[AI-ROUTER] Processing request (${userText.length} chars)`);

    const systemMsg: AIChatMessage = {
      role: "system",
      content: buildSystemPrompt(contextStr, custodyEnabled),
    };

    const recentMessages = messages.slice(-20);
    const routerMessages: AIChatMessage[] = [
      systemMsg,
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const toolResultsSummary: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { response, provider } = await routeToolsRequest(
        routerMessages,
        AI_TOOLS as unknown as AIToolDefinition[],
        { temperature: 0.3, maxTokens: 1000, timeoutMs: 10000 }
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const content = sanitizeResponse(response.content || "");
        if (content.length < 5 && toolResultsSummary.length > 0) {
          await logAIRequest({
            userId: user.id,
            groupId,
            provider,
            feature: "assistant_chat",
            success: true,
            responseTimeMs: Date.now() - start,
          });
          return NextResponse.json({
            role: "assistant",
            content: toolResultsSummary.join("\n"),
          });
        }

        await logAIRequest({
          userId: user.id,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });

        return NextResponse.json({
          role: "assistant",
          content: content || "Nao entendi. Pode reformular?",
        });
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

        console.log(`[AI-ROUTER] Tool: ${toolCall.function.name}`, args);
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

    // Exhausted tool rounds — get final text response
    try {
      const { text: finalText, provider } = await routeTextRequest(
        routerMessages,
        { temperature: 0.4, maxTokens: 1000, timeoutMs: 10000 }
      );

      const finalContent = sanitizeResponse(finalText);
      if (finalContent && finalContent.length >= 5) {
        await logAIRequest({
          userId: user.id,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({ role: "assistant", content: finalContent });
      }
    } catch {
      // Fall through to default
    }

    if (toolResultsSummary.length > 0) {
      return NextResponse.json({
        role: "assistant",
        content: toolResultsSummary.join("\n"),
      });
    }

    return NextResponse.json({
      role: "assistant",
      content: "Pronto! Acao realizada com sucesso. \u2705",
    });
  } catch (error: unknown) {
    console.error("AI Chat error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";

    const isRateLimit = /rate_limit|429|Limit|tokens|abort|TPD/i.test(msg);

    await logAIRequest({
      userId: "unknown",
      provider: "none",
      feature: "assistant_chat",
      success: false,
      responseTimeMs: Date.now() - start,
      errorMessage: msg,
    });

    if (isRateLimit) {
      return NextResponse.json(
        { error: "O assistente atingiu o limite temporario. Tente em alguns minutos. \u23F3" },
        { status: 429 }
      );
    }

    reportServerError(error, { filePath: "src/app/api/ai/assistant/route.ts" });
    return NextResponse.json(
      { error: "Desculpe, ocorreu um erro. Tente novamente. \uD83D\uDE4F" },
      { status: 500 }
    );
  }
}
