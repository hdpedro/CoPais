/* ------------------------------------------------------------------ */
/* AI Service — single entry point for ALL AI features in Kindar       */
/*                                                                      */
/* generateAIResponse({ type, input, userId, groupId })                 */
/* ------------------------------------------------------------------ */

import {
  AIFeature,
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "./types";
import { routeVisionRequest, routeTextRequest, routeToolsRequest } from "../router";
import { logAIRequest } from "./logger";
import { canUseAI, recordUsage } from "./usage";
import { compressImageForVision } from "../image-utils";

/* ------------------------------------------------------------------ */
/* Main service interface                                               */
/* ------------------------------------------------------------------ */

interface AIRequest {
  type: AIFeature;
  userId: string;
  groupId?: string;
}

interface AIVisionRequest extends AIRequest {
  type: "invite_parser";
  imageBuffer: Buffer;
  systemPrompt: string;
  userPrompt: string;
}

interface AIChatRequest extends AIRequest {
  type: "assistant_chat" | "summary" | "suggestion";
  messages: AIChatMessage[];
  options?: AITextOptions;
}

interface AIToolRequest extends AIRequest {
  type: "assistant_tool";
  messages: AIChatMessage[];
  tools: AIToolDefinition[];
  options?: AITextOptions;
}

type GenerateRequest = AIVisionRequest | AIChatRequest | AIToolRequest;

interface AIResponse {
  success: boolean;
  text?: string;
  toolResponse?: AIToolResponse;
  provider: string;
  processingTimeMs: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Main function                                                        */
/* ------------------------------------------------------------------ */

export async function generateAIResponse(
  request: GenerateRequest
): Promise<AIResponse> {
  const start = Date.now();

  // 1. Check usage limits
  const usage = await canUseAI(request.userId, request.type);
  if (!usage.allowed) {
    return {
      success: false,
      provider: "none",
      processingTimeMs: Date.now() - start,
      error: `Limite de uso atingido para ${request.type}. Restante: ${usage.remaining}/${usage.limit}.`,
    };
  }

  try {
    let result: AIResponse;

    switch (request.type) {
      case "invite_parser":
        result = await handleVision(request as AIVisionRequest, start);
        break;
      case "assistant_tool":
        result = await handleTools(request as AIToolRequest, start);
        break;
      case "assistant_chat":
      case "summary":
      case "suggestion":
        result = await handleText(request as AIChatRequest, start);
        break;
      default: {
        const _exhaustive: never = request;
        throw new Error(`Unknown AI feature type: ${(_exhaustive as AIRequest).type}`);
      }
    }

    // 3. Log request
    await logAIRequest({
      userId: request.userId,
      groupId: request.groupId,
      provider: result.provider,
      feature: request.type,
      success: result.success,
      responseTimeMs: result.processingTimeMs,
      errorMessage: result.error,
    });

    // 4. Record usage
    if (result.success) {
      await recordUsage(request.userId, request.type);
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    const elapsed = Date.now() - start;

    await logAIRequest({
      userId: request.userId,
      groupId: request.groupId,
      provider: "none",
      feature: request.type,
      success: false,
      responseTimeMs: elapsed,
      errorMessage: errorMsg,
    });

    return {
      success: false,
      provider: "none",
      processingTimeMs: elapsed,
      error: errorMsg,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Handlers per type                                                    */
/* ------------------------------------------------------------------ */

async function handleVision(
  req: AIVisionRequest,
  start: number
): Promise<AIResponse> {
  const { base64, mimeType } = await compressImageForVision(req.imageBuffer);

  const result = await routeVisionRequest(
    base64,
    mimeType,
    req.systemPrompt,
    req.userPrompt
  );

  return {
    success: true,
    text: result.text,
    provider: result.provider,
    processingTimeMs: Date.now() - start,
  };
}

async function handleText(
  req: AIChatRequest,
  start: number
): Promise<AIResponse> {
  const result = await routeTextRequest(req.messages, req.options);

  return {
    success: true,
    text: result.text,
    provider: result.provider,
    processingTimeMs: Date.now() - start,
  };
}

async function handleTools(
  req: AIToolRequest,
  start: number
): Promise<AIResponse> {
  const result = await routeToolsRequest(
    req.messages,
    req.tools,
    req.options
  );

  return {
    success: true,
    text: result.response.content || undefined,
    toolResponse: result.response,
    provider: result.provider,
    processingTimeMs: Date.now() - start,
  };
}
