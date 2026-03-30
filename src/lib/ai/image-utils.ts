/* ------------------------------------------------------------------ */
/* Image utilities — compression for AI vision APIs                     */
/* ------------------------------------------------------------------ */

import sharp from "sharp";

const MAX_BASE64_BYTES = 3.5 * 1024 * 1024; // 3.5MB safe limit
const MAX_DIMENSION = 1536;

/**
 * Compress image to fit within vision API limits.
 * Resizes large images and converts to JPEG for smaller payload.
 */
export async function compressImageForVision(
  buffer: Buffer
): Promise<{ base64: string; mimeType: string }> {
  // First pass: resize to max dimension, JPEG quality 80
  let output = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  // If still too large, reduce more aggressively
  if (output.length > MAX_BASE64_BYTES * 0.75) {
    output = await sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();
  }

  const base64 = output.toString("base64");

  console.log(
    `[image-utils] Compressed: ${(buffer.length / 1024).toFixed(0)}KB → ${(output.length / 1024).toFixed(0)}KB (base64: ${(base64.length / 1024).toFixed(0)}KB)`
  );

  return { base64, mimeType: "image/jpeg" };
}
