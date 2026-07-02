/* ------------------------------------------------------------------ */
/* transcribe.ts                                                       */
/* Single source of truth for audio→text across ALL channels.          */
/*                                                                     */
/* Both the in-app Kindar IA (via /api/ai/transcribe) and the WhatsApp */
/* bot (via lib/whatsapp/audio.ts) call this one function, so a voice  */
/* note produces the SAME transcription on every surface — parity by   */
/* construction.                                                       */
/*                                                                     */
/* Motor primário: Groq Whisper (whisper-large-v3, mesmo desde o       */
/* launch). FALLBACK: OpenAI whisper-1 — nasceu do incidente 02/jul,   */
/* quando o console do Groq bloqueou o modelo no nível do PROJETO      */
/* (403 model_permission_blocked_project) e o áudio do WhatsApp caiu   */
/* inteiro. Config externa pode sumir a qualquer momento; a voz da     */
/* família não pode cair junto. Falha dos DOIS → reportServerError     */
/* (antes era console.error, invisível — app_errors ficava vazio).     */
/* ------------------------------------------------------------------ */

import Groq from "groq-sdk";
import OpenAI from "openai";
import { reportServerError } from "@/lib/error-tracking/report-server";

const FILE = "src/lib/ai/transcribe.ts";

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

/** Normaliza a resposta dos SDKs (string com response_format:"text", ou {text}). */
function extractText(transcription: unknown): string {
  const raw = transcription as { text?: string } | string;
  return (typeof raw === "string" ? raw : raw?.text || "").trim();
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
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!groqKey && !openaiKey) {
    console.error("[AI-TRANSCRIBE] no transcription API key configured");
    return { text: null, error: "transcription_unavailable" };
  }

  const bytes =
    audio instanceof Uint8Array ? audio : new Uint8Array(audio as ArrayBuffer);

  if (bytes.byteLength === 0) return { text: null, error: "empty_audio" };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { text: null, error: "audio_too_large" };
  }

  const type = mimeType || "audio/ogg";
  const ext = extensionForMime(type);
  // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart
  // (a Uint8Array<ArrayBufferLike> may be SharedArrayBuffer-backed).
  const view = new Uint8Array(bytes);
  const blob = new Blob([view], { type });
  const file = new File([blob], `audio.${ext}`, { type });
  const language = opts?.language || "pt";

  let groqError: unknown = null;
  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const transcription = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        language,
        response_format: "text",
      });
      const text = extractText(transcription);
      if (text) {
        console.log(`[AI-TRANSCRIBE] Transcribed (${text.length} chars): ${text.slice(0, 80)}`);
        return { text };
      }
      console.log("[AI-TRANSCRIBE] Empty transcription (groq)");
      // vazio de verdade (silêncio?) não é erro de provedor — ainda assim
      // vale a segunda opinião do fallback antes de desistir.
    } catch (error) {
      groqError = error;
      console.error(
        "[AI-TRANSCRIBE] groq error:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language,
        response_format: "text",
      });
      const text = extractText(transcription);
      if (text) {
        console.log(
          `[AI-TRANSCRIBE] Transcribed via FALLBACK openai (${text.length} chars): ${text.slice(0, 80)}`,
        );
        return { text };
      }
      return { text: null, error: "empty_transcription" };
    } catch (error) {
      await reportServerError(error, {
        filePath: FILE,
        metadata: {
          step: "transcribe_fallback_openai",
          groq_error: groqError instanceof Error ? groqError.message.slice(0, 300) : String(groqError ?? "skipped"),
        },
      });
      return { text: null, error: "transcription_failed" };
    }
  }

  // Só Groq configurado e ele falhou/veio vazio.
  if (groqError) {
    await reportServerError(groqError, {
      filePath: FILE,
      metadata: { step: "transcribe_groq_no_fallback" },
    });
    return { text: null, error: "transcription_failed" };
  }
  return { text: null, error: "empty_transcription" };
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
