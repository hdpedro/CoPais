/* ------------------------------------------------------------------ */
/* PilotParser — uses AI Router with multi-provider fallback           */
/*                                                                      */
/*   Image → sharp compress → AI Router (Groq→Together→Gemini) → JSON */
/* ------------------------------------------------------------------ */

import { EventParser } from "./event-parser.interface";
import { ParseResult, ParsedEventData, ParserMetadata } from "./types";
import { routeVisionRequest } from "../router";
import { compressImageForVision } from "../image-utils";

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

const USER_PROMPT =
  "Analise este convite e extraia os dados do evento como JSON.";

export class PilotParser implements EventParser {
  async parse(
    file: File
  ): Promise<ParseResult & { metadata: ParserMetadata }> {
    const start = Date.now();

    try {
      // 1. Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      console.log(
        `[pilot-parser] Processing: ${file.name}, ${(file.size / 1024).toFixed(0)}KB, ${file.type}`
      );

      // 2. Compress image for vision APIs
      const { base64, mimeType } = await compressImageForVision(buffer);

      // 3. Route through AI providers (Groq → Together → Gemini)
      const result = await routeVisionRequest(
        base64,
        mimeType,
        SYSTEM_PROMPT,
        USER_PROMPT
      );

      // 4. Parse JSON response
      const data = parseResponse(result.text);

      // 5. Validate minimum fields
      const hasMinimum = data.title || data.date;

      return {
        success: !!hasMinimum,
        data: hasMinimum ? data : null,
        rawText: result.text,
        error: hasMinimum
          ? undefined
          : "Não foi possível identificar um evento no convite. Verifique se a imagem contém informações de data e título.",
        metadata: {
          processingTimeMs: Date.now() - start,
          parserType: "pilot",
        },
      };
    } catch (err) {
      console.error("[pilot-parser] Error:", err);
      return {
        success: false,
        data: null,
        rawText: "",
        error:
          err instanceof Error
            ? `Erro ao processar: ${err.message}`
            : "Erro inesperado ao processar o convite.",
        metadata: {
          processingTimeMs: Date.now() - start,
          parserType: "pilot",
        },
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Response parsing & normalization                                     */
/* ------------------------------------------------------------------ */

function parseResponse(raw: string): ParsedEventData {
  // Extract JSON from response (model might wrap in markdown code block)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : "{}";
  const parsed = JSON.parse(jsonStr);

  return {
    title: parsed.title || null,
    date: normalizeDate(parsed.date),
    start_time: normalizeTime(parsed.start_time),
    end_time: normalizeTime(parsed.end_time),
    location: parsed.location || null,
    notes: parsed.notes || null,
  };
}

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
