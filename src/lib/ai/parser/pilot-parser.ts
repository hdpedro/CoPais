/* ------------------------------------------------------------------ */
/* PilotParser — free tier: Groq Vision (single API call)              */
/* Image is compressed with sharp before sending to Groq               */
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
      // 1. Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      console.log(
        `[pilot-parser] Processing file: ${file.name}, size=${(file.size / 1024).toFixed(0)}KB, type=${file.type}`
      );

      // 2. Send to Groq vision (handles compression internally)
      const { data, rawText } = await parseEventFromImage(buffer);

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
