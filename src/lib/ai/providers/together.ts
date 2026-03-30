/* ------------------------------------------------------------------ */
/* Together AI Vision Provider — Llama Vision Free                     */
/* Free tier: rate limited but no cost                                  */
/* Uses OpenAI-compatible API (no extra SDK needed)                     */
/* ------------------------------------------------------------------ */

import { AIProvider } from "./types";

const MODEL = "meta-llama/Llama-Vision-Free";
const API_URL = "https://api.together.xyz/v1/chat/completions";
const TIMEOUT_MS = 30000;

export class TogetherProvider implements AIProvider {
  readonly name = "Together";

  isAvailable(): boolean {
    return !!process.env.TOGETHER_API_KEY;
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
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
                { type: "text", text: userPrompt },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${this.name} API ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "{}";
    } finally {
      clearTimeout(timer);
    }
  }
}
