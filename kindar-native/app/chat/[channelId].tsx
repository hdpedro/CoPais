/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/alt-text */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Alert,
  ActionSheetIOS,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import { useToast } from 'src/components/ui/ToastProvider';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

// PT-BR month names (matches PWA `calendar.monthNames` translation source).
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// 12 most recent months (current + 11 previous), matching PWA `ChatRoom.tsx:116-126`.
function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_PT[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

// Minimal HTML escape — chat messages are user-provided and printed as text.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function uploadChatImage(uri: string, mimeType: string, groupId: string): Promise<string | null> {
  try {
    const res = await fetch(uri);
    const arrayBuffer = await res.arrayBuffer();
    const ext = mimeType.split('/')[1] || 'jpg';
    const path = `${groupId}/chat/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('documents').upload(path, arrayBuffer, {
      contentType: mimeType, upsert: false,
    });
    if (error) return null;
    // Path-only after migration 062. Components sign URLs at render time.
    return path;
  } catch {
    return null;
  }
}

interface Message {
  id: string;
  text: string;
  sender_id: string;
  senderName: string;
  created_at: string;
  image_url: string | null;
  reply_to_id: string | null;
  read_by: Record<string, string> | null;
}

interface ReplyTarget {
  id: string;
  text: string;
  senderName: string;
}

interface ChannelSummary {
  id: string;
  name: string;
  icon: string | null;
  channel_type: string;
  child_name: string | null;
}

// Detect system notification messages (prefixed with emoji) — rendered as
// centered cards instead of regular bubbles. Mirrors PWA chat-notify pattern.
const SYSTEM_PREFIXES = ['✅', '🔄', '🎯', '🏥', '💊', '⚖️', '📅', '📝', '💰', '🎁', '🤝', '🧹', '🔧', '🚨', '📈', '📉'];
function isSystemMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const first = [...text.trim()][0];
  return SYSTEM_PREFIXES.some(p => text.trim().startsWith(p)) || (first ? /\p{Emoji}/u.test(first) : false);
}

export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { userId, activeGroup } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [channelName, setChannelName] = useState('Chat');
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [memberCount, setMemberCount] = useState(0);
  const [pendingImage, setPendingImage] = useState<{ uri: string; mime: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Reply state — drives the preview bar above the input.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Tone moderator — debounced inline (mirrors PWA `ChatRoom.tsx:504-522`)
  const [toneResult, setToneResult] = useState<{ isAggressive: boolean; suggestion: string | null } | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const toneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const membersRef = useRef<Record<string, string>>({});
  // Track the active channel's slug so realtime handlers can apply the
  // "Geral channel includes channel_id IS NULL" legacy rule (mirrors PWA
  // `api/chat/messages/route.ts:40-45`). Without this, legacy messages
  // posted before migration 00021_chat_channels.sql never reach the room.
  const channelSlugRef = useRef<string | null>(null);

  // Export-to-PDF modal state (mirrors PWA `ChatRoom.tsx:768-816`).
  // Empty `selectedMonth` means "all messages"; empty `selectedChannelId` means
  // "all channels in this group". `exporting` disables the submit button while
  // the PDF is being generated and shared.
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // Cleanup tone timer on unmount
  useEffect(() => {
    return () => {
      if (toneTimerRef.current) {
        clearTimeout(toneTimerRef.current);
        toneTimerRef.current = null;
      }
    };
  }, []);

  // Load channel info + members + messages.
  //
  // Channel-switch hardening: keep a per-load `loadId` and bail out if the
  // user navigated away mid-flight. Without this, a slow first channel
  // could overwrite the new channel's state when its Promise.all (signed
  // image URLs) finally resolves. Same idea as PWA `mountedRef` guard.
  const loadIdRef = useRef(0);
  useEffect(() => {
    if (!channelId || !activeGroup) return;
    const myLoadId = ++loadIdRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setMessages([]); // clear immediately so the previous channel's bubbles disappear
    // Entering a channel clears its unread counter (mirrors PWA `ChatRoom.tsx` behavior).
    setUnreadByChannel(prev => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });

    async function load() {
      try {
        // Channel name + all channels for tabs + member count in one shot
        const [{ data: ch }, { data: allCh }, { data: members }] = await Promise.all([
          supabase.from('chat_channels').select('name, slug').eq('id', channelId).single(),
          supabase.from('chat_channels')
            .select('id, name, icon, channel_type, sort_order, child_id, children(full_name)')
            .eq('group_id', activeGroup!.groupId)
            .order('sort_order'),
          supabase.from('group_members')
            .select('user_id, profiles(full_name, display_name, email)')
            .eq('group_id', activeGroup!.groupId),
        ]);
        if (loadIdRef.current !== myLoadId) return; // user switched channels
        if (ch) setChannelName(ch.name);
        // Cache slug for realtime handlers + messages query (Geral includes NULL).
        channelSlugRef.current = ch?.slug ?? null;
        setChannels((allCh || []).map((c: any) => ({
          id: c.id, name: c.name, icon: c.icon,
          channel_type: c.channel_type,
          child_name: c.children?.full_name?.split(' ')[0] || null,
        })));
        setMemberCount((members || []).length);

        const memberMap: Record<string, string> = {};
        (members || []).forEach((m: any) => {
          const p = m.profiles || {};
          // Nome compacto pra header de mensagens — firstOnly
          memberMap[m.user_id] = p.display_name
            || getDisplayName(p.full_name, true)
            || (p.email ? p.email.split('@')[0].split('.')[0] : 'Usuario');
        });
        membersRef.current = memberMap;

        // Messages
        // Geral channel includes legacy rows with `channel_id IS NULL`
        // (mirrors PWA `api/chat/messages/route.ts:40-45`). Mensagens
        // criadas antes da migração 00021_chat_channels.sql ficaram sem
        // channel_id e só voltam pelo OR abaixo.
        const isGeral = ch?.slug === 'geral';
        let msgsQuery = supabase
          .from('chat_messages')
          .select('id, text, sender_id, created_at, image_url, reply_to_id, read_by')
          // Buscar as 100 mais NOVAS (DESC), igual ao PWA
          // `api/chat/messages/route.ts`. Antes era `ascending: true` (100 mais
          // ANTIGAS): num canal com >100 msgs, as mais recentes ficavam fora da
          // janela — a lista mostrava o preview (DESC LIMIT 1) mas a thread não
          // exibia a mensagem (bug Amanda 2026-06). Revertidas p/ ASC abaixo.
          .order('created_at', { ascending: false })
          .limit(100);
        if (isGeral) {
          msgsQuery = msgsQuery.or(`channel_id.eq.${channelId},channel_id.is.null`);
        } else {
          msgsQuery = msgsQuery.eq('channel_id', channelId);
        }
        const { data: rawMsgs, error: msgsError } = await msgsQuery;
        if (loadIdRef.current !== myLoadId) return; // stale fetch
        if (msgsError) throw msgsError;
        // Fetch foi DESC (mais novas primeiro); reverte p/ ASC (exibição
        // cronológica), igual ao PWA `signedRows.reverse()`. Assim toda a lógica
        // abaixo — assinatura de imagens, messageItems() e o slice(-20) de
        // não-lidas — segue intacta operando sobre ordem ascendente.
        const msgs = (rawMsgs ?? []).slice().reverse();

        // image_url is path-only after migration 062 — sign in parallel.
        const { getSignedFileUrl } = await import('src/services/storage');
        const signed = await Promise.all((msgs || []).map(async (m: any) => ({
          ...m,
          image_url: m.image_url
            ? (await getSignedFileUrl('documents', m.image_url, 3600)) || m.image_url
            : null,
          senderName: memberMap[m.sender_id] || 'Usuario',
        })));
        if (loadIdRef.current !== myLoadId) return; // stale signed-URL batch
        setMessages(signed);

        // Mark unread messages as read — single batched call to /api/chat/read
        // (Wave I single-source-of-truth migration). Server merges read_by atomically
        // per message and gates writes by group membership.
        if (userId && msgs && msgs.length > 0) {
          const unreadIds = msgs
            .filter((m: any) => m.sender_id !== userId && (!m.read_by || !(m.read_by as Record<string, unknown>)[userId]))
            .slice(-20)
            .map((m: any) => m.id as string);
          if (unreadIds.length > 0) {
            const { apiFetch } = await import('src/lib/api-fetch');
            apiFetch('/api/chat/read', { method: 'POST', body: { messageIds: unreadIds } })
              .then(() => {}, () => {});
          }
        }
      } catch (e) {
        // Without this catch, any rejection above (network blip, signed-URL
        // failure, schema drift) silently aborts the load and leaves the
        // room blank — which is exactly the iOS bug we're fixing. Forward
        // to /api/log-error so we can diagnose remotely.
        if (loadIdRef.current === myLoadId) {
          try {
            const { reportError } = await import('src/lib/error-reporter');
            reportError(e, {
              filePath: 'app/chat/[channelId].tsx',
              metadata: { channelId, step: 'load' },
            });
          } catch {}
          console.warn('[chat-detail] load failed', e);
          setMessages([]);
        }
      } finally {
        if (loadIdRef.current === myLoadId) {
          setLoading(false);
        }
      }
    }

    load();
  }, [channelId, activeGroup, userId]);

  // Real-time subscription. Mirror PWA `ChatRoom.tsx:403-410`: subscribe by
  // `group_id` and dispatch by `msg.channel_id` so unread counters in OTHER
  // channels (the in-room pill bar) stay live without remounting the screen.
  // Without this, only messages in the current channel arrive; switching
  // pills or changing channels needs a full reload to see deltas elsewhere.
  useEffect(() => {
    if (!channelId || !activeGroup) return;
    const groupId = activeGroup.groupId;

    // Nome do canal DEVE ser único por mount. Um duplo-toque abre duas telas
    // chat/[channelId] com o mesmo groupId+channelId; com nome igual, o 2º mount
    // roda `.on(...)` depois do 1º já ter chamado `.subscribe()` → Supabase
    // crasha "cannot add postgres_changes callbacks ... after subscribe()" (bug
    // 2026-06-06). Sufixo aleatório espelha useCollabRealtime.ts; `subscribed`
    // evita re-subscribe do mesmo canal se o effect rodar 2x antes do cleanup.
    const channelKey = `chat:${groupId}:${channelId}:${Math.random().toString(36).slice(2, 8)}`;
    let subscribed = false;

    const channel = supabase
      .channel(channelKey)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const msg = payload.new as any;

        // Active channel? If yes, append to the visible thread. Otherwise
        // bump the per-channel unread count so the pill bar shows the dot.
        // Geral special-case: legacy rows with channel_id=null also belong
        // to Geral (mirrors PWA api/chat/messages route).
        const isGeralRoom = channelSlugRef.current === 'geral';
        const matchesActiveChannel =
          msg.channel_id === channelId
          || (isGeralRoom && msg.channel_id == null);
        if (!matchesActiveChannel) {
          if (userId && msg.sender_id !== userId && msg.channel_id) {
            setUnreadByChannel(prev => ({
              ...prev,
              [msg.channel_id]: (prev[msg.channel_id] ?? 0) + 1,
            }));
          }
          return;
        }

        // Sign image_url at message arrival; bucket private after migration 062.
        let imageUrl: string | null = null;
        if (msg.image_url) {
          if (msg.image_url.startsWith('http')) {
            imageUrl = msg.image_url;
          } else {
            const { getSignedFileUrl } = await import('src/services/storage');
            imageUrl = (await getSignedFileUrl('documents', msg.image_url, 3600)) || msg.image_url;
          }
        }
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          const realMsg = {
            id: msg.id, text: msg.text, sender_id: msg.sender_id,
            senderName: membersRef.current[msg.sender_id] || 'Usuario',
            created_at: msg.created_at, image_url: imageUrl,
            reply_to_id: msg.reply_to_id, read_by: msg.read_by || null,
          };
          // Reconcilia com a mensagem otimista do próprio envio (id sentinela
          // 'optimistic-'): substitui em vez de duplicar quando o echo chega.
          const optimisticIdx = prev.findIndex(m =>
            m.id.startsWith('optimistic-')
            && m.sender_id === msg.sender_id
            && (m.text === (msg.text || '') || (!!m.image_url && !!msg.image_url))
          );
          if (optimisticIdx !== -1) {
            const next = [...prev];
            next[optimisticIdx] = realMsg;
            return next;
          }
          return [...prev, realMsg];
        });
        // Mark as read — single-id call to /api/chat/read (Wave I).
        if (userId && msg.sender_id !== userId) {
          const { apiFetch } = await import('src/lib/api-fetch');
          apiFetch('/api/chat/read', { method: 'POST', body: { messageIds: [msg.id] } })
            .then(() => {}, () => {});
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        const updated = payload.new as any;
        const isGeralRoom = channelSlugRef.current === 'geral';
        const matchesActiveChannel =
          updated.channel_id === channelId
          || (isGeralRoom && updated.channel_id == null);
        if (!matchesActiveChannel) return;
        setMessages(prev => prev.map(m =>
          m.id === updated.id
            ? {
                ...m,
                text: updated.text,
                image_url: updated.image_url,
                read_by: updated.read_by || null,
              }
            : m
        ));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        const deleted = payload.old as any;
        const isGeralRoom = channelSlugRef.current === 'geral';
        const matchesActiveChannel =
          deleted.channel_id === channelId
          || (isGeralRoom && deleted.channel_id == null);
        if (!matchesActiveChannel) return;
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      });

    if (!subscribed) {
      subscribed = true;
      channel.subscribe();
    }

    return () => {
      subscribed = false;
      try { supabase.removeChannel(channel); } catch { /* non-fatal */ }
    };
  }, [channelId, userId, activeGroup]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const pickImage = useCallback(async (source: 'camera' | 'library') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { toast.show({ message: t('toasts.chat.permissionCamera'), variant: 'info' }); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, exif: false });
      if (!r.canceled && r.assets?.[0]) setPendingImage({ uri: r.assets[0].uri, mime: r.assets[0].mimeType || 'image/jpeg' });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show({ message: t('toasts.chat.permissionPhotos'), variant: 'info' }); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, exif: false });
      if (!r.canceled && r.assets?.[0]) setPendingImage({ uri: r.assets[0].uri, mime: r.assets[0].mimeType || 'image/jpeg' });
    }
  }, [t, toast]);

  const openAttachSheet = useCallback(() => {
    Alert.alert(t('chatThread.attachImageTitle'), t('chatThread.chooseSource'), [
      { text: t('editChild.photoCamera'), onPress: () => pickImage('camera') },
      { text: t('editChild.photoLibrary'), onPress: () => pickImage('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [pickImage, t]);

  // Tone moderator — debounced inline (mirrors PWA `ChatRoom.tsx:504-522`).
  // Schedules an `analyzeTone` 1500ms after the user stops typing; if the
  // text is aggressive, surfaces an inline suggestion banner with three
  // actions (use suggestion / send original / discard). The send button is
  // disabled while the suggestion is open — same UX as PWA.
  const handleTextChange = useCallback((text: string) => {
    setNewMessage(text);
    if (toneTimerRef.current) clearTimeout(toneTimerRef.current);
    if (!text.trim() || text.trim().length < 5) {
      setToneResult(null);
      setShowSuggestion(false);
      return;
    }
    toneTimerRef.current = setTimeout(async () => {
      const { analyzeTone } = await import('src/lib/tone-moderator');
      const result = analyzeTone(text);
      setToneResult({ isAggressive: result.isAggressive, suggestion: result.suggestion });
      setShowSuggestion(result.isAggressive);
    }, 1500);
  }, []);

  function acceptSuggestion() {
    if (toneResult?.suggestion) {
      setNewMessage(toneResult.suggestion);
      setShowSuggestion(false);
      setToneResult(null);
    }
  }

  function discardMessage() {
    setNewMessage('');
    setShowSuggestion(false);
    setToneResult(null);
  }

  // ── Message long-press actions (reply only) ────────────────────────────
  //
  // Reply: any message that is not your own and is not a system notification.
  // Edit / Delete: NOT exposed. The DB has `prevent_chat_text_update` and
  // `prevent_chat_delete` triggers (legal compliance) so showing those
  // options would always error out and confuse the user.
  const clearReply = useCallback(() => {
    Haptics.selectionAsync();
    setReplyTo(null);
  }, []);

  const beginReply = useCallback((m: Message) => {
    Haptics.selectionAsync();
    setNewMessage('');
    const snippet = (m.text || '[imagem]').slice(0, 80);
    setReplyTo({ id: m.id, text: snippet, senderName: m.senderName });
  }, []);

  const openMessageActions = useCallback((m: Message) => {
    if (isSystemMessage(m.text)) return; // system messages are not actionable
    const isOwn = m.sender_id === userId;

    // Compliance: chat messages are preserved by DB triggers
    // `prevent_chat_text_update` and `prevent_chat_delete`. We surface only
    // `Responder` for non-own messages — edit/delete would always fail at
    // the DB and confuse the user.
    if (isOwn) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('chatThread.reply'), t('common.cancel')],
          cancelButtonIndex: 1,
        },
        (idx) => {
          if (idx === 0) beginReply(m);
          else Haptics.selectionAsync();
        },
      );
    } else {
      Alert.alert(
        t('chatThread.messageActions'),
        undefined,
        [
          { text: t('chatThread.reply'), onPress: () => beginReply(m) },
          { text: t('common.cancel'), style: 'cancel', onPress: () => Haptics.selectionAsync() },
        ],
      );
    }
  }, [userId, beginReply, t]);

  const sendMessage = useCallback(async () => {
    const hasText = newMessage.trim().length > 0;
    if ((!hasText && !pendingImage) || !channelId || !userId || !activeGroup || sending) return;
    // Tone gate: PWA blocks the send when an aggressive suggestion is open.
    // The user must accept the suggestion, send original (button below), or
    // discard. The send button itself is disabled while showSuggestion holds.
    if (showSuggestion && toneResult?.isAggressive) return;

    const text = newMessage.trim();

    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const img = pendingImage;
    const reply = replyTo;
    setNewMessage('');
    setPendingImage(null);
    setReplyTo(null);
    setShowSuggestion(false);
    setToneResult(null);

    // Insert otimista — a mensagem aparece na hora, sem depender do echo do
    // realtime (que no Android/rede instável muitas vezes não chega no próprio
    // envio → a msg só surgia ao sair e voltar da tela). O handler de INSERT
    // reconcilia (substitui pelo row real) e o dedupe por id evita duplicata.
    // Espelha o padrão do PWA (ChatRoom.tsx). Bug oferret2008 2026-06-03.
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optimisticId,
      text: text || '',
      sender_id: userId,
      senderName: membersRef.current[userId] || '',
      created_at: new Date().toISOString(),
      image_url: img ? img.uri : null,
      reply_to_id: reply?.id ?? null,
      read_by: null,
    }]);

    let imageUrl: string | null = null;
    if (img) {
      imageUrl = await uploadChatImage(img.uri, img.mime, activeGroup.groupId);
      if (!imageUrl) {
        toast.show({ message: t('toasts.chat.imageUploadFailed'), variant: 'error' });
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        setNewMessage(text);
        setPendingImage(img);
        setReplyTo(reply);
        setSending(false);
        return;
      }
    }

    const result = await safeWrite({
      table: 'chat_messages',
      operation: 'insert',
      payload: {
        group_id: activeGroup.groupId, channel_id: channelId, sender_id: userId,
        text: text || null, image_url: imageUrl,
        reply_to_id: reply?.id ?? null,
      },
    });

    if (result.success && !result.queued) {
      notifyAction('chat_message_sent', activeGroup.groupId, { text: text || '[imagem]' });
    } else if (!result.success && !result.queued) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setNewMessage(text);
      setPendingImage(img);
      setReplyTo(reply);
    }

    setSending(false);
  }, [newMessage, pendingImage, channelId, userId, activeGroup, sending, showSuggestion, toneResult, replyTo, t, toast]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Export-to-PDF (mirrors PWA `src/app/api/chat/export/route.ts`).
  //
  // Differences vs. PWA: the PWA generates a server-side PDF with `pdf-lib`
  // and triggers a browser download. On native we cannot run pdf-lib reliably
  // (heavy fontkit polyfills) and there's no download dialog — so we render
  // an HTML representation, hand it to `expo-print` for OS-level PDF
  // rasterization, then `expo-sharing` opens the native share sheet so the
  // user can save to Files / AirDrop / mail it.
  //
  // Image attachments are inlined as `[imagem]` placeholders to match the
  // PWA's "[Imagem anexada]" simple-text fallback (full image inlining would
  // require fetching+base64 each blob — out of scope for first pass).
  const handleExport = useCallback(async () => {
    if (!activeGroup || exporting) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Group + channel labels for header
      const [{ data: group }, { data: chRow }] = await Promise.all([
        supabase
          .from('coparenting_groups')
          .select('name')
          .eq('id', activeGroup.groupId)
          .single(),
        selectedChannelId
          ? supabase
              .from('chat_channels')
              .select('name, slug')
              .eq('id', selectedChannelId)
              .single()
          : Promise.resolve({ data: null as { name: string; slug: string } | null }),
      ]);

      // 2. Member name map (we already have one in `membersRef`, but this
      //    runs in the modal flow which may run from a freshly-mounted
      //    screen — re-fetch to be safe).
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, profiles(full_name, display_name, email)')
        .eq('group_id', activeGroup.groupId);
      const memberMap: Record<string, string> = {};
      const memberList: string[] = [];
      (members || []).forEach((m: any) => {
        const p = m.profiles || {};
        // Lista compacta pra cabeçalho/seletor de membros — firstOnly
        const name =
          p.display_name
          || getDisplayName(p.full_name, true)
          || (p.email ? p.email.split('@')[0].split('.')[0] : 'Usuário');
        memberMap[m.user_id] = name;
        memberList.push(name);
      });

      // 3. Build messages query — group + (optional) channel + (optional) month
      let query = supabase
        .from('chat_messages')
        .select('id, sender_id, text, image_url, created_at')
        .eq('group_id', activeGroup.groupId)
        .order('created_at', { ascending: true });

      if (selectedChannelId) {
        // Geral channel includes legacy null channel_id rows (parity with PWA route).
        if (chRow?.slug === 'geral') {
          query = query.or(`channel_id.eq.${selectedChannelId},channel_id.is.null`);
        } else {
          query = query.eq('channel_id', selectedChannelId);
        }
      }

      let dateRangeLabel = 'Todas as mensagens';
      if (selectedMonth) {
        const [y, mon] = selectedMonth.split('-').map(Number);
        const startDate = new Date(y, mon - 1, 1);
        const endDate = new Date(y, mon, 1);
        query = query
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString());
        dateRangeLabel = `${MONTH_NAMES_PT[mon - 1]} de ${y}`;
      }

      const { data: msgs, error: msgErr } = await query;
      if (msgErr) {
        toast.show({ message: t('toasts.chat.loadMessagesFailed'), variant: 'error' });
        setExporting(false);
        return;
      }

      // 4. Build HTML (Kindar brand styling, monospace dates, bold senders,
      //    muted system messages — matches PWA visual hierarchy).
      const exportDate = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const channelLabel = chRow?.name || '';

      const messagesHtml = (msgs || []).length === 0
        ? `<p class="empty">Nenhuma mensagem neste período.</p>`
        : (msgs || []).map((m: any) => {
            const senderName = memberMap[m.sender_id] || 'Sistema';
            const isSystem = !memberMap[m.sender_id];
            let body = '';
            if (m.image_url && m.text) body = `[imagem] ${m.text}`;
            else if (m.image_url) body = '[imagem]';
            else if (m.text) body = m.text.startsWith('[Audio') ? '[Áudio]' : m.text;
            else body = '[Mensagem sem conteúdo]';
            const ts = formatDateBR(m.created_at);
            const cls = isSystem ? 'msg system' : 'msg';
            return `<div class="${cls}">
              <span class="ts">[${escapeHtml(ts)}]</span>
              <span class="sender">${escapeHtml(senderName)}:</span>
              <span class="body">${escapeHtml(body)}</span>
            </div>`;
          }).join('\n');

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Kindar — Registro de Conversas</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2c2c2c; font-size: 11pt; line-height: 1.5; }
  .header { border-bottom: 1px solid #d4d4d4; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 18pt; font-weight: 700; color: #5B9E85; margin: 0 0 6px; }
  .meta { color: #555; font-size: 10pt; margin: 2px 0; }
  .meta strong { color: #2c2c2c; }
  .exported { color: #888; font-size: 9pt; margin-top: 6px; }
  .msg { margin-bottom: 6px; page-break-inside: avoid; }
  .msg .ts { font-family: 'Courier New', Courier, monospace; color: #777; font-size: 9pt; margin-right: 4px; }
  .msg .sender { font-weight: 700; color: #2c2c2c; margin-right: 4px; }
  .msg .body { color: #2c2c2c; }
  .msg.system .sender, .msg.system .body { color: #888; font-style: italic; }
  .empty { color: #888; font-style: italic; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Kindar — Registro de Conversas</div>
    <div class="meta"><strong>Grupo:</strong> ${escapeHtml(group?.name || 'Grupo')}</div>
    ${channelLabel ? `<div class="meta"><strong>Canal:</strong> ${escapeHtml(channelLabel)}</div>` : ''}
    <div class="meta"><strong>Período:</strong> ${escapeHtml(dateRangeLabel)}</div>
    <div class="meta"><strong>Membros:</strong> ${escapeHtml(memberList.join(', '))}</div>
    <div class="exported">Exportado em: ${escapeHtml(exportDate)}</div>
  </div>
  ${messagesHtml}
</body>
</html>`;

      // 5. Generate PDF + share
      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        toast.show({ message: t('toasts.chat.exportSuccess'), variant: 'success' });
        setExporting(false);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('chat.exportConversations'),
        UTI: 'com.adobe.pdf',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowExportModal(false);
      setSelectedMonth('');
      setSelectedChannelId('');
    } catch (err) {
      console.error('[chat-export]', err);
      toast.show({ message: t('toasts.chat.exportFailed'), variant: 'error' });
    } finally {
      setExporting(false);
    }
  }, [activeGroup, exporting, selectedChannelId, selectedMonth, t, toast]);

  // Message list with date separators + system message cards
  // Note: `items` is the message list with `kind: 'date' | 'system' | 'message'` markers
  const messageItems = useCallback(() => {
    const items: Array<{ kind: 'date'; key: string; label: string } | { kind: 'system'; msg: Message } | { kind: 'message'; msg: Message }> = [];
    let prevDay = '';
    const todayKey = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    for (const m of messages) {
      const dayKey = m.created_at.slice(0, 10);
      if (dayKey !== prevDay) {
        const d = new Date(m.created_at);
        let label: string;
        if (dayKey === todayKey) label = t('dashboard.today');
        else if (dayKey === yesterdayKey) label = t('chatTab.yesterday');
        else label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
        items.push({ kind: 'date', key: `date-${dayKey}`, label });
        prevDay = dayKey;
      }
      if (isSystemMessage(m.text) && m.sender_id !== userId) {
        items.push({ kind: 'system', msg: m });
      } else {
        items.push({ kind: 'message', msg: m });
      }
    }
    return items;
  }, [messages, userId, t]);

  const renderItem = useCallback(({ item }: { item: ReturnType<typeof messageItems>[number] }) => {
    if (item.kind === 'date') {
      return (
        <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
          <View style={{
            backgroundColor: colors.bgSurface, paddingHorizontal: spacing.md, paddingVertical: 4,
            borderRadius: radius.full,
          }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: font.weights.medium }}>
              {item.label}
            </Text>
          </View>
        </View>
      );
    }

    if (item.kind === 'system') {
      const m = item.msg;
      return (
        <View style={{ alignItems: 'center', marginVertical: 6, paddingHorizontal: spacing.lg }}>
          <View style={{
            maxWidth: '85%',
            backgroundColor: colors.bgElevated, borderRadius: radius.lg,
            paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm,
          }}>
            {!m.sender_id.includes(userId || '---') ? (
              <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 2 }}>
                {m.senderName}
              </Text>
            ) : null}
            <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>
              {m.text}
            </Text>
            <Text style={{ fontSize: 9, color: colors.textDim, marginTop: 4 }}>
              {formatTime(m.created_at)}
            </Text>
          </View>
        </View>
      );
    }

    const m = item.msg;
    const isMe = m.sender_id === userId;
    const hasImage = !!m.image_url;
    const hasText = !!m.text?.trim();
    // Read status — count how many OTHER members have read_by[their_id]
    const readersCount = m.read_by ? Object.keys(m.read_by).filter(u => u !== userId).length : 0;
    const wasRead = isMe && readersCount > 0;

    // Resolve quoted reply (if this message is a reply, find the original).
    let quoted: Message | null = null;
    if (m.reply_to_id) {
      quoted = messages.find(x => x.id === m.reply_to_id) || null;
    }

    return (
      <View style={{
        alignItems: isMe ? 'flex-end' : 'flex-start',
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}>
        {!isMe ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2, marginLeft: spacing.xs }}>
            {m.senderName}
          </Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => openMessageActions(m)}
          delayLongPress={350}
          testID={`chat-message-${m.id}`}
          accessibilityLabel={t('chatThread.messageFrom', { senderName: m.senderName })}
          style={{
            maxWidth: '78%',
            backgroundColor: isMe ? colors.brand : colors.bgElevated,
            borderRadius: radius.lg,
            borderTopRightRadius: isMe ? 4 : radius.lg,
            borderTopLeftRadius: isMe ? radius.lg : 4,
            padding: hasImage && !hasText ? 4 : spacing.md,
            ...(!isMe ? shadows.sm : {}),
          }}
        >
          {/* Quoted reply preview (when this message replies to another) */}
          {quoted ? (
            <View style={{
              borderLeftWidth: 3,
              borderLeftColor: isMe ? 'rgba(255,255,255,0.55)' : colors.brand,
              backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : colors.bgSurface,
              borderRadius: radius.sm,
              paddingVertical: 4,
              paddingHorizontal: 8,
              marginBottom: 6,
            }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  fontWeight: font.weights.semibold,
                  color: isMe ? 'rgba(255,255,255,0.85)' : colors.brand,
                }}
              >
                {quoted.senderName}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 12,
                  color: isMe ? 'rgba(255,255,255,0.78)' : colors.textSecondary,
                  marginTop: 1,
                }}
              >
                {(quoted.text || '[imagem]').slice(0, 120)}
              </Text>
            </View>
          ) : null}
          {hasImage ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => m.image_url && setPreviewUrl(m.image_url)}
              style={{ borderRadius: radius.md, overflow: 'hidden', marginBottom: hasText ? spacing.xs : 0 }}
            >
              <Image
                source={{ uri: m.image_url! }}
                style={{ width: 220, height: 220, backgroundColor: 'rgba(0,0,0,0.06)' }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : null}
          {hasText ? (
            <Text style={{
              fontSize: font.sizes.md,
              color: isMe ? '#fff' : colors.text,
              lineHeight: 20,
            }}>
              {m.text}
            </Text>
          ) : null}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            justifyContent: 'flex-end',
            marginTop: 4,
            marginRight: hasImage && !hasText ? 8 : 0,
            marginBottom: hasImage && !hasText ? 4 : 0,
          }}>
            <Text style={{ fontSize: 9, color: isMe ? 'rgba(255,255,255,0.6)' : colors.textDim }}>
              {formatTime(m.created_at)}
            </Text>
            {isMe ? (
              <Ionicons
                name={wasRead ? 'checkmark-done' : 'checkmark'}
                size={12}
                color={wasRead ? '#9ee4c9' : 'rgba(255,255,255,0.7)'}
              />
            ) : null}
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [userId, messages, openMessageActions, t]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {channelName === 'Geral' || channelName === 'geral' ? t('chat.groupChat') : channelName}
            </Text>
            {memberCount > 0 ? (
              <View style={{
                backgroundColor: colors.bgSurface, paddingHorizontal: spacing.sm, paddingVertical: 2,
                borderRadius: radius.full,
              }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: font.weights.medium }}>
                  {memberCount === 1 ? t('chatThread.memberCountOne', { count: memberCount }) : t('chatThread.memberCount', { count: memberCount })}
                </Text>
              </View>
            ) : null}
          </View>
          {/* Export-to-PDF trigger — mirrors PWA `ChatRoom.tsx:769-779`. */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Default to current channel; user can switch to "Todos" or
              // pick another channel inside the modal.
              setSelectedChannelId(channelId || '');
              setShowExportModal(true);
            }}
            hitSlop={8}
            testID="chat-export-open"
            accessibilityLabel={t('chatThread.exportMessages')}
            style={{
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.bgSurface,
            }}
          >
            <Ionicons name="download-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Channel tabs pills */}
        {channels.length > 1 ? (
          <FlatList
            horizontal
            data={channels}
            keyExtractor={c => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm, paddingRight: spacing.lg }}
            renderItem={({ item: c, index: pillIndex }) => {
              const active = c.id === channelId;
              const childLetter = c.child_name?.charAt(0).toUpperCase() || '';
              const displayLabel = c.channel_type === 'child' && c.child_name ? c.child_name : c.name;
              const unread = unreadByChannel[c.id] || 0;
              return (
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace(`/chat/${c.id}`); }}
                  testID={`chat-pill-${pillIndex}`}
                  accessibilityLabel={t('chatThread.channelLabelA11y', { name: displayLabel })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: spacing.md, paddingVertical: 6,
                    borderRadius: radius.full,
                    backgroundColor: active ? colors.brand : colors.bgSurface,
                  }}
                >
                  {c.channel_type === 'child' && childLetter ? (
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.brandLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: active ? '#fff' : colors.brand }}>
                        {childLetter}
                      </Text>
                    </View>
                  ) : c.icon ? (
                    <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                  ) : (
                    <Ionicons name="chatbubble-ellipses" size={12} color={active ? '#fff' : colors.textSecondary} />
                  )}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: active ? font.weights.semibold : font.weights.medium,
                    color: active ? '#fff' : colors.text,
                  }}>
                    {displayLabel}
                  </Text>
                  {!active && unread > 0 ? (
                    <View style={{
                      minWidth: 18, height: 18, borderRadius: 9,
                      backgroundColor: colors.brand,
                      alignItems: 'center', justifyContent: 'center',
                      paddingHorizontal: 5,
                    }}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: font.weights.bold }}>
                        {unread > 99 ? '99+' : unread}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        ) : null}
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messageItems()}
          renderItem={renderItem}
          keyExtractor={it => it.kind === 'date' ? it.key : it.msg.id}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Tone moderator suggestion (mirrors PWA `ChatRoom.tsx:879-922`) */}
      {showSuggestion && toneResult?.isAggressive && toneResult.suggestion ? (
        <View style={{
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
          backgroundColor: '#fff8e6',
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: '#fbe19c',
          padding: spacing.md,
        }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: '#8a5a00' }}>
                {t('chatThread.reformulateTitle')}
              </Text>
              <Text style={{ fontSize: 11, color: '#a37a3a', marginTop: 2 }}>
                {t('chatThread.aiMediatorHint')}
              </Text>
            </View>
          </View>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: '#fde9b9',
            padding: spacing.sm,
            marginBottom: spacing.sm,
          }}>
            <Text style={{ fontSize: font.sizes.sm, fontStyle: 'italic', color: colors.text, lineHeight: 20 }}>
              {`"${toneResult.suggestion}"`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <TouchableOpacity
              onPress={acceptSuggestion}
              style={{
                flex: 1, minWidth: 120,
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: 10, paddingHorizontal: spacing.md,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                {t('chat.useSuggestion')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setShowSuggestion(false); sendMessage(); }}
              style={{
                flex: 1, minWidth: 120,
                backgroundColor: colors.bgSurface, borderRadius: radius.md,
                paddingVertical: 10, paddingHorizontal: spacing.md,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                {t('chat.sendOriginal')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={discardMessage}
              style={{
                paddingVertical: 10, paddingHorizontal: spacing.md,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
                {t('chat.discard')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Reply preview — shown when responding to another message */}
      {replyTo ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          backgroundColor: colors.bgElevated,
          borderTopWidth: 0.5, borderTopColor: colors.borderLight,
        }}>
          <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.brand, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: colors.brand, fontWeight: font.weights.semibold }} numberOfLines={1}>
              {t('chatThread.replyingTo', { name: replyTo.senderName })}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={clearReply} hitSlop={8} testID="chat-reply-clear" accessibilityLabel={t('chatThread.cancelReply')}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Pending image preview */}
      {pendingImage ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          padding: spacing.sm, backgroundColor: colors.bgElevated,
          borderTopWidth: 0.5, borderTopColor: colors.borderLight,
        }}>
          <Image source={{ uri: pendingImage.uri }} style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.bgSurface }} />
          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.textSecondary }}>{t('chatThread.imageReadyToSend')}</Text>
          <TouchableOpacity onPress={() => setPendingImage(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Input */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom + spacing.sm,
        backgroundColor: colors.bgElevated,
        borderTopWidth: 0.5,
        borderTopColor: colors.borderLight,
        gap: spacing.sm,
      }}>
        <TouchableOpacity
          onPress={openAttachSheet}
          disabled={sending}
          hitSlop={6}
          testID="chat-attach"
          accessibilityLabel={t('chatThread.attachImageTitle')}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.bgSurface,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          <Ionicons name="attach" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{
          flex: 1,
          backgroundColor: colors.bgSurface,
          borderRadius: radius.xl,
          paddingHorizontal: spacing.lg,
          paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
          maxHeight: 100,
        }}>
          <TextInput
            value={newMessage}
            onChangeText={handleTextChange}
            placeholder={t('chatThread.messagePlaceholder')}
            placeholderTextColor={colors.textDim}
            multiline
            testID="chat-input"
            accessibilityLabel={t('chatThread.messageActions')}
            style={{
              fontSize: font.sizes.md,
              color: colors.text,
              maxHeight: 80,
            }}
          />
        </View>
        <TouchableOpacity
          onPress={sendMessage}
          disabled={
            (!newMessage.trim() && !pendingImage)
            || sending
            || (showSuggestion && !!toneResult?.isAggressive)
          }
          testID="chat-send"
          accessibilityLabel={t('chatThread.sendMessage')}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: (newMessage.trim() || pendingImage) && !(showSuggestion && toneResult?.isAggressive)
              ? colors.brand
              : colors.borderLight,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons
                name="send"
                size={18}
                color={(newMessage.trim() || pendingImage) && !(showSuggestion && toneResult?.isAggressive)
                  ? '#fff'
                  : colors.textDim}
              />}
        </TouchableOpacity>
      </View>

      {/* Export-to-PDF modal — mirrors PWA `ChatRoom.tsx:780-816`.
          Channel pick + month pick + Exportar. The modal slides in from the
          bottom, matching the rest of the native app's modal language. */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="slide"
        onRequestClose={() => !exporting && setShowExportModal(false)}
      >
        <ModalBackdrop
          onClose={() => setShowExportModal(false)}
          align="bottom"
          dim={0.45}
          padding={0}
          tapToClose={!exporting}
        >
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: insets.bottom + spacing.lg,
              ...shadows.lg,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight }} />
            </View>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: 4 }}>
              {t('chat.exportConversations')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.lg }}>
              {t('chatThread.exportPdfDescription')}
            </Text>

            {/* Channel picker — horizontal scroll of pills */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>
              {t('chatThread.channel')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md, paddingRight: spacing.lg }}
            >
              {[{ id: '', name: t('chatThread.allChannels') } as { id: string; name: string }, ...channels].map((c) => {
                const active = c.id === selectedChannelId;
                return (
                  <TouchableOpacity
                    key={c.id || 'all'}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedChannelId(c.id);
                    }}
                    accessibilityLabel={t('chatThread.channelLabelA11y', { name: c.name })}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: 8,
                      borderRadius: radius.full,
                      backgroundColor: active ? colors.brand : colors.bgSurface,
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: active ? font.weights.semibold : font.weights.medium,
                      color: active ? '#fff' : colors.text,
                    }}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Month picker — vertical scroll list of months (cap at ~200pt) */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>
              {t('health.period')}
            </Text>
            <ScrollView
              style={{ maxHeight: 220, marginBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
            >
              {[{ value: '', label: t('chat.allMessages') }, ...generateMonthOptions()].map((opt) => {
                const active = opt.value === selectedMonth;
                return (
                  <TouchableOpacity
                    key={opt.value || 'all-months'}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedMonth(opt.value);
                    }}
                    testID={opt.value ? `chat-export-month-${opt.value}` : 'chat-export-month-all'}
                    accessibilityLabel={t('chatThread.periodLabelA11y', { label: opt.label })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingHorizontal: spacing.md, paddingVertical: 12,
                      borderRadius: radius.md,
                      backgroundColor: active ? colors.brandLight : 'transparent',
                      marginBottom: 2,
                    }}
                  >
                    <Text style={{
                      fontSize: font.sizes.md,
                      color: active ? colors.brand : colors.text,
                      fontWeight: active ? font.weights.semibold : font.weights.normal,
                    }}>
                      {opt.label}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={colors.brand} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Action row */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                onPress={() => !exporting && setShowExportModal(false)}
                disabled={exporting}
                accessibilityLabel={t('chatThread.cancelExport')}
                style={{
                  flex: 1,
                  backgroundColor: colors.bgSurface,
                  borderRadius: radius.lg,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: exporting ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleExport}
                disabled={exporting}
                testID="chat-export-submit"
                accessibilityLabel={t('health.exportPdf')}
                style={{
                  flex: 2,
                  backgroundColor: colors.brand,
                  borderRadius: radius.lg,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                {exporting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="download-outline" size={18} color="#fff" />
                )}
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                  {exporting ? t('chatThread.generating') : t('health.exportPdf')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Image preview modal (tap-to-zoom) */}
      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <Pressable
          onPress={() => setPreviewUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
        >
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={{ width: '96%', height: '80%' }} resizeMode="contain" />
          ) : null}
          <TouchableOpacity
            onPress={() => setPreviewUrl(null)}
            style={{ position: 'absolute', top: insets.top + 12, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
