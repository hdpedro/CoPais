"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeTone } from "@/lib/tone-moderator";

interface Message {
  id: string;
  sender_id: string;
  text: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

interface Member {
  user_id: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

interface ToneAnalysis {
  isAggressive: boolean;
  score: number;
  suggestion: string | null;
  detectedPatterns: string[];
}

export default function ChatRoom({
  groupId,
  userId,
  initialMessages,
  members,
}: {
  groupId: string;
  userId: string;
  initialMessages: Message[];
  members: Member[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toneResult, setToneResult] = useState<ToneAnalysis | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  const memberNames: Record<string, string> = {};
  members.forEach((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    memberNames[m.user_id] = p?.full_name || "Usuario";
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          msg.profiles = { full_name: memberNames[msg.sender_id] || "Usuario" };
          setMessages((prev) => [...prev, msg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Analisa tom 1.5s após parar de digitar
  const checkTone = useCallback((text: string) => {
    if (toneTimerRef.current) clearTimeout(toneTimerRef.current);

    if (!text.trim() || text.trim().length < 5) {
      setToneResult(null);
      setShowSuggestion(false);
      return;
    }

    toneTimerRef.current = setTimeout(() => {
      const result = analyzeTone(text);
      setToneResult(result);
      if (result.isAggressive) {
        setShowSuggestion(true);
      } else {
        setShowSuggestion(false);
      }
    }, 1500);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewMessage(value);
    checkTone(value);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;

    setSending(true);
    setShowSuggestion(false);
    setToneResult(null);

    const { error } = await supabase.from("chat_messages").insert({
      group_id: groupId,
      sender_id: userId,
      text: text.trim(),
    });

    if (!error) {
      setNewMessage("");
    }
    setSending(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (showSuggestion && toneResult?.isAggressive) return; // Força escolha
    await sendMessage(newMessage);
  }

  function acceptSuggestion() {
    if (toneResult?.suggestion) {
      setNewMessage(toneResult.suggestion);
      setShowSuggestion(false);
      setToneResult(null);
    }
  }

  function sendOriginal() {
    sendMessage(newMessage);
  }

  function discardMessage() {
    setNewMessage("");
    setShowSuggestion(false);
    setToneResult(null);
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-dark">Chat do Grupo</h1>
        <span className="text-xs text-muted bg-gray-100 px-2 py-1 rounded-full">
          {members.length} membros
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.length === 0 && (
          <div className="text-center text-muted py-8">
            <p>Nenhuma mensagem ainda.</p>
            <p className="text-sm mt-1">Comece a conversa!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_id === userId;
          return (
            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                isOwn ? "bg-primary text-white rounded-br-md" : "bg-white shadow-sm rounded-bl-md"
              }`}>
                {!isOwn && (
                  <p className="text-xs font-medium text-primary mb-1">
                    {msg.profiles?.full_name || memberNames[msg.sender_id] || "Usuario"}
                  </p>
                )}
                <p className={`text-sm ${isOwn ? "text-white" : "text-dark"}`}>{msg.text}</p>
                <p className={`text-xs mt-1 ${isOwn ? "text-white/70" : "text-muted"}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Sugestão da IA Mediadora */}
      {showSuggestion && toneResult?.isAggressive && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-lg leading-none mt-0.5">&#9888;&#65039;</span>
            <div>
              <p className="text-sm font-medium text-amber-800">
                Essa mensagem pode escalar o conflito
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Sugestao da IA Mediadora:
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 mb-3 border border-amber-100">
            <p className="text-sm text-dark italic">
              &ldquo;{toneResult.suggestion}&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={acceptSuggestion}
              className="flex-1 min-w-[140px] px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              Usar sugestao
            </button>
            <button
              type="button"
              onClick={sendOriginal}
              className="flex-1 min-w-[140px] px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              Enviar original
            </button>
            <button
              type="button"
              onClick={discardMessage}
              className="px-3 py-2 text-gray-400 text-sm rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={handleInputChange}
          placeholder="Digite uma mensagem..."
          className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-colors ${
            showSuggestion && toneResult?.isAggressive
              ? "border-amber-300 focus:ring-amber-200 focus:border-amber-400"
              : "border-gray-200 focus:ring-primary/50 focus:border-primary"
          }`}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim() || (showSuggestion && !!toneResult?.isAggressive)}
          className="px-4 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
