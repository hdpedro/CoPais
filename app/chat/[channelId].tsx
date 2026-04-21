import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Message {
  id: string;
  text: string;
  sender_id: string;
  senderName: string;
  created_at: string;
  image_url: string | null;
  reply_to_id: string | null;
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
  const flatListRef = useRef<FlatList>(null);
  const membersRef = useRef<Record<string, string>>({});

  // Load channel info + members + messages
  useEffect(() => {
    if (!channelId || !activeGroup) return;

    async function load() {
      // Channel name
      const { data: ch } = await supabase
        .from('chat_channels')
        .select('name')
        .eq('id', channelId)
        .single();
      if (ch) setChannelName(ch.name);

      // Members for name lookup
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, profiles(full_name)')
        .eq('group_id', activeGroup!.groupId);
      const memberMap: Record<string, string> = {};
      (members || []).forEach((m: any) => {
        memberMap[m.user_id] = getDisplayName(m.profiles?.full_name);
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
            created_at: msg.created_at, image_url: msg.image_url, reply_to_id: msg.reply_to_id,
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
          m.id === updated.id ? { ...m, text: updated.text, image_url: updated.image_url } : m
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

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !channelId || !userId || !activeGroup || sending) return;

    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const text = newMessage.trim();
    setNewMessage('');

    const result = await safeWrite({
      table: 'chat_messages',
      operation: 'insert',
      payload: { group_id: activeGroup.groupId, channel_id: channelId, sender_id: userId, text },
    });

    if (result.success && !result.queued) {
      notifyAction('chat_message_sent', activeGroup.groupId, { text });
    } else if (!result.success && !result.queued) {
      setNewMessage(text); // Restore message on failure
    }

    setSending(false);
  }, [newMessage, channelId, userId, activeGroup, sending]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.sender_id === userId;
    return (
      <View style={{
        alignItems: isMe ? 'flex-end' : 'flex-start',
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}>
        {!isMe ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2, marginLeft: spacing.xs }}>
            {item.senderName}
          </Text>
        ) : null}
        <View style={{
          maxWidth: '78%',
          backgroundColor: isMe ? colors.brand : colors.bgElevated,
          borderRadius: radius.lg,
          borderTopRightRadius: isMe ? 4 : radius.lg,
          borderTopLeftRadius: isMe ? radius.lg : 4,
          padding: spacing.md,
          ...(!isMe ? shadows.sm : {}),
        }}>
          <Text style={{
            fontSize: font.sizes.md,
            color: isMe ? '#fff' : colors.text,
            lineHeight: 20,
          }}>
            {item.text}
          </Text>
          <Text style={{
            fontSize: 9,
            color: isMe ? 'rgba(255,255,255,0.6)' : colors.textDim,
            textAlign: 'right',
            marginTop: 4,
          }}>
            {formatTime(item.created_at)}
          </Text>
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
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          {channelName}
        </Text>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

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
          disabled={!newMessage.trim() || sending}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: newMessage.trim() ? colors.brand : colors.borderLight,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          <Ionicons name="send" size={18} color={newMessage.trim() ? '#fff' : colors.textDim} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
