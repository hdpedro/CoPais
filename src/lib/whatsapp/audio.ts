/* ------------------------------------------------------------------ */
/* WhatsApp Audio Transcription                                       */
/* Download audio + transcribe via Groq Whisper (free tier)            */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import { downloadMedia } from "./client";

/**
 * Download audio from WhatsApp and transcribe using Groq Whisper.
 * Returns transcribed text or null if transcription fails.
 */
export async function transcribeAudio(
  mediaId: string,
  mediaMimeType?: string
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[WA-AUDIO] GROQ_API_KEY not configured");
    return null;
  }

  try {
    // Download audio from Meta
    const audioBuffer = await downloadMedia(mediaId);

    // Determine file extension from mime type
    const ext = getExtension(mediaMimeType || "audio/ogg");

    // Create a File object for the Groq API
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mediaMimeType || "audio/ogg" });
    const file = new File([blob], `audio.${ext}`, { type: mediaMimeType || "audio/ogg" });

    // Transcribe with Groq Whisper
    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "pt",
      response_format: "text",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = transcription as any;
    const text = (typeof raw === "string" ? raw : raw?.text || "").trim();

    if (!text) {
      console.log("[WA-AUDIO] Empty transcription");
      return null;
    }

    console.log(`[WA-AUDIO] Transcribed (${text.length} chars): ${text.slice(0, 80)}`);
    return text;
  } catch (error) {
    console.error("[WA-AUDIO] Transcription error:", error instanceof Error ? error.message : error);
    return null;
  }
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/ogg; codecs=opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/amr": "amr",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };
  return map[mimeType] || "ogg";
}
