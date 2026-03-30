/* ------------------------------------------------------------------ */
/* AI Provider interface — all providers implement this                 */
/* ------------------------------------------------------------------ */

import {
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "../core/types";

export interface AIProviderResult {
  text: string;
  provider: string;
}

export interface AIProvider {
  /** Provider display name */
  readonly name: string;

  /** Check if provider has API key configured */
  isAvailable(): boolean;

  /** Vision: analyze an image with a prompt */
  generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string,
    options?: AITextOptions
  ): Promise<string>;

  /** Text: generate text from chat messages */
  generateText(
    messages: AIChatMessage[],
    options?: AITextOptions
  ): Promise<string>;

  /** Whether this provider supports function calling */
  supportsTools(): boolean;

  /** Tools: generate text with function calling (OpenAI-compatible) */
  generateWithTools(
    messages: AIChatMessage[],
    tools: AIToolDefinition[],
    options?: AITextOptions
  ): Promise<AIToolResponse>;
}
