/* ------------------------------------------------------------------ */
/* Groq Vision — sends image directly to vision model                  */
/* Replaces Tesseract OCR + text LLM with a single vision API call     */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import sharp from "sharp";
import { ParsedEventData } from "./types";

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TIMEOUT_MS = 30000;
const MAX_BASE64_BYTES = 3.5 * 1024 * 1024; // 3.5MB (Groq limit is 4MB)
const MAX_DIMENSION = 1536; // px — enough detail for text recognition

const SYSTEM_PROMPT = `Você é um assistente que analisa imagens de convites de festas e eventos infantis.

Extraia as seguintes informações da imagem:
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

/**
 * Compress image to fit within Groq's 4MB base64 limit.
 * Returns base64 string and mime type.
 */
async function compressImage(
  buffer: Buffer
): Promise<{ base64: string; mimeType: string }> {
  // Resize if needed and convert to JPEG for smaller size
  const processed = sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 });

  let output = await processed.toBuffer();

  // If still too large, reduce quality further
  if (output.length > MAX_BASE64_BYTES * 0.75) {
    output = await sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();
  }

  return {
    base64: output.toString("base64"),
    mimeType: "image/jpeg",
  };
}

export async function parseEventFromImage(
  imageBuffer: Buffer
): Promise<{ data: ParsedEventData; rawText: string }> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Compress image to fit Groq limits
  const { base64, mimeType } = await compressImage(imageBuffer);

  console.log(
    `[groq-vision] Sending image: ${(base64.length / 1024).toFixed(0)}KB base64, model=${VISION_MODEL}`
  );

  const completion = await Promise.race([
    groq.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Analise este convite e extraia os dados do evento como JSON.",
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Groq timeout")), TIMEOUT_MS)
    ),
  ]);

  const raw = completion.choices[0]?.message?.content || "{}";

  console.log(`[groq-vision] Response: ${raw.substring(0, 200)}`);

  // Extract JSON from response (model might wrap in markdown code block)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : "{}";
  const parsed = JSON.parse(jsonStr);

  return {
    data: {
      title: parsed.title || null,
      date: normalizeDate(parsed.date),
      start_time: normalizeTime(parsed.start_time),
      end_time: normalizeTime(parsed.end_time),
      location: parsed.location || null,
      notes: parsed.notes || null,
    },
    rawText: raw,
  };
}

/* ------------------------------------------------------------------ */
/* Normalization helpers                                                */
/* ------------------------------------------------------------------ */

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
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
