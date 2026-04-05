"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeTone } from "@/lib/tone-moderator";
import { getPostHogClient } from "@/lib/posthog";
import { getDisplayName } from "@/lib/constants";
import { markChannelRead } from "@/actions/chat-channels";
import { useI18n } from "@/i18n/provider";
import { hapticSuccess } from "@/lib/haptics";
import ChannelTabs from "./ChannelTabs";

/* Memoized message bubble to prevent re-rendering all messages on new message */
const MessageBubble = memo(function MessageBubble({
  msg,
  isOwn,
  memberName,
  userId: _userId, // eslint-disable-line @typescript-eslint/no-unused-vars
  onImageClick,
  formatTime,
  t,
}: {
  msg: Message;
  isOwn: boolean;
  memberName: string;
  userId: string;
  onImageClick: (url: string) => void;
  formatTime: (dateStr: string) => string;
  t: (key: string) => string;
}) {
  const hasContent = !!(msg.text?.trim() || msg.image_url);
  if (!hasContent) return null;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
        isOwn ? "bg-primary text-white rounded-br-md" : "bg-white shadow-sm rounded-bl-md"
      }`}>
        {!isOwn && (
          <p className="text-xs font-medium text-primary mb-1">
            {memberName !== "Usuario" ? memberName : "Usuario"}
          </p>
        )}
        {msg.image_url && (
          <button
            type="button"
            onClick={() => msg.image_url && onImageClick(msg.image_url)}
            className="block mb-1 rounded-xl overflow-hidden max-w-[280px] cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.image_url}
              alt={t("chat.sentImage")}
              className="w-full h-auto rounded-xl shadow object-cover"
              loading="lazy"
            />
          </button>
        )}
        {msg.text?.trim() && (
          <p className={`text-sm ${isOwn ? "text-white" : "text-dark"}`}>{msg.text}</p>
        )}
        <p className={`text-xs mt-1 flex items-center gap-1 ${isOwn ? "text-white/70 justify-end" : "text-muted"}`}>
          <span>{formatTime(msg.created_at)}</span>
          {isOwn && !msg.id.startsWith("optimistic-") && (
            <span className={
              msg.read_by && Object.keys(msg.read_by).length > 1
                ? "text-blue-200 font-bold"
                : "text-white/50"
            }>
              {msg.read_by && Object.keys(msg.read_by).length > 1 ? "\u2713\u2713" : "\u2713"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
});

/* Date separator between messages of different days (WhatsApp-style) */
const DateSeparator = memo(function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 text-[12px] font-medium text-[#7A8C8B] bg-[#EEECEA] rounded-full shadow-sm">
        {label}
      </span>
    </div>
  );
});

/** Get a human-friendly date label for a message timestamp */
function getDateLabel(dateStr: string): string {
  const msgDate = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
  const diffMs = today.getTime() - msgDay.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) {
    const dayNames = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];
    return dayNames[msgDate.getDay()];
  }
  return msgDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** Get date key (YYYY-MM-DD local) for grouping */
function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ChatListItem = { type: "separator"; key: string; label: string } | { type: "message"; msg: Message };

function generateMonthOptions(monthNames: string[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/gif", "image/webp"];
const MAX_CACHED_CHANNELS = 5;

interface Message {
  id: string;
  sender_id: string;
  text: string | null;
  image_url?: string | null;
  channel_id?: string | null;
  read_by: Record<string, string>;
  created_at: string;
  profiles?: { full_name: string };
}

interface ChatChannel {
  id: string;
  slug: string;
  name: string;
  channel_type: string;
  child_id: string | null;
  icon: string | null;
  sort_order: number;
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
  isReadonly = false,
  channels = [],
  defaultChannelSlug = "geral",
  defaultChannelId = null,
  unreadCounts: initialUnreadCounts = {},
}: {
  groupId: string;
  userId: string;
  initialMessages: Message[];
  members: Member[];
  isReadonly?: boolean;
  channels?: ChatChannel[];
  defaultChannelSlug?: string;
  defaultChannelId?: string | null;
  unreadCounts?: Record<string, number>;
}) {
  const { t } = useI18n();

  // --- Channel switching state ---
  const [activeChannelSlug, setActiveChannelSlug] = useState(defaultChannelSlug);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState(initialUnreadCounts);

  // Derived: active channel object and id
  const activeChannel = useMemo(
    () => channels.find((c) => c.slug === activeChannelSlug) || channels[0],
    [channels, activeChannelSlug]
  );
  const activeChannelId = activeChannel?.id || null;

  // Message cache: slug -> Message[]
  const messageCacheRef = useRef<Map<string, Message[]>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);

  // Seed cache with initial messages
  useEffect(() => {
    messageCacheRef.current.set(defaultChannelSlug, initialMessages);
    cacheOrderRef.current = [defaultChannelSlug];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toneResult, setToneResult] = useState<ToneAnalysis | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [, setPendingNonce] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const activeChannelRef = useRef(activeChannelSlug);
  const activeChannelIdRef = useRef(activeChannelId);
  const supabase = createClient();

  // Keep refs in sync
  useEffect(() => {
    activeChannelRef.current = activeChannelSlug;
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelSlug, activeChannelId]);

  // Track mount state for async operations
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toneTimerRef.current) {
        clearTimeout(toneTimerRef.current);
        toneTimerRef.current = null;
      }
    };
  }, []);

  const memberNames = useMemo(() => {
    const names: Record<string, string> = {};
    members.forEach((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      names[m.user_id] = getDisplayName(p?.full_name);
    });
    return names;
  }, [members]);

  // --- Cache management helpers ---
  const updateCache = useCallback((slug: string, msgs: Message[]) => {
    messageCacheRef.current.set(slug, msgs);
    // Move to front of LRU order
    cacheOrderRef.current = [slug, ...cacheOrderRef.current.filter((s) => s !== slug)];
    // Evict oldest if over limit
    while (cacheOrderRef.current.length > MAX_CACHED_CHANNELS) {
      const evicted = cacheOrderRef.current.pop();
      if (evicted) messageCacheRef.current.delete(evicted);
    }
  }, []);

  // --- Fetch messages for a channel ---
  const fetchChannelMessages = useCallback(
    async (slug: string, channelId: string | null): Promise<Message[]> => {
      const params = new URLSearchParams({ groupId, channelSlug: slug });
      if (channelId) params.set("channelId", channelId);
      const res = await fetch(`/api/chat/messages?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return data.messages || [];
    },
    [groupId]
  );

  // --- Channel switch handler ---
  const switchChannel = useCallback(
    async (slug: string) => {
      if (slug === activeChannelRef.current) return;

      // Save current messages to cache before switching
      updateCache(activeChannelRef.current, messages);

      // Instant UI update
      setActiveChannelSlug(slug);

      // Clear unread count for this channel
      setUnreadCounts((prev) => {
        if (!prev[slug]) return prev;
        const next = { ...prev };
        delete next[slug];
        return next;
      });

      const targetChannel = channels.find((c) => c.slug === slug) || channels[0];
      const targetChannelId = targetChannel?.id || null;

      // Check cache first
      const cached = messageCacheRef.current.get(slug);
      if (cached) {
        setMessages(cached);
        // Mark channel as read (fire and forget)
        if (targetChannelId) markChannelRead(targetChannelId);
        return;
      }

      // Not cached: fetch from API
      setLoadingChannel(true);
      try {
        const msgs = await fetchChannelMessages(slug, targetChannelId);
        if (!mountedRef.current) return;
        // Only update if user hasn't switched away during fetch
        if (activeChannelRef.current === slug) {
          setMessages(msgs);
          updateCache(slug, msgs);
        }
      } catch (err) {
        console.error("Failed to load channel messages:", err);
        if (activeChannelRef.current === slug) {
          setMessages([]);
        }
      } finally {
        if (mountedRef.current) setLoadingChannel(false);
      }

      // Mark channel as read
      if (targetChannelId) markChannelRead(targetChannelId);
    },
    [channels, messages, fetchChannelMessages, updateCache]
  );

  // Mark messages from others as read
  const markMessagesAsRead = useCallback(async () => {
    const unreadMessages = messages.filter(
      (m) =>
        m.sender_id !== userId &&
        m.read_by &&
        !m.read_by[userId] &&
        !m.id.startsWith("optimistic-")
    );

    if (unreadMessages.length === 0) return;

    const now = new Date().toISOString();
    const unreadMsgIds = unreadMessages.map((m) => m.id);

    // Update local state immediately so checkmarks appear instantly
    setMessages((prev) =>
      prev.map((m) =>
        unreadMsgIds.includes(m.id)
          ? { ...m, read_by: { ...(m.read_by || {}), [userId]: now } }
          : m
      )
    );

    // Batch update: use Promise.allSettled so one failure doesn't block others
    const results = await Promise.allSettled(
      unreadMessages.map((msg) =>
        supabase
          .from("chat_messages")
          .update({
            read_by: { ...(msg.read_by || {}), [userId]: now },
          })
          .eq("id", msg.id)
      )
    );

    // Log any failures but don't revert UI (read receipts are non-critical)
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.warn(`Failed to mark ${failures.length} messages as read`);
    }
  }, [messages, userId, supabase]);

  useEffect(() => {
    markMessagesAsRead();
  }, [markMessagesAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark channel as read on initial load
  useEffect(() => {
    if (defaultChannelId) {
      markChannelRead(defaultChannelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Realtime subscription: re-subscribe when active channel changes ---
  useEffect(() => {
    const geralChannelId = channels.find((c) => c.slug === "geral")?.id || null;
    const channel = supabase
      .channel(`chat:${groupId}:${activeChannelSlug}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const msg = payload.new as Message;

          // Only show messages for the active channel
          const msgChannelId = msg.channel_id || null;
          const currentSlug = activeChannelRef.current;
          const currentChannelId = activeChannelIdRef.current;
          const currentIsGeral = currentSlug === "geral";

          const belongsToActiveChannel =
            msgChannelId === currentChannelId ||
            (currentIsGeral && msgChannelId === null);

          if (!belongsToActiveChannel) {
            // Message is for a different channel -- increment unread count
            const targetSlug = channels.find((c) => c.id === msgChannelId)?.slug;
            const effectiveSlug =
              !msgChannelId || msgChannelId === geralChannelId ? "geral" : targetSlug;
            if (effectiveSlug && effectiveSlug !== currentSlug && msg.sender_id !== userId) {
              setUnreadCounts((prev) => ({
                ...prev,
                [effectiveSlug]: (prev[effectiveSlug] || 0) + 1,
              }));
            }
            return;
          }

          // Skip empty messages (no text and no image)
          if (!msg.text?.trim() && !msg.image_url) return;

          // Guard against updates after unmount
          if (!mountedRef.current) return;

          msg.profiles = { full_name: memberNames[msg.sender_id] || "Usuario" };
          if (!msg.read_by) msg.read_by = {};
          setMessages((prev) => {
            // Replace optimistic message if it matches
            const optimisticIdx = prev.findIndex(
              (m) =>
                m.id.startsWith("optimistic-") &&
                m.sender_id === msg.sender_id &&
                ((m.text || null) === (msg.text || null) ||
                  (m.image_url && msg.image_url))
            );
            if (optimisticIdx !== -1) {
              const updated = [...prev];
              updated[optimisticIdx] = msg;
              return updated;
            }
            // Skip if already in list (duplicate from realtime)
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!mountedRef.current) return;
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, read_by: updated.read_by || {} } : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, activeChannelSlug, activeChannelId]);

  // Analisa tom 1.5s apos parar de digitar
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

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t("chat.imageUnsupported"));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError(t("chat.imageTooLarge"));
      return;
    }

    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  function removeSelectedImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(null);
    setImagePreview(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewMessage(value);
    checkTone(value);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    const hasImage = !!selectedImage;
    if (!trimmed && !hasImage) return;
    if (sending) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Optimistic: show message instantly
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_id: userId,
      text: trimmed || null,
      image_url: imagePreview, // show local preview optimistically
      read_by: { [userId]: new Date().toISOString() },
      created_at: new Date().toISOString(),
      profiles: { full_name: memberNames[userId] || "Usuario" },
    };

    setPendingNonce(nonce);
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");
    setSending(true);
    setShowSuggestion(false);
    setToneResult(null);

    // Capture image ref before clearing
    const imageFile = selectedImage;
    const previewUrl = imagePreview;
    removeSelectedImage();

    // Refresh session before sending to avoid expired token
    const { error: refreshError } = await supabase.auth.getSession();
    if (refreshError) {
      window.location.href = "/login";
      return;
    }

    let uploadedImageUrl: string | null = null;

    // Upload image if present
    if (imageFile) {
      const timestamp = Date.now();
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `chat/${groupId}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          contentType: imageFile.type,
        });

      if (uploadError) {
        console.error("Chat image upload failed:", uploadError.message);
        // Remove optimistic message on upload failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setPendingNonce(null);
        setNewMessage(trimmed);
        // Re-attach image so user can retry without re-selecting
        setSelectedImage(imageFile);
        setImagePreview(URL.createObjectURL(imageFile));
        setImageError(t("chat.imageUploadFailed"));
        setSending(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      uploadedImageUrl = urlData.publicUrl;

      // Update optimistic message with real URL
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, image_url: uploadedImageUrl } : m))
      );
    }

    // Clean up blob URL
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const insertData: Record<string, unknown> = {
      group_id: groupId,
      sender_id: userId,
      read_by: { [userId]: new Date().toISOString() },
    };
    if (activeChannelId) insertData.channel_id = activeChannelId;
    if (trimmed) insertData.text = trimmed;
    if (uploadedImageUrl) insertData.image_url = uploadedImageUrl;

    const { error } = await supabase.from("chat_messages").insert(insertData);

    if (error) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setPendingNonce(null);
      setNewMessage(trimmed);

      if (error.message?.includes("JWT") || error.code === "PGRST301") {
        window.location.href = "/login";
        return;
      }
    } else {
      setPendingNonce(null);
      hapticSuccess();
      // Track message sent
      getPostHogClient()?.capture("message_sent", {
        group_id: groupId,
        has_image: !!uploadedImageUrl,
      });

      // Notify other members via push (fire and forget)
      const pushText = uploadedImageUrl
        ? trimmed
          ? `[Foto] ${trimmed}`
          : "[Foto]"
        : trimmed;
      fetch("/api/push/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, messageText: pushText }),
      }).catch(() => {});
    }

    setSending(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (showSuggestion && toneResult?.isAggressive) return; // Forca escolha
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

  // Close export menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu]);

  function handleExport(month?: string) {
    const params = new URLSearchParams({ groupId });
    if (month) params.set("month", month);
    if (activeChannelId) params.set("channelId", activeChannelId);
    window.open(`/api/chat/export?${params.toString()}`, "_blank");
    setShowExportMenu(false);
    setSelectedMonth("");
  }

  const formatTime = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }, []);

  const handleImageClick = useCallback((url: string) => {
    setViewerImage(url);
  }, []);

  // Pre-compute message list with date separators (memoized, no work on re-render)
  const chatListItems: ChatListItem[] = useMemo(() => {
    if (!messages.length) return [];
    const items: ChatListItem[] = [];
    let lastDateKey = "";
    for (const msg of messages) {
      const dateKey = getDateKey(msg.created_at);
      if (dateKey !== lastDateKey) {
        items.push({ type: "separator", key: `sep-${dateKey}`, label: getDateLabel(msg.created_at) });
        lastDateKey = dateKey;
      }
      items.push({ type: "message", msg });
    }
    return items;
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem-env(safe-area-inset-top,0px))]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-dark">{t("chat.groupChat")}</h1>
        <span className="text-xs text-muted bg-gray-100 px-2 py-1 rounded-full">
          {t("chat.members", { count: members.length })}
        </span>
        <div className="relative ml-auto" ref={exportRef}>
          <button
            type="button"
            onClick={() => setShowExportMenu((v) => !v)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={t("chat.exportChat")}
            title={t("chat.exportChat")}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-30 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-sm font-semibold text-dark mb-3">{t("chat.exportConversations")}</p>
              <button
                type="button"
                onClick={() => handleExport()}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors mb-2"
              >
                {t("chat.allMessages")}
              </button>
              <div className="border-t border-gray-100 pt-2">
                <p className="text-xs text-muted mb-2">{t("chat.byMonth")}:</p>
                <div className="flex gap-2">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">{t("chat.select")}</option>
                    {generateMonthOptions(t("calendar.monthNames").split(",")).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => selectedMonth && handleExport(selectedMonth)}
                    disabled={!selectedMonth}
                    className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                  >
                    {t("common.export")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Channel Tabs */}
      {channels.length > 0 && (
        <ChannelTabs
          channels={channels}
          activeSlug={activeChannelSlug}
          unreadCounts={unreadCounts}
          onChannelChange={switchChannel}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {loadingChannel ? (
          <div className="space-y-3 py-4 animate-pulse">
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
              <div className="bg-gray-100 rounded-2xl h-[48px] w-3/4" />
            </div>
            <div className="flex gap-2 justify-end">
              <div className="bg-primary/10 rounded-2xl h-[48px] w-2/3" />
            </div>
            <div className="flex gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
              <div className="bg-gray-100 rounded-2xl h-[36px] w-1/2" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted py-8">
            <p>{t("chat.noMessages")}</p>
            <p className="text-sm mt-1">{t("chat.startConversation")}</p>
          </div>
        ) : (
          chatListItems.map((item) => {
            if (item.type === "separator") {
              return <DateSeparator key={item.key} label={item.label} />;
            }
            const msg = item.msg;
            const isOwn = msg.sender_id === userId;
            const name = getDisplayName(msg.profiles?.full_name) !== "Usuario"
              ? getDisplayName(msg.profiles?.full_name)
              : memberNames[msg.sender_id] || "Usuario";
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isOwn={isOwn}
                memberName={name}
                userId={userId}
                onImageClick={handleImageClick}
                formatTime={formatTime}
                t={t}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sugestao da IA Mediadora */}
      {showSuggestion && toneResult?.isAggressive && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-lg leading-none mt-0.5">&#9888;&#65039;</span>
            <div>
              <p className="text-sm font-medium text-amber-800">
                {t("chat.escalateWarning")}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {t("chat.aiSuggestion")}
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
              {t("chat.useSuggestion")}
            </button>
            <button
              type="button"
              onClick={sendOriginal}
              className="flex-1 min-w-[140px] px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t("chat.sendOriginal")}
            </button>
            <button
              type="button"
              onClick={discardMessage}
              className="px-3 py-2 text-gray-400 text-sm rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              {t("chat.discard")}
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {isReadonly ? (
        <div className="text-center py-3 text-sm text-muted bg-gray-50 rounded-xl">
          {t("chat.readOnlyMessage")}
        </div>
      ) : (
        <div>
          {/* Image preview */}
          {imagePreview && (
            <div className="mb-2 flex items-start gap-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-[60px] h-[60px] object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeSelectedImage}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-gray-600 text-white rounded-full flex items-center justify-center text-xs leading-none hover:bg-gray-800 transition-colors"
                  aria-label={t("chat.removeImage")}
                >
                  &times;
                </button>
              </div>
            </div>
          )}

          {/* Image error */}
          {imageError && (
            <p className="text-xs text-red-500 mb-2">{imageError}</p>
          )}

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/gif,image/webp"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors disabled:opacity-50"
              aria-label={t("chat.sendPhoto")}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              placeholder={selectedImage ? t("chat.addCaption") : t("chat.typeMessage")}
              className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-colors text-[#2C2C2C] text-base ${
                showSuggestion && toneResult?.isAggressive
                  ? "border-amber-300 focus:ring-amber-200 focus:border-amber-400"
                  : "border-gray-200 focus:ring-primary/50 focus:border-primary"
              }`}
            />
            <div className="relative">
              <button
                type="submit"
                disabled={sending || (!newMessage.trim() && !selectedImage) || (showSuggestion && !!toneResult?.isAggressive)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary-dark active:bg-primary-dark transition-colors disabled:opacity-50"
                title={showSuggestion && toneResult?.isAggressive ? t("chat.reviewBeforeSend") : undefined}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
              {showSuggestion && toneResult?.isAggressive && (
                <p className="absolute bottom-full mb-1 right-0 whitespace-nowrap text-[11px] text-amber-600 font-medium">
                  {t("chat.reviewSuggestion")}
                </p>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Full-size image viewer */}
      {viewerImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewerImage(null)}
        >
          <button
            type="button"
            onClick={() => setViewerImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none z-10"
            aria-label={t("common.close")}
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewerImage}
            alt={t("chat.fullScreenImage")}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
