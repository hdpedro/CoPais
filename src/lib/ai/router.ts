/* ------------------------------------------------------------------ */
/* AI Router — tries providers in order until one succeeds              */
/*                                                                      */
/*   Request → [Groq] → falhou? → [Together] → falhou? → [Gemini]     */
/*                                                                      */
/* All providers are free tier. The router skips providers that don't   */
/* have API keys configured.                                            */
/* ------------------------------------------------------------------ */

import { AIProvider, AIProviderResult } from "./providers";
import { GroqProvider } from "./providers/groq";
import { TogetherProvider } from "./providers/together";
import { GeminiProvider } from "./providers/gemini";

/** Provider chain in priority order */
const PROVIDERS: AIProvider[] = [
  new GroqProvider(),
  new TogetherProvider(),
  new GeminiProvider(),
];

export interface RouterResult extends AIProviderResult {
  attempts: { provider: string; error: string }[];
}

/**
 * Send an image to vision models with automatic fallback.
 * Tries each provider in order: Groq → Together → Gemini.
 * Skips providers without API keys configured.
 */
export async function routeVisionRequest(
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RouterResult> {
  const attempts: { provider: string; error: string }[] = [];
  const available = PROVIDERS.filter((p) => p.isAvailable());

  if (available.length === 0) {
    throw new Error(
      "Nenhum provedor de IA configurado. Configure pelo menos uma das variáveis: GROQ_API_KEY, TOGETHER_API_KEY, GEMINI_API_KEY"
    );
  }

  console.log(
    `[ai-router] Available providers: ${available.map((p) => p.name).join(", ")}`
  );

  for (const provider of available) {
    try {
      console.log(`[ai-router] Trying ${provider.name}...`);
      const text = await provider.generateFromImage(
        imageBase64,
        mimeType,
        systemPrompt,
        userPrompt
      );
      console.log(
        `[ai-router] ${provider.name} succeeded (${text.length} chars)`
      );
      return { text, provider: provider.name, attempts };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`[ai-router] ${provider.name} failed: ${message}`);
      attempts.push({ provider: provider.name, error: message });
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}: ${a.error}`)
    .join(" | ");
  throw new Error(`Todos os provedores de IA falharam. ${summary}`);
}

/**
 * Get list of configured providers (for health checks / UI).
 */
export function getConfiguredProviders(): string[] {
  return PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.name);
}
