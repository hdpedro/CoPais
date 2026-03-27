"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { parseIntent } from "@/lib/ai-local-parser";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Mode = "idle" | "listening" | "processing" | "confirming" | "executing" | "done" | "error";
type ResolvedBy = "local" | "ai" | null;

interface AIResponse {
  action: string;
  params: Record<string, string>;
  confirmation: string;
}

interface AIAssistantProps {
  groupId: string;
}

/* ------------------------------------------------------------------ */
/* Extend Window for webkitSpeechRecognition                           */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

/* ------------------------------------------------------------------ */
/* Route map for action redirects                                      */
/* ------------------------------------------------------------------ */

const ACTION_ROUTES: Record<string, string> = {
  createEvent: "/calendario/novo",
  createExpense: "/despesas/nova",
  createAppointment: "/saude/consultas/nova",
  createDecision: "/decisoes",
  createNote: "/notas",
  createHealthLog: "/saude/doencas/nova",
  createCheckin: "/checkin",
  createAgreement: "/acordos",
  createMedication: "/saude/medicamentos/novo",
  createVaccine: "/saude/vacinas/nova",
  createActivity: "/atividades",
  createSwapRequest: "/calendario",
};

function buildRedirectUrl(action: string, params: Record<string, string>): string {
  const base = ACTION_ROUTES[action];
  if (!base) return "/dashboard";

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }

  // Add special query flags for certain actions
  if (action === "createDecision") searchParams.set("new", "1");
  if (action === "createNote") searchParams.set("new", "1");
  if (action === "createAgreement") searchParams.set("new", "1");
  if (action === "createSwapRequest") searchParams.set("swap", "1");

  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AIAssistant({ groupId, isMobile }: AIAssistantProps & { isMobile?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  /* State */
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [inputText, setInputText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState("");
  const [resolvedBy, setResolvedBy] = useState<ResolvedBy>(null);

  /* Context for local parser */
  const [childrenNames, setChildrenNames] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const contextLoadedRef = useRef(false);

  /* Refs */
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const finalTranscriptRef = useRef<string>("");

  /* ---- Fetch context for local parser (once per modal open) ---- */
  const loadContext = useCallback(async () => {
    if (contextLoadedRef.current) return;
    try {
      const res = await fetch(`/api/ai/context?groupId=${groupId}`);
      if (res.ok) {
        const data = await res.json();
        setChildrenNames(data.children || []);
        setMemberNames(data.members || []);
        contextLoadedRef.current = true;
      }
    } catch {
      // Silently fail — local parser will work without names
    }
  }, [groupId]);

  /* ---- Speech Recognition helpers ---- */
  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  const getSpeechLang = useCallback(() => {
    if (locale === "pt") return "pt-BR";
    if (locale === "es") return "es-ES";
    if (locale === "fr") return "fr-FR";
    if (locale === "de") return "de-DE";
    return "en-US";
  }, [locale]);

  /* ---- Process text: local first, then Groq fallback ---- */
  const processText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError("");

      // Layer 1: Try local parser (instant, 0ms, no API call)
      const localResult = parseIntent(text, childrenNames, memberNames, locale);

      if (localResult && localResult.confidence >= 0.7) {
        setAiResponse({
          action: localResult.action,
          params: localResult.params,
          confirmation: localResult.confirmation,
        });
        setResolvedBy("local");
        setMode("confirming");
        return;
      }

      // Layer 2: Fallback to Groq API
      setMode("processing");
      try {
        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), groupId, locale }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: AIResponse = await response.json();
        setAiResponse(data);
        setResolvedBy("ai");
        setMode("confirming");
      } catch {
        setError(t("assistant.error"));
        setMode("error");
      }
    },
    [childrenNames, memberNames, locale, groupId, t]
  );

  /* ---- Start listening ---- */
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) {
      setError(t("assistant.notAvailable"));
      setMode("error");
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = getSpeechLang();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          const text = result[0].transcript;
          if (result.isFinal) {
            finalText += text;
          } else {
            interim += text;
          }
        }
      }
      const currentText = finalText || interim;
      setTranscript(currentText);
      finalTranscriptRef.current = currentText;
    };

    recognition.onend = () => {
      const spokenText = finalTranscriptRef.current;
      if (spokenText.trim()) {
        processText(spokenText);
      } else {
        setMode("idle");
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed") {
        setError(t("assistant.micPermission"));
      } else {
        setError(t("assistant.notAvailable"));
      }
      setMode("error");
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setMode("listening");

    try {
      recognition.start();
    } catch {
      setError(t("assistant.notAvailable"));
      setMode("error");
    }
  }, [hasSpeechRecognition, getSpeechLang, processText, t]);

  /* ---- Stop listening ---- */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  /* ---- Confirm action ---- */
  const confirmAction = useCallback(() => {
    if (!aiResponse) return;
    setMode("executing");

    // Small delay to show "executing" state, then redirect
    setTimeout(() => {
      setMode("done");
      setTimeout(() => {
        const url = buildRedirectUrl(aiResponse.action, aiResponse.params);
        setIsOpen(false);
        resetState();
        router.push(url);
      }, 600);
    }, 500);
  }, [aiResponse, router]);

  /* ---- Reset ---- */
  const resetState = useCallback(() => {
    setMode("idle");
    setInputText("");
    setTranscript("");
    setAiResponse(null);
    setError("");
    setResolvedBy(null);
    finalTranscriptRef.current = "";
  }, []);

  /* ---- Open / Close ---- */
  const openModal = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setIsOpen(true);
    resetState();
    loadContext();
  }, [resetState, loadContext]);

  const closeModal = useCallback(() => {
    // CRITICAL: Stop microphone immediately
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setIsOpen(false);
    resetState();
    previousFocusRef.current?.focus();
  }, [resetState]);

  /* ---- CRITICAL: Stop mic when modal closes or component unmounts ---- */
  useEffect(() => {
    if (!isOpen) {
      // Modal closed — kill any active recognition immediately
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
    }
    return () => {
      // Component unmount (page navigation) — kill mic
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isOpen]);

  /* ---- CRITICAL: Stop mic on page visibility change (tab switch, app background) ---- */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
        if (mode === "listening") setMode("idle");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [mode]);

  /* ---- Keyboard: Escape to close ---- */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeModal]);

  /* ---- Focus trap ---- */
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 100);

    const modal = modalRef.current;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  /* ---- Handle text submit ---- */
  const handleSubmitText = useCallback(() => {
    if (inputText.trim()) {
      processText(inputText);
    }
  }, [inputText, processText]);

  /* ---- Status text ---- */
  const statusText = (() => {
    switch (mode) {
      case "listening":
        return t("assistant.listening");
      case "processing":
        return t("assistant.processing");
      case "executing":
        return t("assistant.executing");
      case "done":
        return t("assistant.redirecting");
      case "error":
        return error || t("assistant.error");
      default:
        return t("assistant.speakOrType");
    }
  })();

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */

  return (
    <>
      {/* ---- Floating Action Button ---- */}
      <button
        onClick={openModal}
        aria-label={t("assistant.title")}
        className={isMobile
          ? "p-2 rounded-full hover:bg-[#7C6FAE]/10 transition-colors flex items-center justify-center"
          : "fixed z-40 bottom-8 right-8 w-12 h-12 rounded-full bg-[#7C6FAE] text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group"
        }
      >
        {/* Pulse ring — desktop only */}
        {!isMobile && <span className="absolute inset-0 rounded-full bg-[#7C6FAE] animate-ping opacity-20" />}
        {/* Mic icon */}
        <svg
          className={isMobile ? "w-[22px] h-[22px] text-[#7C6FAE]" : "w-6 h-6 relative z-10 transition-transform group-hover:scale-110"}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={isMobile ? 1.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {/* ---- Modal Overlay ---- */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t("assistant.title")}
        >
          <div
            ref={modalRef}
            className="bg-white rounded-2xl w-full max-w-sm md:max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#7C6FAE] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-[#2C2C2C]">
                  {t("assistant.title")}
                </h2>
              </div>
              <button
                onClick={closeModal}
                aria-label={t("common.close")}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              {/* Text input */}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={mode === "listening" ? transcript : inputText}
                  onChange={(e) => {
                    if (mode !== "listening") setInputText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mode === "idle") handleSubmitText();
                  }}
                  placeholder={t("assistant.placeholder")}
                  disabled={mode !== "idle" && mode !== "error"}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-[#2C2C2C] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#7C6FAE]/30 focus:border-[#7C6FAE] disabled:opacity-50 transition-all"
                  aria-label={t("assistant.placeholder")}
                />
                <button
                  onClick={handleSubmitText}
                  disabled={!inputText.trim() || (mode !== "idle" && mode !== "error")}
                  aria-label={t("common.send")}
                  className="p-2.5 rounded-xl bg-[#7C6FAE] text-white disabled:opacity-40 hover:bg-[#6B5F9E] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Microphone button */}
              <div className="flex flex-col items-center gap-3 py-2">
                <button
                  onClick={mode === "listening" ? stopListening : startListening}
                  disabled={mode === "processing" || mode === "executing" || mode === "confirming" || mode === "done"}
                  aria-label={mode === "listening" ? t("assistant.listening") : t("assistant.speakOrType")}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                    mode === "listening"
                      ? "bg-red-500 text-white scale-110"
                      : "bg-[#7C6FAE]/10 text-[#7C6FAE] hover:bg-[#7C6FAE]/20"
                  } disabled:opacity-40`}
                >
                  {/* Listening pulse ring */}
                  {mode === "listening" && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
                  )}
                  <svg
                    className="w-7 h-7 relative z-10"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>

                {/* Status text */}
                <p
                  className={`text-sm font-medium ${
                    mode === "error" ? "text-red-500" : mode === "listening" ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  {statusText}
                </p>
              </div>

              {/* Processing spinner */}
              {mode === "processing" && (
                <div className="flex justify-center py-2">
                  <div className="w-8 h-8 border-3 border-[#7C6FAE]/20 border-t-[#7C6FAE] rounded-full animate-spin" />
                </div>
              )}

              {/* AI Response / Confirmation */}
              {mode === "confirming" && aiResponse && (
                <div className="bg-[#7C6FAE]/5 border border-[#7C6FAE]/20 rounded-xl p-4 space-y-3">
                  {/* Resolution source badge */}
                  {resolvedBy && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        resolvedBy === "local"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                      }`}
                    >
                      {resolvedBy === "local"
                        ? t("assistant.localResponse")
                        : t("assistant.aiResponse")}
                    </span>
                  )}
                  <p className="text-sm text-[#2C2C2C] leading-relaxed">
                    {aiResponse.confirmation}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={confirmAction}
                      aria-label={t("assistant.confirm")}
                      className="flex-1 py-2.5 rounded-xl bg-[#5B9E85] text-white text-sm font-medium hover:bg-[#4E8B74] transition-colors"
                    >
                      {t("assistant.confirm")}
                    </button>
                    <button
                      onClick={() => {
                        resetState();
                      }}
                      aria-label={t("assistant.cancel")}
                      className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      {t("assistant.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Executing state */}
              {mode === "executing" && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-8 h-8 border-3 border-[#7C6FAE]/20 border-t-[#7C6FAE] rounded-full animate-spin" />
                  <p className="text-sm text-gray-500 font-medium">{t("assistant.executing")}</p>
                </div>
              )}

              {/* Done state */}
              {mode === "done" && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-full bg-[#5B9E85] flex items-center justify-center animate-in zoom-in duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#5B9E85]">{t("assistant.success")}</p>
                  <p className="text-xs text-gray-400">{t("assistant.redirecting")}</p>
                </div>
              )}

              {/* Error state: retry button */}
              {mode === "error" && (
                <div className="flex justify-center">
                  <button
                    onClick={resetState}
                    className="text-sm text-[#7C6FAE] font-medium hover:underline"
                  >
                    {t("assistant.tryAgain")}
                  </button>
                </div>
              )}

              {/* Examples hint (only in idle / error) */}
              {(mode === "idle" || mode === "error") && (
                <p className="text-center text-xs text-gray-400 pt-1">
                  {t("assistant.examples")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
