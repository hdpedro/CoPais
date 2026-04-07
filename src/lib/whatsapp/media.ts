/* ------------------------------------------------------------------ */
/* WhatsApp Media Handler                                             */
/* Download media + OCR for receipt images                             */
/* ------------------------------------------------------------------ */

import { downloadMedia } from "./client";
import { routeVisionRequest } from "@/lib/ai/router";
import { compressImageForVision } from "@/lib/ai/image-utils";

export interface ExtractedReceipt {
  description: string;
  amount: number;
  date?: string;
  category?: string;
}

/**
 * Process a receipt image: download, compress, OCR via vision AI.
 * Returns extracted expense data or null if extraction fails.
 */
export async function processReceiptImage(
  mediaId: string,
  mediaMimeType: string,
  caption?: string
): Promise<ExtractedReceipt | null> {
  try {
    // Download image from Meta
    const imageBuffer = await downloadMedia(mediaId);

    // Compress for vision API
    const compressed = await compressImageForVision(imageBuffer);

    // Extract receipt info via vision AI
    const systemPrompt = `Voce e um assistente que extrai dados de recibos e notas fiscais.
Extraia as seguintes informacoes da imagem:
- description: descricao breve do que foi comprado/pago
- amount: valor total em reais (numero, ex: 150.00)
- date: data do recibo no formato YYYY-MM-DD (se visivel)
- category: categoria (education, health, food, clothing, leisure, transport, housing, other)

Responda APENAS com um JSON valido, sem markdown, sem explicacao.
Exemplo: {"description":"Farmacia Drogasil","amount":45.90,"date":"2026-04-07","category":"health"}

Se nao conseguir extrair, responda: {"error":"nao_legivel"}`;

    const userPrompt = caption
      ? `Analise este recibo. Contexto adicional: "${caption}"`
      : "Analise este recibo e extraia os dados.";

    const result = await routeVisionRequest(
      compressed.base64,
      compressed.mimeType,
      systemPrompt,
      userPrompt,
      { temperature: 0.1, maxTokens: 200, timeoutMs: 15000 }
    );

    // Parse the JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) return null;

    if (!parsed.description || !parsed.amount || parsed.amount <= 0) {
      return null;
    }

    return {
      description: String(parsed.description).slice(0, 200),
      amount: Number(parsed.amount),
      date: parsed.date || undefined,
      category: parsed.category || "other",
    };
  } catch (error) {
    console.error("[WA-MEDIA] Receipt processing error:", error);
    return null;
  }
}
