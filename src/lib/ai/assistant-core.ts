/* ------------------------------------------------------------------ */
/* assistant-core.ts                                                   */
/* The ONE orchestration shared by the in-app Kindar IA and WhatsApp.  */
/*                                                                     */
/* Extracted verbatim from the pipeline that used to be duplicated in  */
/* src/app/api/ai/assistant/route.ts and src/lib/whatsapp/processor.ts.*/
/* Given a built family context + the user's text + conversation       */
/* history, it runs: local action parser → local queries/multi/follow- */
/* up/ambiguity → off-topic → LLM fallback (3 tool rounds), and returns */
/* a channel-agnostic result. Each adapter renders it (HTTP JSON vs     */
/* WhatsApp messages) and keeps its own confirmation-state + error UX.  */
/*                                                                     */
/* Behavior contract is pinned by tests/characterization/*.            */
/* ------------------------------------------------------------------ */

import { AI_TOOLS, executeTool, ToolContext } from "./tools";
import { parseIntent } from "./local-parser";
import {
  parseQueryIntent,
  fuzzyMatchIntent,
  dispatchCustomAction,
  parseMultiIntent,
  detectChildAmbiguity,
  loadSessionState,
  saveSessionState,
  applyFollowUp,
} from "./local-queries";
import { hasNegation, detectOffTopic } from "./local-helpers";
import { routeToolsRequest, routeTextRequest } from "./router";
import { logAIRequest } from "./core/logger";
import { AIChatMessage, AIToolDefinition } from "./core/types";
import { buildSystemPrompt, mapLocalActionToTool, sanitizeResponse } from "./assistant-shared";

const MAX_TOOL_ROUNDS = 3;

/** Channel-agnostic outcome of one assistant turn (excluding confirmation
 *  replies, which each adapter handles with its own state model). */
export type AssistantTurnResult =
  | { kind: "text"; text: string }
  | {
      kind: "confirm";
      confirmation: string;
      action: string;
      params: Record<string, string>;
      originalText: string;
    };

export interface AssistantTurnInput {
  /** The current user message (already transcribed if it came as audio). */
  userText: string;
  /** Full conversation incl. the current user turn as the last message,
   *  used for the LLM fallback. App passes messages.slice(-20); WhatsApp
   *  passes logs window + the current turn. */
  history: AIChatMessage[];
  contextStr: string;
  toolCtx: ToolContext;
  custodyEnabled: boolean;
  userId: string;
  groupId: string;
  /** Date.now() at request start, for logAIRequest timing parity. */
  startMs: number;
}

