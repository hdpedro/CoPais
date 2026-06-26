/* ------------------------------------------------------------------ */
/* /api/ai/transcribe — voice-note → text for the in-app Kindar IA      */
/*                                                                     */
/* The app's assistant chat is text-in. This endpoint lets the PWA and */
/* Native record a voice note, get it transcribed by the SAME Groq      */
/* Whisper engine the WhatsApp bot uses (lib/ai/transcribe.ts), and     */
/* then feed the resulting text into the normal /api/ai/assistant flow. */
/* Audio in, text out — the chat pipeline downstream stays untouched.   */
/*                                                                     */
/* Auth: Bearer (Native) or cookie (PWA) via the shared helper, same    */
/* as /api/ai/assistant. The /api/ai prefix is already on the middleware*/
/* allowlist, so the Bearer multipart POST isn't bounced.               */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { aiRateLimiter } from "@/lib/ai/rate-limit";
import { transcribeAudioBuffer, MAX_AUDIO_BYTES } from "@/lib/ai/transcribe";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    // Share the assistant rate-limit budget so voice can't bypass it.
    const rate = aiRateLimiter.check(auth.id);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens. Aguarde um momento." },
        { status: 429 },
      );
    }

    let bytes: Uint8Array;
    let mimeType = "audio/ogg";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Audio obrigatorio" }, { status: 400 });
      }
      mimeType = file.type || mimeType;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      // JSON fallback: { audio: <base64 | data URL>, mimeType?: string }
      const body = (await req.json().catch(() => null)) as
        | { audio?: string; mimeType?: string }
        | null;
      if (!body?.audio) {
        return NextResponse.json({ error: "Audio obrigatorio" }, { status: 400 });
      }
      mimeType = body.mimeType || mimeType;
      const b64 = body.audio.includes(",")
        ? body.audio.slice(body.audio.indexOf(",") + 1)
        : body.audio;
      bytes = new Uint8Array(Buffer.from(b64, "base64"));
    }

    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Audio vazio" }, { status: 400 });
    }
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio muito longo. Tente uma nota mais curta." },
        { status: 413 },
      );
    }

    const { text, error } = await transcribeAudioBuffer(bytes, mimeType);

    if (!text) {
      const status = error === "transcription_unavailable" ? 503 : 422;
      return NextResponse.json(
        {
          error: "Nao consegui entender o audio. Tente novamente ou digite. 🙏",
          code: error,
        },
        { status },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    reportServerError(error, { filePath: "src/app/api/ai/transcribe/route.ts" });
    return NextResponse.json(
      { error: "Erro ao transcrever. Tente novamente." },
      { status: 500 },
    );
  }
}
