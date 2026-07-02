/* ------------------------------------------------------------------ */
/* Incidente 02/jul: console do Groq bloqueou whisper-large-v3 no nível */
/* do PROJETO (403 model_permission_blocked_project) e o áudio caiu em  */
/* TODOS os canais. O motor compartilhado ganhou fallback OpenAI        */
/* whisper-1 + reporte real (app_errors) na falha dupla. Contrato:      */
/* transcribeAudioBuffer NUNCA lança.                                   */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const groqCreate = vi.fn();
const openaiCreate = vi.fn();
const report = vi.fn(async (...args: unknown[]) => void args);

vi.mock("groq-sdk", () => ({
  default: class GroqMock {
    audio = { transcriptions: { create: groqCreate } };
  },
}));
vi.mock("openai", () => ({
  default: class OpenAIMock {
    audio = { transcriptions: { create: openaiCreate } };
  },
}));
vi.mock("@/lib/error-tracking/report-server", () => ({
  reportServerError: (...args: unknown[]) => report(...args),
}));

import { transcribeAudioBuffer } from "@/lib/ai/transcribe";

const AUDIO = new Uint8Array([1, 2, 3, 4]);

describe("transcribeAudioBuffer — fallback Groq→OpenAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = "gk_test";
    process.env.OPENAI_API_KEY = "sk_test";
  });
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("Groq ok → texto direto, OpenAI nem é chamado", async () => {
    groqCreate.mockResolvedValue("consulta do Otto foi boa");
    const r = await transcribeAudioBuffer(AUDIO, "audio/ogg");
    expect(r.text).toBe("consulta do Otto foi boa");
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("Groq 403 (modelo bloqueado no projeto) → OpenAI salva a voz", async () => {
    groqCreate.mockRejectedValue(new Error("403 model_permission_blocked_project"));
    openaiCreate.mockResolvedValue({ text: "sexta o Otto fica comigo" });
    const r = await transcribeAudioBuffer(AUDIO, "audio/ogg");
    expect(r.text).toBe("sexta o Otto fica comigo");
    expect(r.error).toBeUndefined();
  });

  it("Groq vazio → segunda opinião do fallback antes de desistir", async () => {
    groqCreate.mockResolvedValue("");
    openaiCreate.mockResolvedValue({ text: "deu tudo certo" });
    const r = await transcribeAudioBuffer(AUDIO, "audio/ogg");
    expect(r.text).toBe("deu tudo certo");
  });

  it("os DOIS falham → transcription_failed + reportServerError (nunca lança)", async () => {
    groqCreate.mockRejectedValue(new Error("403 blocked"));
    openaiCreate.mockRejectedValue(new Error("429 rate limit"));
    const r = await transcribeAudioBuffer(AUDIO, "audio/ogg");
    expect(r).toEqual({ text: null, error: "transcription_failed" });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("só Groq configurado e falhou → reporta e devolve transcription_failed", async () => {
    delete process.env.OPENAI_API_KEY;
    groqCreate.mockRejectedValue(new Error("500"));
    const r = await transcribeAudioBuffer(AUDIO, "audio/ogg");
    expect(r).toEqual({ text: null, error: "transcription_failed" });
    expect(report).toHaveBeenCalledTimes(1);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("nenhuma chave → transcription_unavailable; vazio/grande preservados", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect((await transcribeAudioBuffer(AUDIO)).error).toBe("transcription_unavailable");

    process.env.GROQ_API_KEY = "gk_test";
    expect((await transcribeAudioBuffer(new Uint8Array(0))).error).toBe("empty_audio");
    expect((await transcribeAudioBuffer(new Uint8Array(26 * 1024 * 1024))).error).toBe(
      "audio_too_large",
    );
    expect(groqCreate).not.toHaveBeenCalled();
  });
});