/**
 * Run the shared assistant pipeline. Throws if the LLM tool router fails
 * (each adapter catches and renders its own error). Never sends anything.
 */
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const { userText, history, contextStr, toolCtx, custodyEnabled, userId, groupId } = input;
  const start = input.startMs;

  const childNames = toolCtx.children.map((c) => c.name);
  const memberNames = toolCtx.members.map((m) => m.name);

  /* ---- Local action parser (create* → confirm, others → execute) ---- */
  const localIntent = parseIntent(userText, childNames, memberNames, "pt");
  const negated = hasNegation(userText);

  if (localIntent && localIntent.confidence >= 0.7 && !(localIntent.action.startsWith("create") && negated)) {
    const isActionIntent = localIntent.action.startsWith("create");

    if (isActionIntent) {
      await logAIRequest({ userId, groupId, provider: "local", feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
      return {
        kind: "confirm",
        confirmation: localIntent.confirmation,
        action: localIntent.action,
        params: localIntent.params,
        originalText: userText,
      };
    }

    const mapped = mapLocalActionToTool(localIntent, toolCtx);
    if (mapped) {
      const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);
      await logAIRequest({ userId, groupId, provider: "local", feature: "assistant_tool", success: result.success, responseTimeMs: Date.now() - start });
      if (result.success) return { kind: "text", text: `✅ ${result.message}` };
    }
  }

  /* ---- Local queries + synthesis + drafts (no LLM) ---- */
  const queryParseCtx = {
    children: toolCtx.children.map((c) => ({ id: c.id, name: c.name })),
    members: toolCtx.members,
    currentUserId: userId,
  };

  const multiIntents = parseMultiIntent(userText, queryParseCtx);
  if (multiIntents.length >= 2) {
    const results: string[] = [];
    for (const intent of multiIntents) {
      let result;
      if (intent.action.startsWith("custom")) {
        result = await dispatchCustomAction(intent, toolCtx);
      } else {
        const mapped = mapLocalActionToTool({ action: intent.action, params: intent.params, confidence: intent.confidence }, toolCtx);
        if (mapped) result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);
      }
      if (result?.success && result.message) results.push(result.message);
    }
    if (results.length >= 2) {
      await logAIRequest({ userId, groupId, provider: "local-multi", feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
      return { kind: "text", text: results.join("\n\n---\n\n") };
    }
  }

  const sessionState = await loadSessionState(toolCtx);
  const followUp = applyFollowUp(userText, sessionState, queryParseCtx);

  let queryIntent = parseQueryIntent(userText, queryParseCtx);
  let queryProvider = "local-regex";
  if (!queryIntent) {
    queryIntent = fuzzyMatchIntent(userText, queryParseCtx);
    if (queryIntent) queryProvider = "local-fuzzy";
  }
  if (!queryIntent && followUp) {
    queryIntent = followUp;
    queryProvider = "local-followup";
  }

  if (queryIntent && !queryIntent.params.child_name && !queryIntent.params.childName) {
    const requiresChild = ["queryHealth", "queryStatus", "queryHistory", "customChildSummary"];
    if (requiresChild.includes(queryIntent.action)) {
      const ambig = detectChildAmbiguity(userText, toolCtx.children);
      if (ambig.ambiguous && ambig.candidates.length >= 2) {
        const names = ambig.candidates.map((c) => c.name.split(" ")[0]).join(" ou ");
        await logAIRequest({ userId, groupId, provider: "local-clarify", feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
        return { kind: "text", text: `Você quer dizer **${names}**? Me confirma qual.` };
      }
    }
  }

  if (queryIntent && queryIntent.confidence >= 0.6) {
    if (queryIntent.action.startsWith("custom")) {
      const result = await dispatchCustomAction(queryIntent, toolCtx);
      if (result) {
        await logAIRequest({
          userId,
          groupId,
          provider: queryProvider === "local-fuzzy" ? "local-fuzzy-custom" : queryProvider === "local-followup" ? "local-followup-custom" : "local-custom",
          feature: "assistant_chat",
          success: result.success,
          responseTimeMs: Date.now() - start,
        });
        if (result.success) await saveSessionState(toolCtx, queryIntent).catch(() => {});
        return { kind: "text", text: result.message };
      }
    }

    const mappedQuery = mapLocalActionToTool({ action: queryIntent.action, params: queryIntent.params, confidence: queryIntent.confidence }, toolCtx);
    if (mappedQuery) {
      const result = await executeTool(mappedQuery.toolName, mappedQuery.toolParams, toolCtx);
      await logAIRequest({ userId, groupId, provider: queryProvider, feature: "assistant_tool", success: result.success, responseTimeMs: Date.now() - start });
      if (result.success) {
        await saveSessionState(toolCtx, queryIntent).catch(() => {});
        return { kind: "text", text: result.message };
      }
    }
  }

  /* ---- Off-topic — escopo Kindar = filhos + coparentalidade ---- */
  const offTopic = detectOffTopic(userText);
  if (offTopic.category) {
    await logAIRequest({ userId, groupId, provider: `local-offtopic-${offTopic.category}`, feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
    return { kind: "text", text: offTopic.reply || "" };
  }

  /* ---- LLM fallback (Groq → Together → Gemini via router) ---- */
  const systemMsg: AIChatMessage = { role: "system", content: buildSystemPrompt(contextStr, custodyEnabled) };
  const routerMessages: AIChatMessage[] = [systemMsg, ...history];
  const toolResultsSummary: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { response, provider } = await routeToolsRequest(routerMessages, AI_TOOLS as unknown as AIToolDefinition[], { temperature: 0.3, maxTokens: 1000, timeoutMs: 10000 });

    if (!response.toolCalls || response.toolCalls.length === 0) {
      const content = sanitizeResponse(response.content || "");
      await logAIRequest({ userId, groupId, provider, feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
      const text = content.length >= 5 ? content : toolResultsSummary.length > 0 ? toolResultsSummary.join("\n") : "Nao entendi. Pode reformular?";
      return { kind: "text", text };
    }

    routerMessages.push({ role: "assistant", content: response.content || "", tool_calls: response.toolCalls });

    for (const toolCall of response.toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }
      const result = await executeTool(toolCall.function.name, args, toolCtx);
      if (result.message) {
        toolResultsSummary.push(result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`);
      }
      routerMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  // Exhausted tool rounds — try one final text response.
  try {
    const { text: finalText, provider } = await routeTextRequest(routerMessages, { temperature: 0.4, maxTokens: 1000, timeoutMs: 10000 });
    const finalContent = sanitizeResponse(finalText);
    if (finalContent && finalContent.length >= 5) {
      await logAIRequest({ userId, groupId, provider, feature: "assistant_chat", success: true, responseTimeMs: Date.now() - start });
      return { kind: "text", text: finalContent };
    }
  } catch {
    // fall through to summary / default
  }

  if (toolResultsSummary.length > 0) return { kind: "text", text: toolResultsSummary.join("\n") };
  return { kind: "text", text: "Pronto! Acao realizada com sucesso. ✅" };
}
