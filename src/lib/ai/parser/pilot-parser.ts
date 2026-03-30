/* ------------------------------------------------------------------ */
/* PilotParser — free tier: Tesseract.js + Groq                        */
/* ------------------------------------------------------------------ */

import { EventParser } from "./event-parser.interface";
import { ParseResult, ParserMetadata } from "./types";
import { extractText } from "./ocr";
import { parseEventFromText } from "./groq-event-parser";

export class PilotParser implements EventParser {
  async parse(
    file: File
  ): Promise<ParseResult & { metadata: ParserMetadata }> {
    const start = Date.now();

    try {
      // 1. Convert file to buffer for OCR
      const buffer = Buffer.from(await file.arrayBuffer());

      // 2. Extract text via Tesseract
      const { text: rawText, confidence } = await extractText(buffer);

      if (!rawText || rawText.length < 10) {
        return {
          success: false,
          data: null,
          rawText: rawText || "",
          error: "Não foi possível extrair texto do arquivo. Tente uma imagem mais nítida.",
          metadata: {
            ocrConfidence: confidence,
            processingTimeMs: Date.now() - start,
            parserType: "pilot",
          },
        };
      }

      // 3. Parse text with Groq LLM
      const data = await parseEventFromText(rawText);

      // 4. Validate minimum fields
      const hasMinimum = data.title || data.date;

      return {
        success: !!hasMinimum,
        data: hasMinimum ? data : null,
        rawText,
        error: hasMinimum
          ? undefined
          : "Não foi possível identificar um evento no convite. Verifique se a imagem contém informações de data e título.",
        metadata: {
          ocrConfidence: confidence,
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
