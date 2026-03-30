/* ------------------------------------------------------------------ */
/* AI Core Types — shared across all AI modules                        */
/* ------------------------------------------------------------------ */

/** Supported AI feature types */
export type AIFeature =
  | "invite_parser"
  | "assistant_chat"
  | "assistant_tool"
  | "summary"
  | "suggestion";

/** Chat message format (OpenAI-compatible) */
export interface AIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | AIChatContentPart[];
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
}

export interface AIChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

/** Tool call from model */
export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** Tool definition for function calling */
export interface AIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Options for text generation */
export interface AITextOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Response from text generation with tools */
export interface AIToolResponse {
  content: string | null;
  toolCalls: AIToolCall[];
  finishReason: string;
}

/** AI request log entry */
export interface AIRequestLog {
  userId: string;
  groupId?: string;
  provider: string;
  feature: AIFeature;
  success: boolean;
  responseTimeMs: number;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
}
