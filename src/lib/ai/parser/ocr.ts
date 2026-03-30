/* ------------------------------------------------------------------ */
/* OCR extraction — Tesseract.js (free, runs client-side or Node)      */
/* ------------------------------------------------------------------ */

import Tesseract from "tesseract.js";

/**
 * Extract text from an image or PDF-rendered image buffer.
 * Returns the extracted text and confidence score.
 */
export async function extractText(
  imageData: Buffer | string
): Promise<{ text: string; confidence: number }> {
  const result = await Tesseract.recognize(imageData, "por+eng", {
    logger: () => {}, // suppress progress logs in production
  });

  const text = result.data.text.trim();
  const confidence = result.data.confidence;

  return { text, confidence };
}
