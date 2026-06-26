import { describe, it, expect, afterEach, vi } from "vitest";
import {
  extensionForMime,
  transcribeAudioBuffer,
  MAX_AUDIO_BYTES,
} from "@/lib/ai/transcribe";

describe("extensionForMime", () => {
  it("maps common audio mime types", () => {
    expect(extensionForMime("audio/ogg")).toBe("ogg");
    expect(extensionForMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/webm")).toBe("webm");
    expect(extensionForMime("audio/wav")).toBe("wav");
    expect(extensionForMime("audio/aac")).toBe("aac");
  });

  it("is case-insensitive and trims mime params", () => {
    expect(extensionForMime("AUDIO/MP4")).toBe("m4a");
    expect(extensionForMime("audio/aac ; rate=8000")).toBe("aac");
  });

  it("falls back to ogg for unknown or empty types", () => {
    expect(extensionForMime("application/octet-stream")).toBe("ogg");
    expect(extensionForMime("")).toBe("ogg");
  });
});

describe("transcribeAudioBuffer guards (no network)", () => {
  const ORIGINAL = process.env.GROQ_API_KEY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = ORIGINAL;
    vi.restoreAllMocks();
  });

  it("returns transcription_unavailable when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;
    const res = await transcribeAudioBuffer(new Uint8Array([1, 2, 3]), "audio/ogg");
    expect(res.text).toBeNull();
    expect(res.error).toBe("transcription_unavailable");
  });

  it("returns empty_audio for a zero-length buffer", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await transcribeAudioBuffer(new Uint8Array(0), "audio/ogg");
    expect(res.text).toBeNull();
    expect(res.error).toBe("empty_audio");
  });

  it("returns audio_too_large above the 25MB cap", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const tooBig = new Uint8Array(MAX_AUDIO_BYTES + 1);
    const res = await transcribeAudioBuffer(tooBig, "audio/ogg");
    expect(res.text).toBeNull();
    expect(res.error).toBe("audio_too_large");
  });
});
