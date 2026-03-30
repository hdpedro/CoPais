/* ------------------------------------------------------------------ */
/* PilotParser — free tier: Groq Vision (single API call)              */
/* No more Tesseract.js — image goes directly to vision model          */
/* ------------------------------------------------------------------ */

import { EventParser } from "./event-parser.interface";
import { ParseResult, ParserMetadata } from "./types";
import { parseEventFromImage } from "./groq-vision-parser";

export class PilotParser implements EventParser {
  async parse(
    file: File
  ): Promise<ParseResult & { metadata: ParserMetadata }> {
    const start = Date.now();

    try {
      // 1. Convert file to base64
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mimeType = file.type || "image/jpeg";

      // 2. Send image directly to Groq vision model
      const { data, rawText } = await parseEventFromImage(base64, mimeType);

      // 3. Validate minimum fields
      const hasMinimum = data.title || data.date;

      return {
        success: !!hasMinimum,
        data: hasMinimum ? data : null,
        rawText,
        error: hasMinimum
          ? undefined
          : "Não foi possível identificar um evento no convite. Verifique se a imagem contém informações de data e título.",
        metadata: {
          processingTimeMs: Date.now() - start,
          parserType: "pilot",
        },
      };
    } catch (err) {
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
