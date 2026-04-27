/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/alt-text */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Alert,
  ActionSheetIOS,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

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
  edited_at?: string | null;
}

interface ReplyTarget {
  id: string;
  text: string;
  senderName: string;
}

// Edit window — own messages can be edited within this many ms of creation.
// Note: the DB has a `prevent_chat_text_update` trigger; UPDATEs on `text`
// will fail with a constraint error. We surface that error to the user.
const EDIT_WINDOW_MS = 15 * 60 * 1000;

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
  // Reply / edit state — drives the preview bar above the input + send button mode.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Tone moderator — debounced inline (mirrors PWA `ChatRoom.tsx:504-522`)
  const [toneResult, setToneResult] = useState<{ isAggressive: boolean; suggestion: string | null } | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const toneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const membersRef = useRef<Record<string, string>>({});

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
      // Channel name + all channels for tabs + member count in one shot
      const [{ data: ch }, { data: allCh }, { data: members }] = await Promise.all([
        supabase.from('chat_channels').select('name').eq('id', channelId).single(),
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
      setChannels((allCh || []).map((c: any) => ({
        id: c.id, name: c.name, icon: c.icon,
        channel_type: c.channel_type,
        child_name: c.children?.full_name?.split(' ')[0] || null,
      })));
      setMemberCount((members || []).length);

      const memberMap: Record<string, string> = {};
      (members || []).forEach((m: any) => {
        const p = m.profiles || {};
        memberMap[m.user_id] = p.display_name
          || getDisplayName(p.full_name)
          || (p.email ? p.email.split('@')[0].split('.')[0] : 'Usuario');
      });
      membersRef.current = memberMap;

      // Messages
      // Note: `edited_at` is requested defensively — the column doesn't exist
      // in the current schema, but selecting it conditionally would require a
      // probe query. Supabase will return null for unknown columns? It actually
      // errors. So we keep it OUT of the explicit select and just rely on the
      // type having edited_at as optional (always undefined for now).
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('id, text, sender_id, created_at, image_url, reply_to_id, read_by')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (loadIdRef.current !== myLoadId) return; // stale fetch

      // image_url is path-only after migration 062 — sign in parallel.
      const { getSignedFileUrl } = await import('../../src/services/storage');
      const signed = await Promise.all((msgs || []).map(async (m: any) => ({
        ...m,
        image_url: m.image_url
          ? (await getSignedFileUrl('documents', m.image_url, 3600)) || m.image_url
          : null,
        senderName: memberMap[m.sender_id] || 'Usuario',
      })));
      if (loadIdRef.current !== myLoadId) return; // stale signed-URL batch
      setMessages(signed);

      // Mark unread messages as read (same pattern as PWA ChatRoom)
      if (userId && msgs && msgs.length > 0) {
        const unread = msgs.filter((m: any) => m.sender_id !== userId && (!m.read_by || !(m.read_by as Record<string, unknown>)[userId]));
        const now = new Date().toISOString();
        for (const msg of unread.slice(-20)) {
          supabase.from('chat_messages')
            .update({ read_by: { ...(msg.read_by || {}), [userId]: now } })
            .eq('id', msg.id)
            .then(() => {}, () => {});
        }
      }

      setLoading(false);
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

    const channel = supabase
      .channel(`chat:${groupId}:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const msg = payload.new as any;

        // Active channel? If yes, append to the visible thread. Otherwise
        // bump the per-channel unread count so the pill bar shows the dot.
        if (msg.channel_id !== channelId) {
          if (userId && msg.sender_id !== userId) {
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
            const { getSignedFileUrl } = await import('../../src/services/storage');
            imageUrl = (await getSignedFileUrl('documents', msg.image_url, 3600)) || msg.image_url;
          }
        }
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id, text: msg.text, sender_id: msg.sender_id,
            senderName: membersRef.current[msg.sender_id] || 'Usuario',
            created_at: msg.created_at, image_url: imageUrl,
            reply_to_id: msg.reply_to_id, read_by: msg.read_by || null,
          }];
        });
        // Mark as read
        if (userId && msg.sender_id !== userId) {
          const now = new Date().toISOString();
          supabase.from('chat_messages')
            .update({ read_by: { ...(msg.read_by || {}), [userId]: now } })
            .eq('id', msg.id).then(() => {}, () => {});
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.channel_id !== channelId) return;
        setMessages(prev => prev.map(m =>
          m.id === updated.id
            ? {
                ...m,
                text: updated.text,
                image_url: updated.image_url,
                read_by: updated.read_by || null,
                edited_at: updated.edited_at ?? m.edited_at ?? null,
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
        if (deleted.channel_id !== channelId) return;
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
      if (!perm.granted) { Alert.alert('Permissao necessaria', 'Precisamos da camera'); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, exif: false });
      if (!r.canceled && r.assets?.[0]) setPendingImage({ uri: r.assets[0].uri, mime: r.assets[0].mimeType || 'image/jpeg' });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permissao necessaria', 'Precisamos acesso as fotos'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, exif: false });
      if (!r.canceled && r.assets?.[0]) setPendingImage({ uri: r.assets[0].uri, mime: r.assets[0].mimeType || 'image/jpeg' });
    }
  }, []);

  const openAttachSheet = useCallback(() => {
    Alert.alert('Anexar imagem', 'Escolha a origem', [
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Galeria', onPress: () => pickImage('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [pickImage]);

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
      const { analyzeTone } = await import('../../src/lib/tone-moderator');
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

  // ── Message long-press actions (reply / edit / delete) ──────────────────
  //
  // Reply: any message that is not your own and is not a system notification.
  // Edit:  your own messages within EDIT_WINDOW_MS (15 min). Note the DB has
  //        a `prevent_chat_text_update` trigger — UPDATEs on `text` are
  //        rejected for legal-compliance. We attempt the update and surface
  //        the error to the user.
  // Delete: your own messages. Similarly blocked by `prevent_chat_delete`
  //         trigger; we surface the error.
  const cancelEdit = useCallback(() => {
    Haptics.selectionAsync();
    setEditingId(null);
    setNewMessage('');
  }, []);

  const clearReply = useCallback(() => {
    Haptics.selectionAsync();
    setReplyTo(null);
  }, []);

  const performDelete = useCallback(async (msgId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const { error } = await supabase.from('chat_messages').delete().eq('id', msgId);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Não foi possível apagar', error.message || 'Mensagens do chat são preservadas por motivos legais.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }, []);

  const beginEdit = useCallback((m: Message) => {
    Haptics.selectionAsync();
    // Cancel any in-flight reply when entering edit mode
    setReplyTo(null);
    setEditingId(m.id);
    setNewMessage(m.text || '');
  }, []);

  const beginReply = useCallback((m: Message) => {
    Haptics.selectionAsync();
    // Exit edit mode when starting a reply
    setEditingId(null);
    setNewMessage('');
    const snippet = (m.text || '[imagem]').slice(0, 80);
    setReplyTo({ id: m.id, text: snippet, senderName: m.senderName });
  }, []);

  const openMessageActions = useCallback((m: Message) => {
    if (isSystemMessage(m.text)) return; // system messages are not actionable
    const isOwn = m.sender_id === userId;
    const createdMs = new Date(m.created_at).getTime();
    const canEdit = isOwn && Date.now() - createdMs < EDIT_WINDOW_MS;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Build option list dynamically based on permissions.
    type Action = 'reply' | 'edit' | 'delete';
    const options: { label: string; action: Action }[] = [];
    if (!isOwn) options.push({ label: 'Responder', action: 'reply' });
    if (canEdit) options.push({ label: 'Editar', action: 'edit' });
    if (isOwn) options.push({ label: 'Apagar', action: 'delete' });
    if (options.length === 0) return;

    const dispatch = (action: Action | undefined) => {
      if (!action) return;
      if (action === 'reply') beginReply(m);
      else if (action === 'edit') beginEdit(m);
      else if (action === 'delete') {
        Alert.alert(
          'Apagar mensagem',
          'Tem certeza? Esta ação não pode ser desfeita.',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => Haptics.selectionAsync() },
            { text: 'Apagar', style: 'destructive', onPress: () => performDelete(m.id) },
          ],
        );
      }
    };

    if (Platform.OS === 'ios') {
      const labels = [...options.map(o => o.label), 'Cancelar'];
      const cancelButtonIndex = labels.length - 1;
      const destructiveIndex = options.findIndex(o => o.action === 'delete');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (idx) => {
          if (idx === cancelButtonIndex) { Haptics.selectionAsync(); return; }
          dispatch(options[idx]?.action);
        },
      );
    } else {
      // Android: Alert.alert with action buttons.
      Alert.alert(
        'Mensagem',
        undefined,
        [
          ...options.map(o => ({
            text: o.label,
            style: (o.action === 'delete' ? 'destructive' : 'default') as 'destructive' | 'default',
            onPress: () => dispatch(o.action),
          })),
          { text: 'Cancelar', style: 'cancel' as const, onPress: () => Haptics.selectionAsync() },
        ],
      );
    }
  }, [userId, beginEdit, beginReply, performDelete]);

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

    // ── EDIT path ────────────────────────────────────────────────────────
    // When `editingId` is set, dispatch an UPDATE instead of an INSERT. The
    // DB has a `prevent_chat_text_update` trigger that rejects text changes
    // for legal-compliance — we surface that error to the user.
    if (editingId) {
      const msgId = editingId;
      const updatePayload: Record<string, unknown> = { text: text || null };
      // `edited_at` only attached if the column exists. We try optimistically;
      // the DB will ignore unknown columns? No, it errors. Skip it.
      const { error } = await supabase.from('chat_messages').update(updatePayload).eq('id', msgId);
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Não foi possível editar', error.message || 'Mensagens do chat não podem ser modificadas por motivos legais.');
        setSending(false);
        return;
      }
      // Optimistic local update
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, edited_at: new Date().toISOString() } : m));
      setEditingId(null);
      setNewMessage('');
      setSending(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const img = pendingImage;
    const reply = replyTo;
    setNewMessage('');
    setPendingImage(null);
    setReplyTo(null);
    setShowSuggestion(false);
    setToneResult(null);

    let imageUrl: string | null = null;
    if (img) {
      imageUrl = await uploadChatImage(img.uri, img.mime, activeGroup.groupId);
      if (!imageUrl) {
        Alert.alert('Erro', 'Não foi possível enviar a imagem');
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
      setNewMessage(text);
      setPendingImage(img);
      setReplyTo(reply);
    }

    setSending(false);
  }, [newMessage, pendingImage, channelId, userId, activeGroup, sending, showSuggestion, toneResult, editingId, replyTo]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

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
        if (dayKey === todayKey) label = 'Hoje';
        else if (dayKey === yesterdayKey) label = 'Ontem';
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
  }, [messages, userId]);

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
    const wasEdited = !!m.edited_at;

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
          accessibilityLabel={`Mensagem de ${m.senderName}`}
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
            {wasEdited ? (
              <Text style={{
                fontSize: 9,
                fontStyle: 'italic',
                color: isMe ? 'rgba(255,255,255,0.6)' : colors.textDim,
                marginRight: 2,
              }}>
                (editado)
              </Text>
            ) : null}
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
  }, [userId, messages, openMessageActions]);

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
              {channelName === 'Geral' || channelName === 'geral' ? 'Chat do grupo' : channelName}
            </Text>
            {memberCount > 0 ? (
              <View style={{
                backgroundColor: colors.bgSurface, paddingHorizontal: spacing.sm, paddingVertical: 2,
                borderRadius: radius.full,
              }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: font.weights.medium }}>
                  {memberCount} membro{memberCount !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null}
          </View>
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
                  accessibilityLabel={`Canal ${displayLabel}`}
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
                Que tal reformular?
              </Text>
              <Text style={{ fontSize: 11, color: '#a37a3a', marginTop: 2 }}>
                Sugestão da IA mediadora — você decide
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
                Usar sugestão
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
                Enviar original
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
                Descartar
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
              Respondendo a {replyTo.senderName}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={clearReply} hitSlop={8} testID="chat-reply-clear" accessibilityLabel="Cancelar resposta">
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Edit-mode banner — shown when modifying an existing message */}
      {editingId ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          backgroundColor: colors.bgElevated,
          borderTopWidth: 0.5, borderTopColor: colors.borderLight,
        }}>
          <Ionicons name="pencil" size={16} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: colors.brand, fontWeight: font.weights.semibold }} numberOfLines={1}>
              Editando mensagem
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
              Confirme com o botão para salvar
            </Text>
          </View>
          <TouchableOpacity onPress={cancelEdit} hitSlop={8} testID="chat-edit-cancel" accessibilityLabel="Cancelar edição">
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
          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.textSecondary }}>Imagem pronta para enviar</Text>
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
          accessibilityLabel="Anexar imagem"
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
            placeholder="Mensagem..."
            placeholderTextColor={colors.textDim}
            multiline
            testID="chat-input"
            accessibilityLabel="Mensagem"
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
          accessibilityLabel={editingId ? 'Salvar edição' : 'Enviar mensagem'}
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
                name={editingId ? 'checkmark' : 'send'}
                size={editingId ? 22 : 18}
                color={(newMessage.trim() || pendingImage) && !(showSuggestion && toneResult?.isAggressive)
                  ? '#fff'
                  : colors.textDim}
              />}
        </TouchableOpacity>
      </View>

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
