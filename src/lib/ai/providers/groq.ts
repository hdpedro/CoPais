/* ------------------------------------------------------------------ */
/* Groq Vision Provider — llama-4-scout                                */
/* Free tier: 30 req/min, 14,400 req/day                               */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import { AIProvider } from "./types";

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TIMEOUT_MS = 25000;

export class GroqProvider implements AIProvider {
  readonly name = "Groq";

  isAvailable(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  async generateFromImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await Promise.race([
      groq.chat.completions.create({
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
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${this.name} timeout (${TIMEOUT_MS}ms)`)), TIMEOUT_MS)
      ),
    ]);

    return completion.choices[0]?.message?.content || "{}";
  }
}
