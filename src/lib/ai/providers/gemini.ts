/* ------------------------------------------------------------------ */
/* Google Gemini Provider — vision + text (no function calling)         */
/* Free tier: 15 RPM, 1M tokens/day, 1500 req/day                     */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./types";
import {
  AIChatMessage,
  AIToolDefinition,
  AIToolResponse,
  AITextOptions,
} from "../core/types";

const MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT = 30000;

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callGemini(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API ${res.status}: ${err}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } finally {
    clearTimeout(timer);
  }
}

/** Convert OpenAI-style messages to Gemini format */
function toGeminiContents(
  messages: AIChatMessage[]
): { systemInstruction: string; contents: Record<string, unknown>[] } {
  let systemInstruction = "";
  const contents: Record<string, unknown>[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction += (typeof msg.content === "string" ? msg.content : "") + "\n";
      continue;
    }
    if (msg.role === "tool") continue; // Skip tool messages

    const role = msg.role === "assistant" ? "model" : "user";
    const text = typeof msg.content === "string" ? msg.content : "";

    if (text) {
      contents.push({ role, parts: [{ text }] });
    }
  }

  return { systemInstruction: systemInstruction.trim(), contents };
}

export class GeminiProvider implements AIProvider {
  readonly name = "Gemini";

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string,
    options?: AITextOptions
  ): Promise<string> {
    return callGemini(
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          maxOutputTokens: options?.maxTokens ?? 500,
          responseMimeType: "application/json",
        },
      },
      options?.timeoutMs || DEFAULT_TIMEOUT
    );
  }

  async generateText(
    messages: AIChatMessage[],
    options?: AITextOptions
  ): Promise<string> {
    const { systemInstruction, contents } = toGeminiContents(messages);

    return callGemini(
      {
        ...(systemInstruction
          ? { system_instruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens: options?.maxTokens ?? 1000,
        },
      },
      options?.timeoutMs || DEFAULT_TIMEOUT
    );
  }

  supportsTools(): boolean {
    return false; // Gemini function calling uses a different format
  }

  async generateWithTools(
    _messages: AIChatMessage[], // eslint-disable-line @typescript-eslint/no-unused-vars
    _tools: AIToolDefinition[], // eslint-disable-line @typescript-eslint/no-unused-vars
    _options?: AITextOptions // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<AIToolResponse> {
    throw new Error("Gemini provider does not support function calling");
  }
}
