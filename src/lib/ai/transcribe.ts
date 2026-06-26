/* ------------------------------------------------------------------ */
/* transcribe.ts                                                       */
/* Single source of truth for audio→text across ALL channels.          */
/*                                                                     */
/* Both the in-app Kindar IA (via /api/ai/transcribe) and the WhatsApp */
/* bot (via lib/whatsapp/audio.ts) call this one function, so a voice  */
/* note produces the SAME transcription on every surface — parity by   */
/* construction. Uses Groq Whisper (whisper-large-v3), the same engine */
/* the WhatsApp path has used since launch.                            */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";

/** Groq Whisper hard cap is 25MB per request. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type TranscriptionErrorCode =
  | "transcription_unavailable"
  | "empty_audio"
  | "audio_too_large"
  | "empty_transcription"
  | "transcription_failed";

export interface TranscriptionResult {
  /** Transcribed text, or null when nothing usable came back. */
  text: string | null;
  /** Machine-readable reason when text is null. */
  error?: TranscriptionErrorCode;
}

/**
 * Transcribe a raw audio buffer to text. Channel-agnostic: callers hand in
 * bytes + the source mime type and get back text (or a typed error). Never
 * throws — failures are returned as `{ text: null, error }` so every caller
 * can degrade gracefully ("não entendi o áudio, pode digitar?").
 */
export async function transcribeAudioBuffer(
  audio: Uint8Array | ArrayBuffer | Buffer,
  mimeType: string = "audio/ogg",
  opts?: { language?: string },
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[AI-TRANSCRIBE] GROQ_API_KEY not configured");
    return { text: null, error: "transcription_unavailable" };
  }

  const bytes =
    audio instanceof Uint8Array ? audio : new Uint8Array(audio as ArrayBuffer);

  if (bytes.byteLength === 0) return { text: null, error: "empty_audio" };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { text: null, error: "audio_too_large" };
  }

  try {
    const type = mimeType || "audio/ogg";
    const ext = extensionForMime(type);
    // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart
    // (a Uint8Array<ArrayBufferLike> may be SharedArrayBuffer-backed).
    const view = new Uint8Array(bytes);
    const blob = new Blob([view], { type });
    const file = new File([blob], `audio.${ext}`, { type });

    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: opts?.language || "pt",
      response_format: "text",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = transcription as any;
    const text = (typeof raw === "string" ? raw : raw?.text || "").trim();

    if (!text) {
      console.log("[AI-TRANSCRIBE] Empty transcription");
      return { text: null, error: "empty_transcription" };
    }

    console.log(`[AI-TRANSCRIBE] Transcribed (${text.length} chars): ${text.slice(0, 80)}`);
    return { text };
  } catch (error) {
    console.error(
      "[AI-TRANSCRIBE] error:",
      error instanceof Error ? error.message : error,
    );
    return { text: null, error: "transcription_failed" };
  }
}

/** Map an audio mime type to a file extension Whisper accepts. */
export function extensionForMime(mimeType: string): string {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/flac": "flac",
  };
  return map[base] || "ogg";
}
