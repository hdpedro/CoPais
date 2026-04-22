/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/alt-text */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Alert,
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
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    return data.publicUrl;
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
  const [memberCount, setMemberCount] = useState(0);
  const [pendingImage, setPendingImage] = useState<{ uri: string; mime: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const membersRef = useRef<Record<string, string>>({});

  // Load channel info + members + messages
  useEffect(() => {
    if (!channelId || !activeGroup) return;

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
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('id, text, sender_id, created_at, image_url, reply_to_id, read_by')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);

      setMessages((msgs || []).map((m: any) => ({
        ...m,
        senderName: memberMap[m.sender_id] || 'Usuario',
      })));

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

  // Real-time subscription
  useEffect(() => {
    if (!channelId) return;

    const channel = supabase
      .channel(`chat:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        const msg = payload.new as any;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id, text: msg.text, sender_id: msg.sender_id,
            senderName: membersRef.current[msg.sender_id] || 'Usuario',
            created_at: msg.created_at, image_url: msg.image_url,
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
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setMessages(prev => prev.map(m =>
          m.id === updated.id
            ? { ...m, text: updated.text, image_url: updated.image_url, read_by: updated.read_by || null }
            : m
        ));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        const deleted = payload.old as any;
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [channelId, userId]);

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

  const sendMessage = useCallback(async () => {
    const hasText = newMessage.trim().length > 0;
    if ((!hasText && !pendingImage) || !channelId || !userId || !activeGroup || sending) return;

    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const text = newMessage.trim();
    const img = pendingImage;
    setNewMessage('');
    setPendingImage(null);

    let imageUrl: string | null = null;
    if (img) {
      imageUrl = await uploadChatImage(img.uri, img.mime, activeGroup.groupId);
      if (!imageUrl) {
        Alert.alert('Erro', 'Nao foi possivel enviar a imagem');
        setNewMessage(text);
        setPendingImage(img);
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
      },
    });

    if (result.success && !result.queued) {
      notifyAction('chat_message_sent', activeGroup.groupId, { text: text || '[imagem]' });
    } else if (!result.success && !result.queued) {
      setNewMessage(text);
      setPendingImage(img);
    }

    setSending(false);
  }, [newMessage, pendingImage, channelId, userId, activeGroup, sending]);

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
        <View style={{
          maxWidth: '78%',
          backgroundColor: isMe ? colors.brand : colors.bgElevated,
          borderRadius: radius.lg,
          borderTopRightRadius: isMe ? 4 : radius.lg,
          borderTopLeftRadius: isMe ? radius.lg : 4,
          padding: hasImage && !hasText ? 4 : spacing.md,
          ...(!isMe ? shadows.sm : {}),
        }}>
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
        </View>
      </View>
    );
  }, [userId]);

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
            renderItem={({ item: c }) => {
              const active = c.id === channelId;
              const childLetter = c.child_name?.charAt(0).toUpperCase() || '';
              const displayLabel = c.channel_type === 'child' && c.child_name ? c.child_name : c.name;
              return (
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace(`/chat/${c.id}`); }}
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
            onChangeText={setNewMessage}
            placeholder="Mensagem..."
            placeholderTextColor={colors.textDim}
            multiline
            style={{
              fontSize: font.sizes.md,
              color: colors.text,
              maxHeight: 80,
            }}
          />
        </View>
        <TouchableOpacity
          onPress={sendMessage}
          disabled={(!newMessage.trim() && !pendingImage) || sending}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: (newMessage.trim() || pendingImage) ? colors.brand : colors.borderLight,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color={(newMessage.trim() || pendingImage) ? '#fff' : colors.textDim} />}
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
