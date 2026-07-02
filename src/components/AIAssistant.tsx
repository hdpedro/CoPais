"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/provider";
import { looksLikeExamText, looksLikeConsultText, looksLikeCustodyText, looksLikeExpenseText, looksLikeInviteText } from "@/lib/ai/brain/exam-text-gate";

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

/**
 * Resposta DIGITADA a "de qual criança?": casa o texto a UMA opção pelo primeiro
 * nome (palavra inteira, sem acento/caixa). Só resolve se exatamente uma bate
 * (senão null — não chuta). Paridade com o WhatsApp (que aceita nome digitado).
 */
export function matchOneChildOption(
  text: string,
  options: { id: string; name: string }[],
): { id: string; name: string } | null {
  const norm = (x: string) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const t = norm(text);
  if (!t.trim()) return null;
  const hits = options.filter((o) => {
    const first = norm((o.name || "").split(" ")[0]);
    return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first}([^a-z0-9]|$)`).test(t);
  });
  return hits.length === 1 ? hits[0] : null;
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
  // Intake reconhecido (calendário escolar OU consulta, `doc="health"`) →
  // aguardando o usuário confirmar. O `doc` decide a copy (provas × consulta).
  const [pendingIntake, setPendingIntake] = useState<
    { id: string; planHash: string; confirmationToken: string; count: number; doc?: string } | null
  >(null);
  // Provas (foto OU texto) sem criança resolvida → botões inline. O `resubmit`
  // reenvia a MESMA entrada (a foto ou o texto) com o child_id escolhido —
  // unifica imagem e texto sem duplicar UI (paridade WhatsApp: conversacional).
  const [childPick, setChildPick] = useState<
    { options: { id: string; name: string }[]; resubmit: (childId: string, userLabel: string) => void } | null
  >(null);
  // Provas recém-criadas → oferece Desfazer inline (paridade com o WhatsApp,
  // que manda o botão "Desfazer" logo após confirmar).
  const [undoableIntake, setUndoableIntake] = useState<{ id: string; count: number; doc?: string } | null>(null);

  /* Refs */
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  // Ref pra o runner de captura de provas por texto (evita ciclo no reenvio
  // por criança, que chama o próprio runner com o child_id resolvido).
  const examCaptureRef = useRef<((text: string, childId?: string, endpoint?: string) => Promise<boolean>) | null>(null);

  /* Portal mount — must run after hydration to access `document` (SSR safe).
     Synchronous setState inside the effect is intentional: the value comes
     from a browser-only API and the render before hydration deliberately
     yields a `null` portal (component returns nothing). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /* Keyboard: Escape to close.
     `closeModal` is declared below as a `useCallback` and would TDZ-crash
     if listed in this effect's deps array; suppress exhaustive-deps for
     this particular case — the effect only fires on isOpen flips and
     reads `closeModal` lazily inside the keydown handler. */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ---- Captura por TEXTO (assistente = mesmo cérebro do WhatsApp/foto) ----
   *  `endpoint` = provas (exam-text) OU consulta médica (consult-text). O
   *  servidor gateia (consulta OFF por padrão → {found:false} → cai no chat). */
  const runExamCapture = useCallback(
    async (text: string, childId?: string, endpoint = "/api/ai/assistant/exam-text"): Promise<boolean> => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, child_id: childId }),
        });
        const data = await res.json().catch(() => ({ found: false }));
        // Não era captura (fora do beta, texto genérico, erro) → chat normal.
        if (data?.found === false) return false;
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: data.content || "Não consegui processar.", timestamp: new Date() },
        ]);
        if (Array.isArray(data.childSelection?.options) && data.childSelection.options.length > 0) {
          setPendingIntake(null);
          setUndoableIntake(null);
          setChildPick({
            options: data.childSelection.options,
            // Reenvia o MESMO texto (mesmo endpoint) com o child_id escolhido.
            resubmit: (cid, label) => {
              setChildPick(null);
              setMessages((prev) => [...prev, { id: uid(), role: "user", content: label, timestamp: new Date() }]);
              setIsLoading(true);
              void examCaptureRef.current?.(text, cid, endpoint).finally(() => setIsLoading(false));
            },
          });
        } else if (data.intake?.id) {
          setPendingIntake(data.intake);
        }
        return true;
      } catch {
        return false; // erro de rede → cai no chat, não bloqueia o usuário
      }
    },
    [],
  );
  useEffect(() => {
    examCaptureRef.current = runExamCapture;
  }, [runExamCapture]);

  /** PORTA ÚNICA: o servidor decide o playbook quando os gates regex não
   *  mordem; devolve false pra cair no chat. `secondHint` = a mensagem tinha
   *  DOIS assuntos ("saí da consulta E semana que vem fica comigo"). */
  const routeNarrative = useCallback(async (text: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/ai/assistant/narrative-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ found: false }));
      if (data?.found !== true || typeof data.docType !== "string") return false;
      const endpoint =
        data.docType === "health_visit"
          ? "/api/ai/assistant/consult-text"
          : data.docType === "custody_routine"
            ? "/api/ai/assistant/custody-text"
            : data.docType === "expense"
              ? "/api/ai/assistant/expense-text"
              : data.docType === "event_invite"
                ? "/api/ai/assistant/invite-text"
                : "/api/ai/assistant/exam-text";
      const handled = await (examCaptureRef.current?.(text, undefined, endpoint) ?? Promise.resolve(false));
      if (handled && typeof data.secondHint === "string" && data.secondHint) {
        setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: data.secondHint, timestamp: new Date() }]);
      }
      return handled;
    } catch {
      return false; // porta única nunca bloqueia o chat
    }
  }, []);

  /* ---- Send message ---- */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      const trimmed = text.trim();

      // Se há uma pergunta de criança PENDENTE e o usuário DIGITOU o nome (em vez
      // de tocar no botão) → resolve a pendência com esse nome, reusando o
      // `resubmit` (reanalisa a MESMA foto/texto com a criança). Paridade com o
      // WhatsApp, que aceita o nome digitado. Mostra o texto do usuário como resposta.
      if (childPick) {
        const opt = matchOneChildOption(trimmed, childPick.options);
        if (opt) {
          setInputText("");
          childPick.resubmit(opt.id, trimmed);
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      setIsLoading(true);

      try {
        // Captura de provas por texto (gate conservador) ANTES do chat geral —
        // paridade com a foto. Se não for captura, `runExamCapture` devolve false
        // e seguimos pro assistente normal.
        if (looksLikeExamText(userMsg.content)) {
          const handled = await runExamCapture(userMsg.content);
          if (handled) return;
        }
        // Consulta médica por texto (gate próprio; servidor gateia por flag OFF →
        // {found:false} → cai no chat). Depois das provas, não sequestra o escolar.
        else if (looksLikeConsultText(userMsg.content)) {
          const handled = await runExamCapture(userMsg.content, undefined, "/api/ai/assistant/consult-text");
          if (handled) return;
        }
        // Guarda & rotina por texto ("semana que vem o Otto fica comigo…") —
        // 3º da fila: nunca sequestra provas nem consulta. Flag OFF → chat.
        else if (looksLikeCustodyText(userMsg.content)) {
          const handled = await runExamCapture(userMsg.content, undefined, "/api/ai/assistant/custody-text");
          if (handled) return;
        }
        // Despesa por texto ("paguei 250 na consulta do Otto") — 4º da fila.
        // Flag OFF → {found:false} → chat (e a tool de despesa do chat segue).
        else if (looksLikeExpenseText(userMsg.content)) {
          const handled = await runExamCapture(userMsg.content, undefined, "/api/ai/assistant/expense-text");
          if (handled) return;
        }
        // Convite por texto ("aniversário do Théo sábado 12/07") — 5º da fila.
        // Flag OFF → {found:false} → chat.
        else if (looksLikeInviteText(userMsg.content)) {
          const handled = await runExamCapture(userMsg.content, undefined, "/api/ai/assistant/invite-text");
          if (handled) return;
        }
        // PORTA ÚNICA: nenhum gate regex mordeu, mas pode ser captura em tom
        // natural. O servidor classifica (1 chamada barata; fora do beta/flag
        // OFF → {found:false}) e o widget chama o endpoint do playbook certo.
        else {
          const routed = await routeNarrative(userMsg.content);
          if (routed) return;
        }

        // Build messages for API (only role + content)
        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, groupId }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data;
        try {
          data = await response.json();
        } catch {
          // 504/502 may return HTML instead of JSON
          data = { content: response.status === 504
            ? "O assistente demorou para responder. Tente uma pergunta mais simples ou aguarde um momento. ⏳"
            : "Desculpe, ocorreu um erro. Tente novamente. 🙏" };
        }

        const assistantMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: data.content || data.error || "Desculpe, não consegui processar.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const isTimeout = err instanceof DOMException && err.name === "AbortError";
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: isTimeout
              ? "O assistente demorou demais para responder. Por favor, tente novamente em alguns instantes. \u23F3"
              : "Desculpe, ocorreu um erro de conexão. Tente novamente.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, groupId, isLoading, runExamCapture, childPick, routeNarrative]
  );

  /* ---- Enviar imagem (Fase 2: o assistente VÊ a foto e roteia) ---- */
  const sendImage = useCallback(
    async (file: File, opts?: { childId?: string; userLabel?: string; doc?: string }) => {
      if (isLoading) return;
      setPendingIntake(null);
      setChildPick(null);
      setUndoableIntake(null);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: opts?.userLabel ?? "📷 Enviei uma foto", timestamp: new Date() },
      ]);
      setIsLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (opts?.childId) fd.append("child_id", opts.childId);
        // `doc='health'` faz o backend reprocessar a foto como consulta (o
        // /api/ai/assistant/image dispatcha por esse campo). Vem do childSelection.
        if (opts?.doc) fd.append("doc", opts.doc);
        const res = await fetch("/api/ai/assistant/image", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({ content: "Desculpe, ocorreu um erro. 🙏" }));
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: data.content || "Não consegui processar.", timestamp: new Date() },
        ]);
        if (Array.isArray(data.childSelection?.options) && data.childSelection.options.length > 0) {
          const doc = typeof data.childSelection.doc === "string" ? data.childSelection.doc : undefined;
          setChildPick({
            options: data.childSelection.options,
            resubmit: (childId, userLabel) => void sendImage(file, { childId, userLabel, doc }),
          });
        } else if (data.intake?.id) {
          setPendingIntake(data.intake);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: "Não consegui processar a imagem agora. Tente de novo. 🙏", timestamp: new Date() },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  /* ---- Escolher de qual criança é o calendário (botão inline) ---- */
  const pickChild = useCallback(
    (opt: { id: string; name: string }) => {
      const cp = childPick;
      if (!cp || isLoading) return;
      cp.resubmit(opt.id, opt.name);
    },
    [childPick, isLoading]
  );

  /* ---- Confirmar/cancelar o intake reconhecido (provas/consulta/guarda) ---- */
  const confirmPendingIntake = useCallback(async () => {
    const pi = pendingIntake;
    if (!pi || isLoading) return;
    // Copy por playbook: saúde/guarda/despesa têm as suas; escolar inalterado.
    const isHealth = pi.doc === "health";
    const isCustody = pi.doc === "custody";
    const isExpense = pi.doc === "expense";
    const isInvite = pi.doc === "invite";
    setPendingIntake(null);
    setUndoableIntake(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/brain/intakes/${pi.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planHash: pi.planHash, confirmationToken: pi.confirmationToken }),
      });
      const data = await res.json().catch(() => null);
      const ok = data?.kind === "executed";
      // Sucesso → guarda p/ oferecer Desfazer inline (paridade WhatsApp).
      if (ok) setUndoableIntake({ id: pi.id, count: pi.count, doc: pi.doc });
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: ok
            ? isInvite
              ? "✅ Pronto! Adicionei o evento ao calendário. Se precisar, é só tocar em Desfazer."
              : isExpense
              ? `✅ Pronto! Registrei ${pi.count === 1 ? "a despesa" : `${pi.count} despesas`} em Despesas — quem divide aprova por lá. Se precisar, é só tocar em Desfazer.`
              : isCustody
                ? "✅ Pronto! Registrei as combinações — quem precisa aprovar já foi avisado. Se precisar, é só tocar em Desfazer."
                : isHealth
                  ? "✅ Pronto! Registrei a consulta em Saúde. Se precisar, é só tocar em Desfazer."
                  : `✅ Pronto! Adicionei ${pi.count === 1 ? "1 prova" : `${pi.count} provas`} no calendário escolar. Se precisar, é só tocar em Desfazer.`
            : isInvite
              ? "Não consegui adicionar agora. Tente pelo Calendário. 🙏"
              : isExpense
              ? "Não consegui registrar agora. Tente pela tela Despesas. 🙏"
              : isCustody
                ? "Não consegui registrar agora. Tente pelo Calendário. 🙏"
                : isHealth
                  ? "Não consegui registrar agora. Tente pela tela Saúde. 🙏"
                  : "Não consegui adicionar agora. Tente pela tela Escola › Calendário. 🙏",
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: isInvite
            ? "Não consegui adicionar agora. Tente pelo Calendário. 🙏"
            : isExpense
            ? "Não consegui registrar agora. Tente pela tela Despesas. 🙏"
            : isCustody
              ? "Não consegui registrar agora. Tente pelo Calendário. 🙏"
              : isHealth
                ? "Não consegui registrar agora. Tente pela tela Saúde. 🙏"
                : "Não consegui adicionar agora. Tente pela tela Escola › Calendário. 🙏",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [pendingIntake, isLoading]);

  const cancelPendingIntake = useCallback(() => {
    setPendingIntake(null);
    setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: "Ok, não adicionei nada. 🙂", timestamp: new Date() }]);
  }, []);

  /* ---- Desfazer o intake recém-criado (provas OU consulta; paridade WhatsApp) ---- */
  const undoConfirmedIntake = useCallback(async () => {
    const ui = undoableIntake;
    if (!ui || isLoading) return;
    const isHealth = ui.doc === "health";
    const isCustody = ui.doc === "custody";
    const isExpense = ui.doc === "expense";
    const isInvite = ui.doc === "invite";
    setUndoableIntake(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/brain/intakes/${ui.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      const done = data?.kind === "undone";
      const removed = typeof data?.removed === "number" ? data.removed : ui.count;
      const detached = typeof data?.detached === "number" ? data.detached : 0;
      let content: string;
      if (done && removed > 0) {
        if (isInvite) {
          // Convite: o(s) evento(s) do calendário criados por este intake.
          content = `Desfeito — removi ${removed === 1 ? "o evento" : `${removed} eventos`} do calendário.`;
        } else if (isExpense) {
          // Despesas: `detached` = já aprovadas/decididas (o coparente agiu — fica).
          content = `Desfeito — removi ${removed === 1 ? "1 despesa" : `${removed} despesas`}.`;
          if (detached > 0) content += ` (${detached === 1 ? "1 despesa já aprovada" : `${detached} despesas já aprovadas`} continua${detached === 1 ? "" : "m"} valendo.)`;
        } else if (isCustody) {
          // Guarda/rotina: itens; `detached` = trocas JÁ aceitas (acordo fica).
          content = `Desfeito — removi ${removed === 1 ? "1 combinação" : `${removed} combinações`} de guarda e rotina.`;
          if (detached > 0) content += ` (${detached === 1 ? "1 troca já aceita" : `${detached} trocas já aceitas`} continua${detached === 1 ? "" : "m"} valendo.)`;
        } else if (isHealth) {
          // Saúde: são REGISTROS (consulta/retorno/episódio/medicação), não provas.
          content = `Desfeito — removi ${removed === 1 ? "1 registro" : `${removed} registros`} da consulta.`;
          if (detached > 0) content += ` (${detached === 1 ? "1 registro foi alterado" : `${detached} registros foram alterados`} depois e continua${detached === 1 ? "" : "m"} em Saúde.)`;
        } else {
          content = `Desfeito — removi ${removed === 1 ? "1 prova" : `${removed} provas`}.`;
          if (detached > 0) content += ` (${detached === 1 ? "1 prova foi alterada" : `${detached} provas foram alteradas`} depois e continua${detached === 1 ? "" : "m"} no calendário.)`;
        }
      } else if (done) {
        content = "Já estava desfeito — não havia nada a remover.";
      } else {
        content = isInvite
          ? "Não consegui desfazer agora. Você pode reverter pelo Calendário. 🙏"
          : isExpense
          ? "Não consegui desfazer agora. Você pode reverter em Despesas. 🙏"
          : isCustody
            ? "Não consegui desfazer agora. Você pode reverter pelo Calendário. 🙏"
            : isHealth
              ? "Não consegui desfazer agora. Você pode reverter em Saúde. 🙏"
              : "Não consegui desfazer agora. Você pode reverter em Escola › Calendário. 🙏";
      }
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content, timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: isInvite
            ? "Não consegui desfazer agora. Tente pelo Calendário. 🙏"
            : isExpense
            ? "Não consegui desfazer agora. Tente pela tela Despesas. 🙏"
            : isCustody
              ? "Não consegui desfazer agora. Tente pelo Calendário. 🙏"
              : isHealth
                ? "Não consegui desfazer agora. Tente pela tela Saúde. 🙏"
                : "Não consegui desfazer agora. Tente pela tela Escola › Calendário. 🙏",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [undoableIntake, isLoading]);

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

              {/* Confirmar/cancelar as provas de um calendário reconhecido numa foto */}
              {pendingIntake && !isLoading && (
                <div className="shrink-0 px-3 pb-1 pt-1 flex flex-wrap gap-1.5">
                  <button
                    onClick={confirmPendingIntake}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-600 text-white text-[12px] font-medium hover:bg-green-700 transition-colors"
                  >
                    ✅ Confirmar e adicionar
                  </button>
                  <button
                    onClick={cancelPendingIntake}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-[12px] font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Desfazer as provas recém-criadas (paridade WhatsApp: botão logo após confirmar) */}
              {undoableIntake && !isLoading && (
                <div className="shrink-0 px-3 pb-1 pt-1 flex flex-wrap gap-1.5">
                  <button
                    onClick={undoConfirmedIntake}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-[12px] font-medium hover:bg-gray-200 transition-colors"
                  >
                    ↩️ Desfazer
                  </button>
                </div>
              )}

              {/* De qual criança é o calendário? Botões inline (paridade WhatsApp) */}
              {childPick && !isLoading && (
                <div className="shrink-0 px-3 pb-1 pt-1 flex flex-wrap gap-1.5">
                  {childPick.options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => pickChild(opt)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#7C6FAE] text-white text-[12px] font-medium hover:bg-[#6b5f9a] transition-colors"
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              )}

              {/* ---- Input Bar ---- */}
              <div className="shrink-0 px-3 py-2.5 border-t border-gray-100 bg-white rounded-b-2xl safe-area-bottom">
                <div className="flex items-center gap-1.5">
                  {/* Attach photo (Fase 2 — assistente vê a imagem) */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) sendImage(f);
                      if (imageInputRef.current) imageInputRef.current.value = "";
                    }}
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isLoading}
                    aria-label="Anexar foto"
                    className="shrink-0 p-2.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-[#7C6FAE] disabled:opacity-40 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>

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
