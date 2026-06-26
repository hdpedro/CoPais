/* ------------------------------------------------------------------ */
/* AI Router — tries providers in order until one returns a USABLE      */
/* result.                                                              */
/*                                                                      */
/*   Request → [OpenAI] → [Groq] → [Together] → [Gemini]             */
/*                                                                      */
/* Hardening (vision only): a provider that "succeeds" at the API level */
/* but returns a BLANK OCR result no longer dead-ends the request. The  */
/* vision models emit the sentinel "{}" (and "" for Gemini) when they   */
/* can't read the image, so the cascade treats "", "{}" and "[]" as     */
/* unusable and tries the next provider. If NO provider yields a usable */
/* result, the LAST (blank) result is returned — never a new throw — so */
/* every caller keeps degrading gracefully exactly as before. Text and  */
/* tools routing are unchanged (first non-throwing response wins), so a  */
/* legitimate empty turn there still degrades gracefully upstream and    */
/* no extra latency is introduced.                                       */
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

/**
 * A vision/OCR response is usable when it isn't blank and isn't the empty
 * sentinel the providers emit when they can't read the image. Groq/OpenAI/
 * Together default to "{}" on empty content; Gemini returns "". Treating
 * "{}" and "[]" as unusable is what makes the prescription-OCR fallback
 * actually trigger (the whole point of this change).
 */
export const isUsableVisionText = (t: string): boolean => {
  const s = (t ?? "").trim();
  return s.length > 0 && s !== "{}" && s !== "[]";
};

/** Tools/text: any non-throwing response is accepted (unchanged contract). */
const acceptAny = (): boolean => true;

/**
 * Try each provider in order; return the first whose result passes `isUsable`.
 * Falls through on exceptions AND on `isUsable === false`. If NO provider
 * yields a usable result but at least one returned (unusable), the LAST such
 * result is returned — NOT a throw — so callers keep their existing graceful
 * handling of blank output. Only when every provider THROWS do we throw.
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
  let fallback: { result: T; provider: string } | null = null;
  console.log(`[ai-router:${kind}] Providers: ${providers.map((p) => p.name).join(", ")}`);

  for (const provider of providers) {
    try {
      const result = await call(provider);
      if (isUsable(result)) {
        console.log(`[ai-router:${kind}] ${provider.name} OK`);
        return { result, provider: provider.name, attempts };
      }
      fallback = { result, provider: provider.name };
      attempts.push({ provider: provider.name, error: "empty/unusable response" });
      console.warn(`[ai-router:${kind}] ${provider.name} returned an unusable response — trying next`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      attempts.push({ provider: provider.name, error: message });
      console.error(`[ai-router:${kind}] ${provider.name} failed: ${message}`);
    }
  }

  // No usable result. If something came back (just blank), hand the last one
  // to the caller so it degrades gracefully (no new throw). Only when every
  // provider threw is there nothing to return.
  if (fallback) {
    console.warn(`[ai-router:${kind}] no usable response — returning last (${fallback.provider}); caller degrades gracefully`);
    return { result: fallback.result, provider: fallback.provider, attempts };
  }

  console.error(
    `[ai-router:${kind}] ALL_PROVIDERS_FAILED — ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`,
  );
  throw buildError(attempts);
}

/* ------------------------------------------------------------------ */
/* Vision routing — falls through on blank/"{}" OCR output              */
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
    isUsableVisionText,
  );
  return { text: result, provider, attempts };
}

/* ------------------------------------------------------------------ */
/* Text routing — unchanged: first non-throwing response wins           */
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
    acceptAny,
  );
  return { text: result, provider, attempts };
}

/* ------------------------------------------------------------------ */
/* Tools routing — unchanged: any non-throwing response is accepted     */
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
    acceptAny,
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
