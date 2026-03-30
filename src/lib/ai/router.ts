/* ------------------------------------------------------------------ */
/* AI Router — tries providers in order until one succeeds              */
/*                                                                      */
/*   Request → [Groq] → falhou? → [Together] → falhou? → [Gemini]     */
/*                                                                      */
/* Supports: vision, text, and function calling (tools)                 */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./providers/types";
import { GroqProvider } from "./providers/groq";
import { TogetherProvider } from "./providers/together";
import { GeminiProvider } from "./providers/gemini";
import {
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "./core/types";

/** Provider chain in priority order */
const PROVIDERS: AIProvider[] = [
  new GroqProvider(),
  new TogetherProvider(),
  new GeminiProvider(),
];

export interface RouterResult {
  text: string;
  provider: string;
  attempts: { provider: string; error: string }[];
}

export interface RouterToolResult {
  response: AIToolResponse;
  provider: string;
  attempts: { provider: string; error: string }[];
}

function getAvailable(requireTools = false): AIProvider[] {
  return PROVIDERS.filter(
    (p) => p.isAvailable() && (!requireTools || p.supportsTools())
  );
}

function buildError(attempts: { provider: string; error: string }[]): Error {
  const summary = attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ");
  return new Error(`Todos os provedores falharam. ${summary}`);
}

/* ------------------------------------------------------------------ */
/* Vision routing                                                       */
/* ------------------------------------------------------------------ */

export async function routeVisionRequest(
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  userPrompt: string,
  options?: AITextOptions
): Promise<RouterResult> {
  const available = getAvailable();
  if (available.length === 0) {
    throw new Error("Nenhum provedor de IA configurado.");
  }

  const attempts: { provider: string; error: string }[] = [];
  console.log(`[ai-router:vision] Providers: ${available.map((p) => p.name).join(", ")}`);

  for (const provider of available) {
    try {
      console.log(`[ai-router:vision] Trying ${provider.name}...`);
      const text = await provider.generateFromImage(
        imageBase64, mimeType, systemPrompt, userPrompt, options
      );
      console.log(`[ai-router:vision] ${provider.name} OK (${text.length} chars)`);
      return { text, provider: provider.name, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ai-router:vision] ${provider.name} failed: ${message}`);
      attempts.push({ provider: provider.name, error: message });
    }
  }

  throw buildError(attempts);
}

/* ------------------------------------------------------------------ */
/* Text routing                                                         */
/* ------------------------------------------------------------------ */

export async function routeTextRequest(
  messages: AIChatMessage[],
  options?: AITextOptions
): Promise<RouterResult> {
  const available = getAvailable();
  if (available.length === 0) {
    throw new Error("Nenhum provedor de IA configurado.");
  }

  const attempts: { provider: string; error: string }[] = [];
  console.log(`[ai-router:text] Providers: ${available.map((p) => p.name).join(", ")}`);

  for (const provider of available) {
    try {
      console.log(`[ai-router:text] Trying ${provider.name}...`);
      const text = await provider.generateText(messages, options);
      console.log(`[ai-router:text] ${provider.name} OK (${text.length} chars)`);
      return { text, provider: provider.name, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ai-router:text] ${provider.name} failed: ${message}`);
      attempts.push({ provider: provider.name, error: message });
    }
  }

  throw buildError(attempts);
}

/* ------------------------------------------------------------------ */
/* Tools routing (function calling — Groq + Together only)              */
/* ------------------------------------------------------------------ */

export async function routeToolsRequest(
  messages: AIChatMessage[],
  tools: AIToolDefinition[],
  options?: AITextOptions
): Promise<RouterToolResult> {
  const available = getAvailable(true);
  if (available.length === 0) {
    throw new Error("Nenhum provedor com function calling disponível.");
  }

  const attempts: { provider: string; error: string }[] = [];
  console.log(`[ai-router:tools] Providers: ${available.map((p) => p.name).join(", ")}`);

  for (const provider of available) {
    try {
      console.log(`[ai-router:tools] Trying ${provider.name}...`);
      const response = await provider.generateWithTools(messages, tools, options);
      console.log(
        `[ai-router:tools] ${provider.name} OK (tools: ${response.toolCalls.length}, content: ${response.content?.length || 0} chars)`
      );
      return { response, provider: provider.name, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[ai-router:tools] ${provider.name} failed: ${message}`);
      attempts.push({ provider: provider.name, error: message });
    }
  }

  throw buildError(attempts);
}

/* ------------------------------------------------------------------ */
/* Utilities                                                            */
/* ------------------------------------------------------------------ */

export function getConfiguredProviders(): string[] {
  return PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.name);
}

export function getToolProviders(): string[] {
  return PROVIDERS.filter((p) => p.isAvailable() && p.supportsTools()).map((p) => p.name);
}
