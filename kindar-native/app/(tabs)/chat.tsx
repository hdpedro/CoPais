/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from 'src/lib/supabase';
import { apiFetch } from 'src/lib/api-fetch';
import { useAuth } from 'src/store/auth';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Channel {
  id: string;
  slug: string;
  name: string;
  channel_type: string;
  icon: string | null;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: number;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!activeGroup || !userId) return;
    const groupId = activeGroup.groupId;

    try {
      // 3 parallel queries: channels, reads, children. Mirrors PWA
      // `chat/page.tsx:getChannels` so we can auto-create the default
      // "geral" channel + per-child channels when the user opens chat
      // in a brand-new group for the first time.
      const [{ data: rawChannels }, { data: reads }, { data: kids }] = await Promise.all([
        supabase
          .from('chat_channels')
          .select('id, slug, name, channel_type, icon, sort_order')
          .eq('group_id', groupId)
          .order('sort_order'),
        supabase
          .from('chat_channel_reads')
          .select('channel_id, last_read_at')
          .eq('user_id', userId),
        supabase
          .from('children')
          .select('id, full_name')
          .eq('group_id', groupId),
      ]);

      let channels: any[] = rawChannels || [];

      // Auto-create channels via server (Wave H): RLS on chat_channels is
      // member-only INSERT, but admin client gives consistent sort_order
      // and matches PWA's first-load seed pattern. The endpoint is idempotent.
      const childSlugs = new Set((kids || []).map((c: any) => `child-${c.id}`));
      const existingSlugs = new Set(channels.map((c: any) => c.slug));
      const missingGeral = !existingSlugs.has('geral');
      const missingChildSlugs = [...childSlugs].some((s) => !existingSlugs.has(s));
      if (missingGeral || missingChildSlugs) {
        const r = await apiFetch<{ success: boolean; created: number }>('/api/chat/seed-channels', {
          method: 'POST',
          body: { groupId },
        });
        if (r.ok) {
          const { data: refreshed } = await supabase
            .from('chat_channels')
            .select('id, slug, name, channel_type, icon, sort_order')
            .eq('group_id', groupId)
            .order('sort_order');
          if (refreshed) channels = refreshed;
        }
      }

      const channelData = channels;
      if (!channelData) return;

      // Build read timestamp map
      const readMap: Record<string, string> = {};
      (reads || []).forEach((r: any) => { readMap[r.channel_id] = r.last_read_at; });

      // Fetch last message per channel in ONE batch (rpc or limited parallel)
      // Use parallel but bounded (same as PWA page.tsx pattern)
      const channelsWithMessages = await Promise.all(
        channelData.map(async (ch: any) => {
          const { data: msgs } = await supabase
            .from('chat_messages')
            .select('text, created_at, sender_id')
            .eq('channel_id', ch.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const lastMsg = msgs?.[0];
          const lastRead = readMap[ch.id];
          // Unread if last message is newer than last read, and not by current user
          const isUnread = lastMsg && lastMsg.sender_id !== userId &&
            (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead));

          return {
            id: ch.id,
            slug: ch.slug,
            name: ch.name,
            channel_type: ch.channel_type,
            icon: ch.icon,
            lastMessage: lastMsg?.text?.slice(0, 60) || '',
            lastMessageAt: lastMsg?.created_at || '',
            unread: isUnread ? 1 : 0,
          } as Channel;
        })
      );

      setChannels(channelsWithMessages);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [activeGroup, userId]);

  useFocusEffect(useCallback(() => { loadChannels(); }, [loadChannels]));

  // Realtime: refresh the channel list whenever any chat_message in this
  // group is INSERTed. Mirrors PWA `ChatRoom.tsx:403-410` which subscribes
  // by `group_id` so unread badges on inactive channels update live.
  useEffect(() => {
    if (!activeGroup) return;
    const ch = supabase
      .channel(`chat-list:${activeGroup.groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `group_id=eq.${activeGroup.groupId}`,
        },
        () => loadChannels(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeGroup, loadChannels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadChannels();
    setRefreshing(false);
  }, [loadChannels]);

  const getChannelIcon = (ch: Channel) => {
    if (ch.icon) return ch.icon;
    if (ch.channel_type === 'general') return '💬';
    if (ch.channel_type === 'child') return '👶';
    return '📝';
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][d.getDay()];
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
            Chat
          </Text>
        </View>

        {/* Channel List */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          {loading ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: spacing['4xl'] }}>
              Carregando canais...
            </Text>
          ) : channels.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: spacing['4xl'] }}>
              Nenhum canal disponivel
            </Text>
          ) : (
            channels.map((ch, i) => (
              <Animated.View key={ch.id} entering={FadeInDown.delay(i * 50).duration(300)}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/chat/${ch.id}`);
                  }}
                  activeOpacity={0.7}
                  testID={`chat-channel-${ch.id}`}
                  accessibilityLabel={`Abrir canal ${ch.name}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                    padding: spacing.lg, marginBottom: spacing.sm,
                    ...shadows.sm,
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: colors.brandLight,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 20 }}>{getChannelIcon(ch)}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{
                        fontSize: font.sizes.md,
                        fontWeight: ch.unread > 0 ? font.weights.bold : font.weights.medium,
                        color: colors.text,
                      }}>
                        {ch.name}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {formatTime(ch.lastMessageAt || '')}
                      </Text>
                    </View>
                    {ch.lastMessage ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: font.sizes.sm,
                          color: ch.unread > 0 ? colors.text : colors.textSecondary,
                          fontWeight: ch.unread > 0 ? font.weights.medium : font.weights.normal,
                          marginTop: 2,
                        }}
                      >
                        {ch.lastMessage}
                      </Text>
                    ) : null}
                  </View>

                  {ch.unread > 0 ? (
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: colors.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{ch.unread}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
