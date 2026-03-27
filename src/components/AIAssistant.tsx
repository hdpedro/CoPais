"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/provider";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIAssistantProps {
  groupId: string;
  isMobile?: boolean;
}

/* ------------------------------------------------------------------ */
/* Speech Recognition types                                            */
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
/* Quick suggestions                                                   */
/* ------------------------------------------------------------------ */

const QUICK_SUGGESTIONS = [
  { emoji: "💰", text: "Quanto gastamos este mês?" },
  { emoji: "📅", text: "O que tem essa semana?" },
  { emoji: "👶", text: "Quem está com as crianças?" },
  { emoji: "🏥", text: "Próximas consultas" },
  { emoji: "📝", text: "Criar nota" },
];

/* ------------------------------------------------------------------ */
/* Unique ID                                                           */
/* ------------------------------------------------------------------ */

let _id = 0;
function uid(): string {
  return `msg_${Date.now()}_${++_id}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AIAssistant({ groupId, isMobile }: AIAssistantProps) {
  const { t, locale } = useI18n();

  /* State */
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  /* Refs */
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");

  /* Portal mount */
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  /* Auto-scroll to bottom */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  /* Focus input when opening */
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  /* Stop mic on unmount / close */
  useEffect(() => {
    if (!isOpen && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
      setIsListening(false);
    }
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isOpen]);

  /* Keyboard: Escape to close */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  /* ---- Open / Close ---- */
  const openModal = useCallback(() => {
    setIsOpen(true);
    if (messages.length === 0) {
      setMessages([
        {
          id: uid(),
          role: "assistant",
          content: getGreeting(),
          timestamp: new Date(),
        },
      ]);
    }
  }, [messages.length]);

  const closeModal = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setIsOpen(false);
    setIsListening(false);
    setTranscript("");
  }, []);

  function getGreeting(): string {
    const hour = new Date().getHours();
    const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    return `${period}! 👋 Sou o Kindar, seu assistente. Posso criar despesas, consultar agenda, verificar saúde e muito mais. Como posso ajudar?`;
  }

  /* ---- Send message ---- */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      setIsLoading(true);

      try {
        // Build messages for API (only role + content)
        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, groupId }),
        });

        const data = await response.json();

        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: data.content || data.error || "Desculpe, não consegui processar.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: "Desculpe, ocorreu um erro de conexão. Tente novamente.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, groupId, isLoading]
  );

  /* ---- Handle submit ---- */
  const handleSubmit = useCallback(() => {
    const text = isListening ? transcript : inputText;
    if (text.trim()) sendMessage(text);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setTranscript("");
    }
  }, [inputText, transcript, isListening, sendMessage]);

  /* ---- Voice Recognition ---- */
  const getSpeechLang = useCallback(() => {
    if (locale === "pt") return "pt-BR";
    if (locale === "es") return "es-ES";
    if (locale === "fr") return "fr-FR";
    if (locale === "de") return "de-DE";
    return "en-US";
  }, [locale]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      // Submit what was transcribed
      const text = finalTranscriptRef.current;
      if (text.trim()) {
        sendMessage(text);
      }
      setTranscript("");
      finalTranscriptRef.current = "";
      return;
    }

    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

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
        if (result?.[0]) {
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
      }
      const text = finalText || interim;
      setTranscript(text);
      finalTranscriptRef.current = text;
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = finalTranscriptRef.current;
      if (text.trim()) {
        sendMessage(text);
      }
      setTranscript("");
      finalTranscriptRef.current = "";
    };

    recognition.onerror = () => {
      setIsListening(false);
      setTranscript("");
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    setTranscript("");
    finalTranscriptRef.current = "";

    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [isListening, getSpeechLang, sendMessage]);

  /* ---- Quick suggestion click ---- */
  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  /* ---- New chat ---- */
  const handleNewChat = useCallback(() => {
    setMessages([
      {
        id: uid(),
        role: "assistant",
        content: getGreeting(),
        timestamp: new Date(),
      },
    ]);
  }, []);

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */

  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  return (
    <>
      {/* ---- Trigger Button ---- */}
      <button
        onClick={openModal}
        aria-label={t("assistant.title")}
        className={
          isMobile
            ? "p-2 rounded-full hover:bg-[#7C6FAE]/10 transition-colors flex items-center justify-center"
            : "fixed z-40 bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-[#7C6FAE] to-[#6B5F9E] text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group"
        }
      >
        {!isMobile && (
          <span className="absolute inset-0 rounded-full bg-[#7C6FAE] animate-ping opacity-20" />
        )}
        <svg
          className={
            isMobile
              ? "w-[22px] h-[22px] text-[#7C6FAE]"
              : "w-6 h-6 relative z-10 transition-transform group-hover:scale-110"
          }
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

      {/* ---- Chat Modal (Portal) ---- */}
      {isOpen &&
        portalContainer &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Assistente Kindar"
          >
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[600px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
              {/* ---- Header ---- */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7C6FAE] to-[#6B5F9E] flex items-center justify-center shadow-sm">
                    <svg
                      className="w-4.5 h-4.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#2C2C2C] leading-tight">
                      Kindar AI
                    </h2>
                    <p className="text-[11px] text-[#5B9E85] font-medium">
                      {isLoading ? "Pensando..." : "Online"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* New chat button */}
                  <button
                    onClick={handleNewChat}
                    aria-label="Nova conversa"
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                    title="Nova conversa"
                  >
                    <svg
                      className="w-4.5 h-4.5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        d="M12 5v14m-7-7h14"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {/* Close button */}
                  <button
                    onClick={closeModal}
                    aria-label="Fechar"
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ---- Messages Area ---- */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
              >
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Typing indicator */}
                {isLoading && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C6FAE] to-[#6B5F9E] flex items-center justify-center shrink-0">
                      <svg
                        className="w-3.5 h-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick suggestions — only show when few messages */}
                {messages.length <= 1 && !isLoading && (
                  <div className="pt-2">
                    <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase tracking-wider">
                      Sugestoes rapidas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_SUGGESTIONS.map((s) => (
                        <button
                          key={s.text}
                          onClick={() => handleSuggestion(s.text)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#7C6FAE]/5 border border-[#7C6FAE]/15 text-[12px] text-[#7C6FAE] font-medium hover:bg-[#7C6FAE]/10 transition-colors"
                        >
                          <span>{s.emoji}</span>
                          <span>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Voice transcript banner ---- */}
              {isListening && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                  </span>
                  <span className="text-sm text-red-600 font-medium truncate">
                    {transcript || "Ouvindo..."}
                  </span>
                </div>
              )}

              {/* ---- Input Bar ---- */}
              <div className="shrink-0 px-3 py-2.5 border-t border-gray-100 bg-white rounded-b-2xl safe-area-bottom">
                <div className="flex items-center gap-1.5">
                  {/* Mic button */}
                  {hasSpeechRecognition && (
                    <button
                      onClick={toggleListening}
                      disabled={isLoading}
                      aria-label={isListening ? "Parar" : "Falar"}
                      className={`shrink-0 p-2.5 rounded-full transition-all ${
                        isListening
                          ? "bg-red-500 text-white shadow-md scale-105"
                          : "text-gray-400 hover:bg-gray-100 hover:text-[#7C6FAE]"
                      } disabled:opacity-40`}
                    >
                      <svg
                        className="w-5 h-5"
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
                  )}

                  {/* Text input */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={isListening ? transcript : inputText}
                    onChange={(e) => {
                      if (!isListening) setInputText(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={isListening ? "Ouvindo..." : "Digite sua mensagem..."}
                    disabled={isLoading}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-[#2C2C2C] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#7C6FAE]/30 focus:border-[#7C6FAE] disabled:opacity-50 transition-all"
                  />

                  {/* Send button */}
                  <button
                    onClick={handleSubmit}
                    disabled={
                      isLoading ||
                      (!isListening && !inputText.trim()) ||
                      (isListening && !transcript.trim())
                    }
                    aria-label="Enviar"
                    className="shrink-0 p-2.5 rounded-xl bg-[#7C6FAE] text-white disabled:opacity-30 hover:bg-[#6B5F9E] transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          portalContainer
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Message Bubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "items-start gap-2"}`}>
      {/* Bot avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C6FAE] to-[#6B5F9E] flex items-center justify-center shrink-0 mt-0.5">
          <svg
            className="w-3.5 h-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      <div
        className={`max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
          isUser
            ? "bg-[#7C6FAE] text-white rounded-2xl rounded-tr-md"
            : "bg-gray-100 text-[#2C2C2C] rounded-2xl rounded-tl-md"
        }`}
      >
        {/* Render content with line breaks */}
        {message.content.split("\n").map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
