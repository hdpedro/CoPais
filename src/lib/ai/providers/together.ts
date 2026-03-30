/* ------------------------------------------------------------------ */
/* Together AI Provider — vision + text + tools (OpenAI-compatible)     */
/* Free tier: rate limited but no cost                                  */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./types";
import {
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "../core/types";

const VISION_MODEL = "meta-llama/Llama-Vision-Free";
const TEXT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";
const API_URL = "https://api.together.xyz/v1/chat/completions";
const DEFAULT_TIMEOUT = 30000;

async function callAPI(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Together API ${res.status}: ${err}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export class TogetherProvider implements AIProvider {
  readonly name = "Together";

  isAvailable(): boolean {
    return !!process.env.TOGETHER_API_KEY;
  }

  async generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string,
    options?: AITextOptions
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await callAPI(
      {
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
      },
      options?.timeoutMs || DEFAULT_TIMEOUT
    );

    return data.choices?.[0]?.message?.content || "{}";
  }

  async generateText(
    messages: AIChatMessage[],
    options?: AITextOptions
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await callAPI(
      {
        model: TEXT_MODEL,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      },
      options?.timeoutMs || DEFAULT_TIMEOUT
    );

    return data.choices?.[0]?.message?.content || "";
  }

  supportsTools(): boolean {
    return true;
  }

  async generateWithTools(
    messages: AIChatMessage[],
    tools: AIToolDefinition[],
    options?: AITextOptions
  ): Promise<AIToolResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await callAPI(
      {
        model: TEXT_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      },
      options?.timeoutMs || DEFAULT_TIMEOUT
    );

    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || null,
      toolCalls: (choice?.message?.tool_calls || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tc: any) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })
      ),
      finishReason: choice?.finish_reason || "stop",
    };
  }
}
