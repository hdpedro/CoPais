/* ------------------------------------------------------------------ */
/* WhatsApp Audio Transcription                                       */
/* Thin adapter: download from Meta, then transcribe via the SHARED    */
/* engine (lib/ai/transcribe.ts) — the same path the in-app Kindar IA  */
/* uses, so a voice note is transcribed identically on both channels.  */
/* ------------------------------------------------------------------ */

import { downloadMedia } from "./client";
import { transcribeAudioBuffer } from "@/lib/ai/transcribe";

/**
 * Download audio from WhatsApp and transcribe it.
 * Returns transcribed text or null if download/transcription fails.
 */
export async function transcribeAudio(
  mediaId: string,
  mediaMimeType?: string
): Promise<string | null> {
  try {
    const audioBuffer = await downloadMedia(mediaId);
    const { text } = await transcribeAudioBuffer(
      audioBuffer,
      mediaMimeType || "audio/ogg",
    );
    return text;
  } catch (error) {
    console.error(
      "[WA-AUDIO] download error:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
