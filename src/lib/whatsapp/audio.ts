/* ------------------------------------------------------------------ */
/* WhatsApp Audio Transcription                                       */
/* Thin adapter: download from Meta, then transcribe via the SHARED    */
/* engine (lib/ai/transcribe.ts) — the same path the in-app Kindar IA  */
/* uses, so a voice note is transcribed identically on both channels.  */
/* ------------------------------------------------------------------ */

import { downloadMedia } from "./client";
import { transcribeAudioBuffer } from "@/lib/ai/transcribe";
import { reportServerError } from "@/lib/error-tracking/report-server";

const FILE = "src/lib/whatsapp/audio.ts";

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
    // Falha de DOWNLOAD (a transcrição em si nunca lança — devolve typed
    // error e reporta lá dentro). Incidente 02/jul: erro só em console =
    // invisível; app_errors é onde a gente olha.
    await reportServerError(error, {
      filePath: FILE,
      metadata: { step: "wa_audio_download", media_id: mediaId },
    });
    return null;
  }
}
