/* ------------------------------------------------------------------ */
/* Google Gemini Vision Provider — gemini-2.0-flash                    */
/* Free tier: 15 RPM, 1M tokens/day, 1500 req/day                     */
/* Uses REST API directly (no extra SDK needed)                        */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./types";

const MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 30000;

function getApiUrl(): string {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
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
    userPrompt: string
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(getApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${this.name} API ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    } finally {
      clearTimeout(timer);
    }
  }
}
