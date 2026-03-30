/* ------------------------------------------------------------------ */
/* Groq Provider — vision + text + function calling                    */
/* Free tier: 30 req/min, 14,400 req/day                               */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import { AIProvider } from "./types";
import {
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "../core/types";

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TEXT_MODEL_PRIMARY = "llama-3.3-70b-versatile";
const TEXT_MODEL_FALLBACK = "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT = 25000;

function getClient(): Groq {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Groq timeout (${ms}ms)`)), ms)
    ),
  ]);
}

export class GroqProvider implements AIProvider {
  readonly name = "Groq";

  isAvailable(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  async generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string,
    options?: AITextOptions
  ): Promise<string> {
    const groq = getClient();
    const timeout = options?.timeoutMs || DEFAULT_TIMEOUT;

    const completion = await withTimeout(
      groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 500,
      }),
      timeout
    );

    return completion.choices[0]?.message?.content || "{}";
  }

  async generateText(
    messages: AIChatMessage[],
    options?: AITextOptions
  ): Promise<string> {
    const groq = getClient();
    const timeout = options?.timeoutMs || DEFAULT_TIMEOUT;

    try {
      const completion = await withTimeout(
        groq.chat.completions.create({
          model: TEXT_MODEL_PRIMARY,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1000,
        }),
        timeout
      );
      return completion.choices[0]?.message?.content || "";
    } catch (err) {
      // Rate limit on primary → try fallback
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("rate_limit") || msg.includes("429") || msg.includes("TPD")) {
        const completion = await withTimeout(
          groq.chat.completions.create({
            model: TEXT_MODEL_FALLBACK,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: messages as any,
            temperature: options?.temperature ?? 0.3,
            max_tokens: options?.maxTokens ?? 1000,
          }),
          timeout
        );
        return completion.choices[0]?.message?.content || "";
      }
      throw err;
    }
  }

  supportsTools(): boolean {
    return true;
  }

  async generateWithTools(
    messages: AIChatMessage[],
    tools: AIToolDefinition[],
    options?: AITextOptions
  ): Promise<AIToolResponse> {
    const groq = getClient();
    const timeout = options?.timeoutMs || DEFAULT_TIMEOUT;

    async function tryModel(model: string): Promise<AIToolResponse> {
      const completion = await withTimeout(
        groq.chat.completions.create({
          model,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: tools as any,
          tool_choice: "auto",
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1000,
        }),
        timeout
      );

      const choice = completion.choices[0];
      return {
        content: choice?.message?.content || null,
        toolCalls: (choice?.message?.tool_calls || []).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        finishReason: choice?.finish_reason || "stop",
      };
    }

    try {
      return await tryModel(TEXT_MODEL_PRIMARY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("rate_limit") || msg.includes("429") || msg.includes("TPD") || msg.includes("abort")) {
        console.log(`[groq] ${TEXT_MODEL_PRIMARY} rate limited, falling back to ${TEXT_MODEL_FALLBACK}`);
        return await tryModel(TEXT_MODEL_FALLBACK);
      }
      throw err;
    }
  }
}
