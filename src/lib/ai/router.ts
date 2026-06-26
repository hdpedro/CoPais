/* ------------------------------------------------------------------ */
/* AI Router — tries providers in order until one returns a USABLE      */
/* result.                                                              */
/*                                                                      */
/*   Request → [OpenAI] → [Groq] → [Together] → [Gemini]             */
/*                                                                      */
/* Hardening: the cascade falls through on BOTH exceptions AND          */
/* empty/unusable responses. A provider that "succeeds" at the API      */
/* level but returns blank text (e.g. a vision model that can't read    */
/* the image) no longer dead-ends the request — the next provider is    */
/* tried. Only when every provider is exhausted do we throw. Tools      */
/* routing keeps its old contract (any non-throwing response is         */
/* accepted) so a legitimate empty tool-turn still degrades gracefully  */
/* upstream instead of becoming a hard error.                           */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./providers/types";
import { OpenAIProvider } from "./providers/openai";
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
  new OpenAIProvider(),
  new GroqProvider(),
  new TogetherProvider(),
  new GeminiProvider(),
];

export interface Attempt {
  provider: string;
  error: string;
}

export interface RouterResult {
  text: string;
  provider: string;
  attempts: Attempt[];
}

export interface RouterToolResult {
  response: AIToolResponse;
  provider: string;
  attempts: Attempt[];
}

function getAvailable(requireTools = false): AIProvider[] {
  return PROVIDERS.filter(
    (p) => p.isAvailable() && (!requireTools || p.supportsTools())
  );
}

function buildError(attempts: Attempt[]): Error {
  const summary = attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ");
  return new Error(`Todos os provedores falharam. ${summary}`);
}

const isNonEmptyText = (t: string): boolean =>
  typeof t === "string" && t.trim().length > 0;

/**
 * Try each provider in order; return the first whose result passes `isUsable`.
 * Falls through on exceptions AND on `isUsable === false` (empty/blank
 * responses), so a provider that returns blank no longer dead-ends the cascade.
 * Throws `buildError` only once every provider has been exhausted.
 *
 * Exported so the routing contract can be unit-tested with fake providers.
 */
export async function runProviderChain<T>(
  providers: AIProvider[],
  kind: string,
  call: (provider: AIProvider) => Promise<T>,
  isUsable: (result: T) => boolean,
): Promise<{ result: T; provider: string; attempts: Attempt[] }> {
  if (providers.length === 0) {
    throw new Error(`Nenhum provedor de IA disponível (${kind}).`);
  }

  const attempts: Attempt[] = [];
  console.log(`[ai-router:${kind}] Providers: ${providers.map((p) => p.name).join(", ")}`);

  for (const provider of providers) {
    try {
      const result = await call(provider);
      if (isUsable(result)) {
        console.log(`[ai-router:${kind}] ${provider.name} OK`);
        return { result, provider: provider.name, attempts };
      }
      attempts.push({ provider: provider.name, error: "empty/unusable response" });
      console.warn(`[ai-router:${kind}] ${provider.name} returned an unusable response — trying next`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      attempts.push({ provider: provider.name, error: message });
      console.error(`[ai-router:${kind}] ${provider.name} failed: ${message}`);
    }
  }

  console.error(
    `[ai-router:${kind}] ALL_PROVIDERS_FAILED — ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`,
  );
  throw buildError(attempts);
}

/* ------------------------------------------------------------------ */
/* Vision routing — falls through on blank OCR output                   */
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
  const { result, provider, attempts } = await runProviderChain(
    available,
    "vision",
    (p) => p.generateFromImage(imageBase64, mimeType, systemPrompt, userPrompt, options),
    isNonEmptyText,
  );
  return { text: result, provider, attempts };
}

/* ------------------------------------------------------------------ */
/* Text routing — falls through on blank text                           */
/* ------------------------------------------------------------------ */

export async function routeTextRequest(
  messages: AIChatMessage[],
  options?: AITextOptions
): Promise<RouterResult> {
  const available = getAvailable();
  if (available.length === 0) {
    throw new Error("Nenhum provedor de IA configurado.");
  }
  const { result, provider, attempts } = await runProviderChain(
    available,
    "text",
    (p) => p.generateText(messages, options),
    isNonEmptyText,
  );
  return { text: result, provider, attempts };
}

/* ------------------------------------------------------------------ */
/* Tools routing (function calling — Groq + Together only)              */
/* Keeps the old contract: any non-throwing response is accepted, so a  */
/* legitimate empty tool-turn degrades gracefully upstream.             */
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
  const { result, provider, attempts } = await runProviderChain(
    available,
    "tools",
    (p) => p.generateWithTools(messages, tools, options),
    () => true,
  );
  return { response: result, provider, attempts };
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
