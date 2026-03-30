/* ------------------------------------------------------------------ */
/* Groq LLM — interprets OCR text into structured event data           */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import { ParsedEventData } from "./types";

const MODEL = "llama-3.3-70b-versatile";
const MODEL_FALLBACK = "llama-3.1-8b-instant";
const TIMEOUT_MS = 10000;

const SYSTEM_PROMPT = `Você é um assistente que transforma textos de convites em eventos estruturados.

Extraia as seguintes informações do texto:
- título: nome do evento (ex: "Festa do João", "Aniversário da Maria")
- data: data do evento no formato YYYY-MM-DD
- hora início: horário de início no formato HH:MM (24h)
- hora fim: horário de término no formato HH:MM (24h)
- local: endereço ou nome do local
- observações: informações extras relevantes (traje, presente, tema, etc.)

REGRAS:
- O ano atual é ${new Date().getFullYear()}
- Se o mês do evento já passou neste ano, assuma o próximo ano
- Se não encontrar algum campo, use null
- Retorne APENAS um JSON válido, sem markdown, sem explicação
- Formato exato:
{"title":"","date":"","start_time":"","end_time":"","location":"","notes":""}`;

export async function parseEventFromText(
  text: string
): Promise<ParsedEventData> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  async function tryModel(model: string): Promise<ParsedEventData> {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Texto do convite:\n\n${text}` },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Groq timeout")), TIMEOUT_MS)
      ),
    ]);

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return {
      title: parsed.title || null,
      date: normalizeDate(parsed.date),
      start_time: normalizeTime(parsed.start_time),
      end_time: normalizeTime(parsed.end_time),
      location: parsed.location || null,
      notes: parsed.notes || null,
    };
  }

  try {
    return await tryModel(MODEL);
  } catch {
    return await tryModel(MODEL_FALLBACK);
  }
}

/* ------------------------------------------------------------------ */
/* Normalization helpers                                                */
/* ------------------------------------------------------------------ */

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY
  const brMatch = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function normalizeTime(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[:\-h](\d{2})?/);
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = (match[2] || "00").padStart(2, "0");
    if (parseInt(h) < 24 && parseInt(m) < 60) return `${h}:${m}`;
  }
  return null;
}
